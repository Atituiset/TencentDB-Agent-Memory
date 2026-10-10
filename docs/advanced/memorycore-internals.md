# MemoryCore 内幕：存储与网关

MemoryCore 是全系统的数据权威。本章从存储抽象讲到 Gateway 鉴权，覆盖阅读其源码所需的全部背景。

## 存储抽象：一套接口，两种后端

`src/core/store/` 下有一层存储工厂（`factory.ts`），按配置把记忆读写路由到不同实现：

- **SQLite 路径**（默认，standalone）：单文件数据库。元数据与记录在常规表中；检索靠 **FTS5**（全文，配合 jieba 中文分词；jieba 缺失时退化为正则切词）+ **sqlite-vec**（向量余弦相似度）。sqlite-vec 加载失败时整个向量路降级为 no-op，只剩关键词召回。
- **TCVDB 路径**（腾讯云向量数据库）：面向规模化部署。集合命名带实例前缀（如 `{db}_profiles`、`{db}_skills`）；最大优势是**服务端原生混合检索**——dense + sparse + RRFRerank 在一次 API 调用内完成（`tcvdb.ts:1027` 附近可见 `rerank: { method: "rrf", k: 60 }`），省去客户端融合。

Embedding 是可选项：未配置 OpenAI-compatible Embedding API 时，系统纯 BM25 运行；配置后自动启用双路。

管理面的元数据存储同样有双后端：SQLite 的 `meta_users / _user_keys / _teams / _team_members / _agents / _tasks / _task_agents / _participation_logs / _assets / _agent_fixed_assets / _asset_acl / _config_params` 系列表，或 MongoDB（`store/sqlite-adapter.ts` vs `mongodb-adapter.ts`，按 `{prefix}_{instance_id}` 隔离）。

大对象（L2/L3 Markdown 产物、Skill 资源文件、生成日志）走文件系统或 COS offload，数据库里只登记元数据行。

## 三层鉴权

Gateway（`src/gateway/server.ts`，Node 原生 http 服务，:8420）的请求要过三道身份检查，各自回答不同的问题：

```text
Authorization: Bearer <apiKey>        ← 第一层：调用方是否被允许访问这个 Gateway
x-tdai-service-id: <instance>         ← 第二层：操作哪个 Memory 实例（数据隔离）
x-tdai-user-key: <sk-mem-...>         ← 第三层（管理面）：代表哪个用户行事
```

第一层的 Bearer Key 由 `TDAI_GATEWAY_API_KEY` 配置；本地回环监听且未设置时可省略。第二层是强制的——所有业务请求都必须声明实例。第三层用于 `/v3/meta/*` 管理面，Gateway 会校验 user_key 并以解析出的用户身份做 owner/ACL 权威判定。

## v2 与 v3：两代 API 的关系

| 前缀 | 定位 |
| --- | --- |
| `/capture` `/recall` `/search/*` | 早期兼容接口，保留 |
| `/v2/conversation|atomic|scenario|core/*` | L0-L3 数据面 v1 代，稳定 |
| `/v3/conversation|atomic|scenario|core/*` | **强隔离数据面，推荐新接入使用** |
| `/v3/skill/*` | Skill 管理/检索/版本/抽取 |
| `/v3/meta/*` | User/Team/Agent/Task/Asset/ACL 管理面 |
| `/v3/knowledge/*` | 知识资产元数据登记 |
| `/v3/memory-prompt/*`、`/v3/memory-generation-log/*` | 自定义 Prompt 与溯源 |

v3 的核心变化是把隔离从"可选习惯"升级为"协议强制"：L0/L1 写入必须带 `team_id + agent_id + user_id + session_id` 四元组（缺 session 报 422），L2/L3 至少三元组；参数可放请求体或对应的 `x-tdai-*` Header。SDK 层面同样体现为构造函数强制三元组（见 [SDK 章](./sdk-guide.md)）。

路由组织上，v2 在 `gateway/v2-router.ts`，v3 分散在各业务 handler（`chat-memory-handlers.ts`、`skill-handlers.ts` 等）+ `metadata/router/v3-meta-router.ts`。

## 双部署形态：standalone 与 service

这是理解 MemoryCore 源码最重要的分叉。`deployMode` 决定一切有状态的东西放在哪：

| 维度 | standalone | service |
| --- | --- | --- |
| 任务队列 | 进程内 Map + checkpoint 文件 | Redis Stream |
| 定时器 | `setTimeout` / `setInterval` | 16 分片的 Timer ZSET（Lua 认领任务） |
| 并发控制 | 进程内信号量 | 分布式锁 `pipeline:{inst:tid:aid}[:s:sess]` |
| 存储 | 本地 SQLite + 本地目录/COS | per-instance VDB/COS/MetadataService（按 `x-tdai-service-id` 动态解析） |

关键代码：`utils/pipeline-manager.ts`（standalone）vs `utils/stateful-pipeline-manager.ts`（service），由 `pipeline-factory.ts` 组装。**两态共享同一套 handler 和 executor**——业务逻辑只写一遍，差异全部收敛在状态管理层。这就是为什么单机体验和生产扩展可以共用同一份代码。

## 幂等与可追溯的实现纪律

翻源码时会反复遇到这几条纪律：

- **upsert 写入**：所有记录按 `record_id` 幂等写入，重复提交不产生脏数据；
- **乐观锁**：Skill 更新携带 `expected_version`，并发修改冲突直接报错而不是静默覆盖；
- **只追加审计**：对记忆的修改写 `memory_audit` 表，不覆盖历史；
- **JSONL append 带 ETag/位置校验**：对象存储上的追加写会先验证当前内容指纹。

这些纪律共同保证了一个性质：任何一条记忆的当前状态，都可以沿着 Generation Log 与 Audit 记录还原出完整的来龙去脉。

## 配置系统

Gateway 配置按优先级加载：`TDAI_GATEWAY_CONFIG` 指定的 YAML/JSON → 当前目录 → 数据目录 → 环境变量 → 内置默认值。YAML 支持 `${VAR}` 形式引用环境变量。常用模板三份：

- `tdai-gateway.standalone.yaml`：最小单机 Memory 配置；
- `tdai-gateway.yaml`：Standalone + Skill 默认配置；
- `tdai-gateway.proxy.yaml`：经 OpenAI-compatible Proxy 调用模型。

关键配置段（`src/config.ts`）：`pipeline.everyNConversations`（默认 5）、`recall.scoreThreshold`（默认 0.3）、`llm.*`（模型三件套）、`skill.*`（Skill 模块开关）。完整环境变量清单见附录[环境变量速查](../appendix/env-vars.md)。
