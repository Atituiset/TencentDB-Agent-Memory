# MemoryPanel 内幕：管控面架构

Panel 的自我定位非常克制：**无状态的控制台**——不保存服务端登录会话、不维护本地用户库，业务数据全部由外部服务持久化。它做的只有三件事：校验调用方凭证并转发授权请求、聚合多源元数据、管理资产分配与绑定。

## 六边形架构：kernel 端口与适配器

后端按六边形（端口-适配器）组织，`src/panel/` 下：

```text
config/    配置加载 + 实例注册表
domain/    领域类型与规则（entities / chat-memory-governance / asset-id）
http/      Hono 应用、中间件、路由（对外 API 面）
kernel/
  ports/     KernelHttpPort · MetaKernelPort · SkillKernelPort · KnowledgeClientPort
  adapters/  fetch-* 实现：组装凭证头、日志脱敏、超时映射
startup/   启动任务（如 ensure-knowledge-llm-binding）
state/     内存态（knowledge 任务表、ingest 进度）
```

`FetchKernelHttpAdapter` 是理解 Panel 行为的关键：

- 组装 `Authorization: Bearer <api_key>` + `x-tdai-service-id` + 可选 `x-tdai-user-key` + `x-request-id`；
- **日志脱敏**：password/api_key/token/user_key 等敏感字段打码，字段截断 300 字符、JSON 截断 1200 字符；
- AbortController 超时 15s，超时映射 504、网络错映射 502，统一包装为 `KERNEL_TIMEOUT/KERNEL_UNAVAILABLE` 信封。

凭证上下文每次请求由中间件从 Header + 注册表拼出 `MetaCallContext`。Panel 自己不做权限判定，而是把 caller 的 user_key 原样透传给内核——**内核才是权威的权限裁判**。

## 实例注册表

`config/metadata-instances.json`（gitignore，仓库只留 example）描述 Panel 可连接的 Memory 实例：

| 字段 | 必填 | 含义 |
|---|---|---|
| `id` | 是 | = `x-tdai-service-id`；本地常用 `default` |
| `name` | 是 | 登录页展示名（唯一对外暴露的字段） |
| `gateway_endpoint` | 是 | Panel → 内核转发地址，**不能指 Proxy** |
| `proxy_endpoint` | 否 | 仅用于 UI 展示客户端接入地址卡片 |
| `api_key` | 是 | Gateway Bearer，仅服务端使用，绝不下发浏览器 |

zod schema 校验在 `src/panel/config/instance-registry.ts`；未命中的实例 ID 返回 400 `INVALID_INSTANCE`。

## API 面：白名单代理 + 聚合路由

公开入口统一 `/api/v1`，全部 POST，响应统一信封 `{code, message, request_id, data}`：

**元数据代理**（`routes/meta/proxy.ts`）：把 `POST /meta/{action}` 转发到内核 `/v3/meta/{action}`，但只放行白名单里的 55 条 action。附加了三层业务逻辑：create 类 action 先查重（重复名返回中文 409）；`team-member/add` 成功后异步给默认 Agent 导入预置 Skill（冷启动优化）；user/list 过滤隐藏内部记账用户 `knowledge-service`。

**Chat Memory 聚合路由**（`routes/chat-memory.ts`，约 2000 行，全项目最复杂的单文件）：围绕"团队资产/固定资产/我的资产"三视图提供 team-assets、agent-fixed、mine、allocate、set-agent-fixed、unbind、layer（L0-L3 分层懒加载，分别调数据面四层接口，支持 before_ts 游标分页）、import（历史对话导入）、search 等。读权限由 `authorizeChatMemoryRead` 统一：owner ∨ team 共享且是成员 ∨ 借入方。

**消除 N+1 的专用端点**：`task/list-with-agents`（一次 task 列表 + 分批并行 task-agent 查询）、`agent-overview/bootstrap`（Agent 编辑弹窗一次拉齐四类资产池 + skill 归属统计）——都是为前端体验专门设计的批量接口。

**Knowledge 工坊路由**：wiki/code-graph 的 list/create/ingest/delete/search/graph 等透传 KS；create 时幂等登记 meta_asset；`status-callback` 接收 KS 的 S2S 回调（不挂浏览器 header 校验），ready 时写资产明细、failed 不写。

## 角色模型的实现细节

前端判定逻辑集中在 `web/src/services/permissions.ts` 与 `backendStore.ts`：

- System Admin 看 `auth/verify` 返回的 `user.user_type === 'system_admin'`，是全局角色；
- Team 内角色查 `roleInTeam()`——即 members 表记录的 `admin | member | reviewer`；
- 判定顺序铁律：先判全局 admin 再查成员表；team owner 若不在 members 数组里按 member 兜底而非 admin（因为 UI 里 admin 语义是全局 admin，会被资源锁锁住页面）；
- `canManageAsset`：admin 无全局资源特权，只能操作自己 owner 的资产；team admin 管本 team 资产。

后端侧 Panel 不自行判角色——一切 owner/ACL 校验由内核完成，Panel 只是忠实透传并展示内核的裁决。

## Loadout 编辑的实现

Agent 编辑弹窗（`web/src/pages/team/components/AgentEditDialog.tsx` + `useAgentAssets.ts`）的数据来自 `/agent-overview/bootstrap`：

- Wiki/CodeGraph：allocate/unbind 增量 diff；
- Chat Memory：`setAgentFixed` 全量覆盖式同步（不含 Agent 自有记忆）；
- Skill：只读展示 fork 结果（fork 才是装配机制，见[资产体系](../panorama/asset-system.md)）。

解绑时的防御性细节：禁止解绑 auto-mint 的自有记忆（`chat_memory-{team}-{agent}`）；顺带清理 `canBindAsset=false` 的脏绑定；借入绑定受 ≤2 条上限约束（`MAX_IMPORTED_AGENTS`）。

## 启动任务：ensure-knowledge-llm-binding

启动时 best-effort 执行（`startup/ensure-knowledge-llm-binding.ts`）：为每个实例确保 KS 有一个隐藏记账用户 `knowledge-service` 的 LLM 绑定——已有 key 只刷新 proxy_base_url；没有则走 Gateway mint 用户和 key 后推给 KS 的 `/v3/internal/llm-binding/set`。这保证了 Wiki 生成的成本总能归账到具体实例。
