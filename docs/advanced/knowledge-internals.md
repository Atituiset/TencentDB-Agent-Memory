# MemoryKnowledge 内幕：Wiki 引擎与 CodeGraph

Knowledge Service（KS）负责把"文档和代码"变成 Agent 可用的记忆。它基于 Hono，默认端口 8421，API 前缀 `/v3`。

## Wiki 引擎：ingest 流水线

一次 Wiki ingest 的完整旅程：

```text
上传/拉取文档 ──► realWikiWorker ──► LLM 逐页抽取结构化页面
                                        │
                          mergePage 合并去重（单页失败不影响其他页）
                                        ▼
              每 wiki 独立的 index.db（FTS5 全文 + 链接图谱）
```

几个关键实现细节：

- **每 wiki 独立 index.db**：不是一个大库。读取走 LRU 池复用连接，写入用独立事务连接——单个 wiki 的构建不会拖累其他 wiki 的查询。
- **mergePage**：新抽取的页面与已有页面做 LLM 辅助合并决策（更新、新建或跳过），重复 ingest 同一批文档不会产生重复页面。
- **run_id 代际机制**：每次 ingest 有唯一 run_id，进度回调和终态回调都携带它——Panel 用它拒绝 clear 操作之后的迟到包，避免旧任务的进度污染新状态。
- **自动摘要**：构建完成时生成 wiki 摘要（LLM 生成）随终态回调返回，Panel 直接展示。

## CodeGraph：代码的图索引

```text
git clone ──► CodeGraph 索引（符号/文件树/调用关系）──► 探索查询
```

KS 通过 bridge 调用 CodeGraph 引擎（该项目复用了开源项目 [colbymchenry/codegraph](https://github.com/colbymchenry/codegraph) 的实现）。对外暴露八类查询：

`code_search / explore / callers / callees / impact / node / status / files`

其中 `impact` 是最有价值的一个：改代码前先查影响路径，这是文本检索永远给不了的能力。

### Auto-Sync 调度器

可选功能（`KNOWLEDGE_AUTO_SYNC_ENABLED=true` 显式开启），实现在 `src/store/auto-sync-scheduler.ts`：

- **FIFO 内存队列 + 定长常驻 worker pool**；worker 数 `KNOWLEDGE_AUTO_SYNC_MAX_CONCURRENT` 默认 3（clamp 1–20），扫描周期默认 10 分钟（clamp 1–60）；
- 启动后延迟 30 秒首扫（让启动恢复流程先完成，避免抢磁盘）；
- 只扫 `status=ready` 的 code-graph；`inFlight Set` 去重防重复入队；
- worker 循环取队列执行同步，异常一律吞掉保证不死；同步中的仓库再次入队会得到 `busy`（对应 HTTP 409）。

## Tools 协议：Agent 如何发现并调用知识

KS 的核心创新点之一是把知识查询做成**自发现协议**：

```text
POST /v3/tools/list   → 返回可用工具清单（名称/描述/参数 schema）
POST /v3/tools/call   → 执行具体工具调用
```

Proxy 把这个协议渲染进 `<knowledge_tools>` 注入块：模型先 list 发现自己有哪些知识工具，再按需 call 读取相关页面、源码或影响路径。这就是"知识不整库注入，而是按需调用"的落地形态——平时知识只是可用的工具，真正需要时才进入上下文。

## llm_binding：谁为 Wiki 生成的 token 买单

Wiki 抽取要烧 LLM token，这笔账必须算清楚。KS 用一张小表（`store/llm-binding-store.ts`）按 service_id 记录 LLM 绑定：

| 绑定状态 | 生效配置 |
| --- | --- |
| `proxy` 且配置齐全 | `{proxy_base_url}/proxy/{service_id}/v1` —— 走 Proxy 以专用 knowledge-service 记账用户计费 |
| `byo` 且配置齐全 | 用户自带 OpenAI 兼容端点直连 |
| 无绑定/缺参 | 由全局 `LLM_MODE` 决定；proxy 模式下**刻意抛错而非静默直连** |

最后一条是刻意的工程决策：宁可启动失败也不静默兜底，强制 proxy 绑定链路被真正验证而不是掩盖 bug。另一个细节：binding 只覆写 endpoint/key，**model 永远来自全局 `LLM_MODEL`**——单一真相源，不存 per-instance model。

控制面接口在 `/v3/internal/llm-binding/*`（set/status/list），幂等 upsert——重发即覆写，这就是 Panel 启动时推送绑定的重绑机制。永不回显 api_key。

## 与 Panel 的回调协作

```text
ingest_progress（流式）──► Panel /api/v1/knowledge/status-callback
status ready/failed（终态）──► 同上（含 auto summary + sync_error + run_id）
```

进度回调 fire-and-forget 且节流；终态失败重试 1 次（间隔 1s，5s 超时）后放弃，绝不阻塞主任务；`TMC_CALLBACK_URL` 为空则整体 no-op。Panel 收到 ready 后写内核资产明细并以 stash 的 owner 身份登记 meta_asset。

## MCP stdio 通道

对支持 MCP 的宿主，KS 提供等价的 stdio 入口（`bin/mcp.mjs` → `dist/mcp/server.js`）。它是纯协议翻译层：`ListTools` 返回静态注册的 12 个工具（code-graph 8 个 + wiki 4 个），`CallTool` 按工具声明的 endpoint POST 回本机 HTTP API。管理操作刻意不暴露为 MCP 工具。

## 可选埋点

- **ClickHouse 工具调用日志**（`KNOWLEDGE_CLICKHOUSE_ENABLED=true`）：`POST /v3/tools/call` 写入 `tool_call_logs` 表，请求正文递归脱敏并截断到 512 bytes；建表/批写失败均不阻断业务；
- **Langfuse**：配 `LANGFUSE_PUBLIC_KEY/SECRET_KEY` 后上报 Wiki LLM 调用 trace；未配置时整体关闭。
