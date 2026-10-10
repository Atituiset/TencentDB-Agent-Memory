# 一次请求的完整旅程

架构图是静态的，系统真正的性格体现在数据流动上。本章跟随一次典型的 Claude Code 会话，看数据如何在四个服务之间穿行——先看"去程"（请求如何被增强），再看"回程"（对话如何变成记忆），最后看旁路的异步管线。

## 去程：一次被增强的 LLM 调用

假设你已经在面板上建好了 Team、Agent 和 Task，并按 `ANTHROPIC_BASE_URL=http://127.0.0.1:8096/claude-code/default` 启动了 Claude Code。当你发出第一句话：

**① 鉴权。** Proxy 收到 `POST /claude-code/default/v1/messages`，取出 `x-tdai-user-key`（即你的 `sk-mem-...`），调用 MemoryCore 的 `POST /v3/meta/auth/verify` 反查出 `user_id`。此后全链路以这个用户身份行事。

**② 会话初始化（仅首次）。** Proxy 发现这是新会话，把请求暂存，向 Claude Code 返回一个 `AskUserQuestion` 工具调用——在终端里呈现为三连问：选 Team → 选 Agent → 选 Task（可跳过）。选择结果与 session 绑定后持久化；同一进程内的后续轮次不再询问。

**③ 注入。** 确定绑定后，注入管线开始组装 system prompt 的附加内容：

```text
<tdai_profile_memory>   ← Agent 的 L2 场景块 + L3 画像（读自 Core）
<cloud_skills>          ← 与当前问题相关的 Skill 摘要（RAG 检索）
<skill_tools>           ← 如何通过工具读写 Skill 的说明
<knowledge_tools>       ← 该 Agent 绑定的 Wiki/CodeGraph 两步自发现协议
<session_context>       ← 本次会话绑定的 agent/task 信息
```

L0/L1 刻意不在其中——它们以 `<tdai_memory_tools>` 只读工具的形式存在，让模型在需要时主动查询，避免每轮变化的检索结果击穿上游 KV cache。

**④ 限流与转发。** 按 `spaceId × 最终模型` 做 60 秒滑动窗口限流后，请求原样转发到 `.env` 里配置的上游 LLM。

## 回程：对话变成记忆

上游返回后，Proxy 在响应流结束的瞬间触发两个异步动作：

**Skill 归档回流**：本轮对话切片被发送到 MemoryCore 的 `/v3/skill/conversation/add`——进入 Skill 抽取的对话缓冲区，供后台判断"这是否包含一条值得沉淀的可复用方法"。

**L0 写入**：完整对话写入 MemoryCore 的 L0 存储。到此为止，用户的等待时间几乎没有增加——所有重活都在后台。

## 旁路：异步提炼管线

MemoryCore 内部，Pipeline Scanner 注意到某会话的新增轮数达到阈值（默认 5 轮，冷启动预热期更快），把任务投给 Pipeline Worker：

1. **L1 抽取**：LLM 读对话片段，产出原子记忆条目（事实/偏好/约束/事件），并与已有条目做去重合并；
2. **L2 归纳**：满足条件时，相关 L1 被归纳为场景块（Scene Markdown），挂到对应 Agent 的 Profile 下；
3. **L3 更新**：跨场景的稳定模式最终汇入长期画像（Persona）。

每次生成都会写一条 Generation Log（用了哪个 Prompt、什么版本、输入输出引用），面板里可以按 Memory ID 精确溯源。

与此同时，如果这轮对话触发了 Skill 抽取判定，一条新 Skill 进入待审状态——它有版本号、资源文件和验证规则，等你在面板上审核后分享给团队。

## 知识资产的旁路循环

Wiki 和 CodeGraph 有自己独立的生命周期。你在面板上传一批文档或登记一个 Git 仓库后：

```text
Panel ──► Knowledge Service ──► 异步构建（LLM 抽取 / clone+索引）
   ▲                               │
   └──── status-callback ──────────┘
         （ready/failed + 进度事件 + 自动摘要）
```

构建完成后 Panel 写回资产元数据，资产即可被绑定到 Agent。之后文档更新可以重新 ingest，代码仓库可由 Auto-Sync 定期拉取重建。

## 观察这个循环

跑通之后，有三个地方能直观看到这套循环在工作：

- 面板 **Chat Memory** 页：L0 对话被切分的场景逐步出现；
- **Agent 详情 → Profile**：L2 scene 与 L3 persona 在累积；
- `curl http://localhost:8420/health | jq .services.pipelineWorker`：`tasksConsumed/tasksCompleted` 随对话增长。

这就是 README 里那句话的含义："没有 Memory，Loop 可能只是更快地重复。能继承记忆，每一轮才有机会比上一轮更好。"——整个系统的本质，就是把这条循环自动化。
