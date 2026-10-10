# 组件巡礼：Core、Knowledge、Panel、Proxy

## MemoryCore：记忆与元数据核心

MemoryCore 统一存储并提供三类数据能力：

- **Memory**：L0 对话、L1 原子记忆、L2 场景记忆和 L3 核心画像的存储、生成与召回；
- **Knowledge 元信息**：Wiki、CodeGraph 等知识源的标识、类型、状态与关联关系（注意：只存元信息，不存内容——内容解析在 Knowledge Service）；
- **资产管理元信息**：User、Team、Agent、Task、Skill、Knowledge Asset 及成员、归属、访问关系。

它以 Standalone Runtime 形态开源，默认监听 `127.0.0.1:8420`，使用 SQLite 与本地文件，进程内维护 Pipeline 状态。源码的主要版图：

```text
MemoryCore/src/
├── core/        L0–L3 记忆域模型、Skill 子系统、Prompt 模板、hooks
├── gateway/     HTTP Gateway、v2/v3 路由、各业务 handler
├── services/    Pipeline Scanner / Worker / 调度
├── metadata/    v3 管理面路由与服务（权限校验）
├── store/       SQLite / TCVDB 存储抽象、BM25、Embedding
├── utils/       Pipeline Manager（standalone/service 双形态）
├── openclaw-plugin/   OpenClaw 轻量 Adapter
└── hermes-plugin/     Hermes Memory Provider
```

对外 API 以 `/v3/*` 为推荐面（v2 兼容保留）。所有业务调用都必须携带 `x-tdai-service-id` 声明实例。

## MemoryKnowledge：知识引擎

Knowledge Service 是用户侧 Wiki + Code-Graph 引擎，基于 Hono 构建，API 前缀 `/v3`。它的四块核心能力：

| 能力 | 说明 |
| --- | --- |
| LLM-Wiki | 上传/拉取文档 → LLM 抽取结构化页面 → FTS5 全文检索 + 知识图谱 |
| Code-Graph | git clone 仓库 → CodeGraph 索引（符号、调用、文件树）→ 探索查询 |
| Auto-Sync | 可选：定时扫描 code-graph，FIFO 队列 + worker pool 自动拉取更新重建索引 |
| Tools 协议 | `POST /v3/tools/list`、`/v3/tools/call`，供 Agent 自发现调用 |

一个容易忽略但关键的机制是 **llm_binding**：生产链路中 Wiki 生成所用的 LLM 由 Panel 按 `x-tdai-service-id` 推送绑定（走 Proxy 计费），而不是 KS 自己配置——这样 Wiki 生成的成本可以归账到具体实例。ingest/sync 完成后，KS 会回调 Panel 写回远端元数据。

KS 还提供 MCP stdio 通道（12 个查询类工具），让支持 MCP 的宿主获得与 HTTP tools 等价的能力。

## MemoryPanel：团队记忆控制台

Team Memory Control 是**无状态的**管理控制台：不保存服务端登录会话、不维护本地用户库，业务数据全部由外部服务持久化。这个定位决定了它的架构——一个精致的"转发 + 聚合"层：

- **kernel 层**采用端口-适配器模式（六边形架构）：`MetaKernelPort`、`SkillKernelPort`、`KnowledgeClientPort` 等接口定义了对内核的全部依赖，fetch 实现负责组装凭证头、日志脱敏与超时映射；
- **实例注册表** `metadata-instances.json` 描述了 Panel 可连接的所有 Memory 实例（ID、Gateway 地址、API Key），真实文件不入库；
- **公开 API** 统一挂在 `/api/v1` 下，对元数据操作做白名单代理（55 条 action），对 Chat Memory 等复杂场景提供聚合路由（消除前端 N+1 请求）；
- **前端**是 React 18 + Zustand 的 SPA：工作台任务看板、Wiki 工坊、CodeGraph 工坊、Skill 库、Chat Memory 三视图、成员管理与 Agent 编辑。

安全上 Panel 有几条铁律：用户凭证 `user_key` 只经 Header 传递；注册表中的 `api_key` 仅服务端使用绝不下发浏览器；提交前跑 `secret-scan.sh`。

## MemoryProxy：透明 LLM 代理

Proxy 是整个体系里"魔法"最集中的地方——也是设计上最克制的地方。克制在于：**它对协议零修改**，OpenAI `/v1/chat/completions` 和 Anthropic `/v1/messages` 原样转发；魔法在于转发前后的一进一出里完成了八件事：

```text
POST /proxy/<spaceId>/v1/chat/completions | /v1/messages
   ├─ 1. auth ─────── 校验 x-tdai-user-key，解析出 user_id
   ├─ 2. systemUser ─ 命中内部账号则短路透传
   ├─ 3. sessionInit ─ 首次对话弹表单：team → agent → task
   ├─ 4. injection ── system prompt 注入 skill / knowledge / memory
   ├─ 5. rateLimit ── spaceId × 最终模型 TPM/QPM 限流
   ├─ 6. forward ──── 转发到上游 LLM
   ├─ 7. extract ──── 一轮结束后异步回流 conversation + L0
   └─ 8. report ───── ClickHouse / Langfuse / Opik / Credit 上报
```

支撑这些动作的子系统包括：五后端的统一存储抽象（cos/sqlite/fs/memory + redis）、按 agent name 覆盖上游的路由表、`mem:` 会话指令拦截、以及可选的一致性哈希负载均衡网关。进阶篇有专章拆解。

## SDK 与插件

**SDK**（TypeScript / Python）覆盖 v3 数据面与管理面的全部端点：

- `MemoryClient`：L0-L3 读写与检索，构造时强制三元组隔离；
- `SkillClient`：Skill 全生命周期 + 对话增量摄取；
- `MetadataClient`：约 60 个管理面方法；
- `MemoryPromptClient` / `MemoryGenerationLogClient`：自定义 Prompt 与生成溯源。

Python 版同时提供同步与异步客户端（httpx）。

**插件**示范了 Adapter 的标准姿势。OpenClaw 插件做三件事：`agent_end` 钩子捕获对话写 L0、`before_prompt_build` 钩子召回注入、暴露三个记忆查询工具。Hermes 插件是同一模式的 Python 映射，额外带 Gateway sidecar 进程监督与熔断。自研 Adapter 的完整指引见[编写自定义 Adapter](../advanced/custom-adapter.md)。
