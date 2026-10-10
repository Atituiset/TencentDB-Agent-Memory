# 编写自定义 Adapter

如果你的 Agent 框架既不被 Proxy 支持、也不适合直接用 SDK 硬编码，就需要写一个 Adapter。官方的两个插件——OpenClaw 插件（TypeScript）与 Hermes 插件（Python）——就是为此而生的参考实现。

## Adapter 三步曲

一个最小可用的 Adapter 只需要完成三件事：

1. **会话捕获（capture）**：会话结束或每轮完成后，把对话写入 L0；
2. **记忆召回（recall）**：构造 Prompt 前，召回 L1/L2/L3 并以有边界、可识别的方式注入上下文；
3. **工具暴露（tools，可选但推荐）**：把记忆搜索暴露为模型可主动调用的工具。

外加一条架构纪律：**Adapter 保持无状态**——不在插件进程内起 Gateway 子进程、不实现抽取逻辑；服务端是 L0 的权威存储，一切提炼交给 MemoryCore 的后台管线。

## 参考实现一：OpenClaw 插件

目录 `MemoryCore/openclaw-plugin/`，插件 ID `memory-tencentdb-client`，基于 npm TS SDK 构建。

**捕获**（`src/hooks/capture.ts`）：挂 `agent_end` 钩子，提取本轮 user/assistant 消息。工程细节值得借鉴：用 position slice + timestamp cursor 做去重（防止钩子重复触发导致重复写入）、还原被框架污染的原始 prompt、`sanitizeText/stripCodeBlocks` 过滤噪音后再写 L0。

**召回**（`src/hooks/recall.ts`）：挂 `before_prompt_build` 钩子，执行 `searchAtomic + readCore`（可选加 listScenarios 场景导航），格式化后注入带标签的简洁记忆上下文。`recall.maxResults/includePersona/includeSceneNav` 可配。

**工具**（`src/tools/`）三个：

- `tdai_memory_search`：L1 原子记忆搜索；
- `tdai_conversation_search`：L0 对话搜索；
- `tdai_read_cos`：经 COS STS 直读 Pipeline 产物（persona.md / scene_blocks/*.md）。

安装：仓库根目录跑 `bash MemoryCore/scripts/install-openclaw-plugin.sh`。连接参数三件套：

```text
TDAI_MEMORY_ENDPOINT=http://127.0.0.1:8420
TDAI_MEMORY_API_KEY=<与 Gateway 相同的 API Key>
TDAI_MEMORY_INSTANCE_ID=default
```

## 参考实现二：Hermes 插件

目录 `MemoryCore/hermes-plugin/memory/memory_tencentdb/`，同一模式的 Python 映射，额外多一层生产级可靠性设计，值得所有 sidecar 型集成学习：

- **Gateway Supervisor**（`supervisor.py`）：自动发现并以子进程拉起 Node Gateway sidecar，轮询 `/health` 确认就绪；
- **生命周期映射**：`prefetch(query)` → `POST /recall` 同步注入 `<memory-context>`；`sync_turn(user, assistant)` → `POST /capture` 后台 daemon 线程 fire-and-forget（最多 4 并发背压）；`shutdown/on_session_end` → `POST /session/end`；
- **熔断器**：连续 5 次失败暂停 60s，避免记忆服务故障拖垮主 agent；
- **诊断**：sidecar stderr tail 保留用于排障。

暴露两个 LLM 工具：`memory_tencentdb_memory_search` 与 `memory_tencentdb_conversation_search`。

## 什么时候选 Adapter 而不是 Proxy

| 场景 | 推荐 |
| --- | --- |
| 主流 coding agent，想零改动获得注入 | Proxy |
| 自研运行时，想完全控制注入时机与格式 | SDK 直连（Adapter 思路内嵌） |
| 框架有原生插件/Hook 机制 | Adapter |
| 只需要读记忆做分析，不需要回流 | SDK 只读即可 |

## 检查清单

交付自定义 Adapter 前逐项确认：

- [ ] 所有请求带 `x-tdai-service-id`（实例隔离）；
- [ ] v3 数据面调用携带完整三元组 + session_id（写路径强制）；
- [ ] 注入内容有明确边界标记（如 XML 标签），模型能区分"记忆"与"当前指令"；
- [ ] 召回结果限量限长，不挤占工作上下文；
- [ ] 记忆服务不可用时静默降级——主流程绝不因记忆故障中断；
- [ ] 不在 Adapter 本地落对话数据（服务端是唯一权威存储）；
- [ ] 凭证只从环境变量读取，不写入代码与配置仓库。
