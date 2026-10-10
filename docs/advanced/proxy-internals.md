# MemoryProxy 内幕：注入管线与会话初始化

Proxy 是四个组件里对延迟最敏感的——它卡在每一次 LLM 调用的关键路径上。因此它的所有设计都围绕两个目标：**注入要快且不破坏缓存**，**故障要不阻断转发**。

## 请求处理八阶段

一次带 `spaceId` 的主模型调用经过：

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

源码入口在 `src/index.ts` → `server.ts`，按协议分流到 `handler.ts`（OpenAI）、`anthropicHandler.ts`（Anthropic Messages）、`codexHandler.ts`（Responses）等。**系统用户短路透传**是第一阶段的重要出口：内部服务账号（如 Knowledge Service 用专用记账用户调 LLM）命中后跳过 session init 和注入，只做透明转发 + 计费——否则 Wiki 生成的请求也会被弹表单。

## 会话初始化：多客户端的状态机

sessionInit 要解决的问题是"把无状态的 HTTP 会话绑到 team/agent/task 三元组"，而难点在于每个客户端的交互能力不同。源码 `src/session/` 下按客户端分子模块（claude-code/codebuddy/codex/dsh/workbuddy），各自实现一套适配：

- **Claude Code**：借 CC 原生 `AskUserQuestion` 工具返回三连问；
- **CodeBuddy/WorkBuddy**：各自的追问工具；
- **Codex**：伪 function_call 表单（所以必须先切 Plan 模式，否则 agent 模式会自动执行掉）；
- **dsh**：原生 `ask_user_question` tool call，渲染为 Web UI 按钮；CLI headless 自动 bypass；
- **Hermes/OpenClaw**：不交互——`x-team-id/x-agent-id/x-task-id/x-conversation-id` 四 header 齐全时直接注册，缺了才尝试表单并最终 bypass。

状态存储在 ProxyStorage 中，key 按 `{spaceId}/{userId}/{agentSource}/{sessionId}` 组织。`headerAutoSelect.onMismatch: "form"` 等配置控制 header 与已有状态冲突时的行为。可选的 `sessionInit.defaultTaskId` 能在每个 team 的 Task 列表头部插入虚拟项"本次不关联任务"，解决"没建过 Task 卡流程"的问题。

## 注入管线：内容块与缓存哲学

注入器（`src/injection/injectors/`）产出这些 system prompt 块：

| 块 | 来源 | 内容 |
| --- | --- | --- |
| `<tdai_profile_memory>` | Core L2/L3 | Agent Profile 场景块 + Team/Global 记忆 |
| `<cloud_skills>` | Core Skill RAG | 与当前问题相关的 Skill 摘要 |
| `<skill_tools>` | Skill Bridge | 如何通过 curl 调用 Skill 工具的说明 |
| `<knowledge_tools>` | KS | 绑定的 Wiki/CodeGraph 两步自发现协议 |
| `<session_context>` | session 状态 | 本次绑定的 agent/task 信息 |
| `<asset_reflection>` | （可选） | `/analyse` marker 开启时的复盘指令 |

而 **L0/L1 刻意不内联注入**——它们通过 `<tdai_memory_tools>` 以只读工具形式暴露给模型主动查询。原因在前文反复出现：L0/L1 每轮变化，内联会击穿上游 KV cache；L2/L3 和工具说明相对静态，可以稳定占据 system prompt 尾部命中缓存。多节点部署时还必须配置 `injection.externalGatewayUrl` 并统一用 COS 后端，否则各实例缓存不一致同样导致 cache miss。

**失败哲学**：任何注入器失败都非致命——回退原始 body 继续转发，绝不让记忆系统的故障变成用户对话的故障。上报同理（三路可观测互相独立、error-silent），限流则 fail-open。

## 存储抽象与降级链

`src/storage/` 实现了 ProxyStorage 统一抽象，承载三类状态（`inj:*` 注入缓存、`sk:*` Skill 状态、`vpin:*` 版本 pin）。Key 布局：

```text
proxy_cache/{ttl|nottl}/{spaceId}/{userId}/{agentSource}/{sessionId}/...
```

`ttl/` 只放热缓存（可重建），`nottl/` 放 binding 等必须持久化的业务态。四种后端的选型：

| 后端 | 场景 |
| --- | --- |
| `cos` | 生产多实例部署（跨节点共享，仅 kernel-sts 凭证） |
| `sqlite` | 单实例本地开发/CI（内置 sweeper 定期清 ttl 桶） |
| `fs` | 离线/docker 兜底（交给外部 tmpwatch） |
| `memory` | 测试兜底（重启即失） |

降级链 `cos → sqlite → fs → memory`，任一 init 失败自动降级；`/health` 暴露 `storage.effective` 作为观测锚点。

## 限流与计费

- **Input TPM/QPM**：按 `spaceId × 最终模型` 在 Redis 上做 60 秒滑动窗口；`GET/PUT/DELETE /v3/admin/rate-limits` 动态调整；
- **Credit 计费**：上游响应完成后按定价表（`pricing.ts`）计算 CreditDelta 上报计费服务，仅识别路径带 `/proxy/<spaceId>/` 的请求；
- **用量明细**：JSONL 结构化日志 + ClickHouse 按 turn 记录 token 明细。

## 其他值得知道的机制

- **mem: 指令拦截**：见[专章](./mem-commands.md)；
- **Skill/Memory Bridge**：`/skill-bridge/**` 与 `/memory-bridge/**` 反向代理 Core 的 HTTP 工具，转发时注入 serviceToken——避免凭据出现在 LLM 可见的 prompt 里；
- **按 agent name 的上游覆盖**：`upstream.agents` 允许特定客户端走不同的上游（例如 claude-code 单独走 CCR）；
- **gateway/ 一致性哈希网关**：可选的多实例负载均衡层，按 keyId 做一致性哈希保证同一用户落在同一 proxy 实例（配合 COS 后端）；
- **`/analyse` marker**：URL 带 `/analyse/` 段时（双闸门：配置 `injection.assetReflection.markerOptIn=true` 且 URL 显式携带），system prompt 末尾追加资产反思块，让 LLM 在回答末尾逐工具自评"这次注入值不值"。定位是效果评估，不建议对线上流量默认打开。
