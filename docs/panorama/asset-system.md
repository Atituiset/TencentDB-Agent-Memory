# 资产体系与权限模型

如果说分层记忆模型解决的是"什么值得留下"，那么资产体系解决的是剩下两个问题：**谁可以使用**、**如何装配到正确的 Agent**。

## 一切皆资产

四类内容——Chat Memory、Skill、Wiki（`llm_wiki`）、CodeGraph（`code_graph`）——在管理面被统一登记为 Asset。每个资产记录：

- `asset_id` / `asset_type`
- **owner**（归属用户，自动拥有管理权）
- `team_id`（归属团队）
- **visibility**（可见性）
- 版本、状态与使用统计

统一建模的好处是权限逻辑只写一遍：无论是一段 Chat Memory 还是一个 CodeGraph，"谁能读、谁能管、能绑给谁"走的是同一套校验。

## 四级可见性

| 可见性 | 语义 |
| :--- | :--- |
| `private` | 只有 Owner 可读，团队管理员也不例外 |
| `team` | 团队成员可读，Owner/Admin 负责管理 |
| `restricted` | 通过 User / Role / Agent ACL 精确授权 |
| `agent` | 用于同团队 Agent 的定向装配 |

这套分级的设计哲学是：**新记忆和 Skill 默认私有，分享是一个明确动作，不是默认泄漏。** 你可以把"发布 Skill"配给 Release Agent，把"架构 Wiki"配给所有开发 Agent，把 CodeGraph 同时给 Coder 和 Reviewer——每一步授权都显式发生。

## 角色的两层结构

权限主体分两层，混为一谈会出很多"灵异问题"：

**全局层：System Admin。** 由用户记录的 `user_type === 'system_admin'` 标识，与是否加入任何 Team 无关。职责是管理用户与团队（建团队、录入成员）。v2.0.0 起 admin 也可使用 Wiki、CodeGraph、Skill 等资产管理功能。

**Team 内层：Admin 与 Member。** `team.members` 表中每个成员带 `admin | member | reviewer` 角色，负责团队内的资产协作与权限控制。

判定顺序有一条铁律：先判全局角色，再查 team 成员表。资产操作权上还有一个刻意的收敛——**admin 不再拥有全局资源特权，只能操作自己 owner 的资产**；team admin 可管理本 team 资产。"运维口"（admin 管人）与"应用口"（业务用户管资产）的分离是官方推荐的使用姿势。

## Fixed Binding + ACL：Loadout 的实现

Agent 的记忆装配由两个机制配合完成：

**Fixed Binding（固定绑定）** 是一张 `agent ↔ asset` 关联表，每条绑定记录 `{ asset_id, asset_type, injection_mode, priority, created_by }`。Chat Memory / Wiki / CodeGraph 走这条路：

- Wiki/CodeGraph 绑定用 `injection_mode='tool'`——运行时渲染为 `<knowledge_tools>` 工具说明块，Agent 按需调用而非全量注入；
- Chat Memory 借入用 `'summary'` 模式；
- 绑定接口是全量覆盖式 set（没有增量端点），所以上层都是"list → append/remove → set"的组合；
- 每个 Agent 自动拥有一条 id 形如 `chat_memory-{team_id}-{agent_id}` 的自有记忆资产，默认 private 且固定绑定不可解绑。

**ACL（访问控制表）** 处理 restricted 场景的精确授权：`acl/grant {user_id, asset_id, action: read|write|use}`，读门控统一走 `acl/check`。Owner-only 语义由内核保证。

一个反直觉但合理的设计：**Skill 不走 binding，而是 fork 副本。** 因为运行时的 `<available_skills>` 注入和面板的"固定资产"视图都按 `owner_agent_id` 过滤，仅改 ACL 对这两处无效；所以把 Skill 配给某个 Agent 的唯一机制，是复制一份 owner=目标 Agent 的副本（唯一约束 `(team_id, owner_agent_id, name)`）。理解了这一点，就理解了为什么面板上的 Skill 操作是"Fork 到 Agent"而不是"绑定"。

## 切私密不清理绑定的取舍

还有一个体现工程判断的细节：当资产从 `team` 改回 `private` 时，系统**不会**级联清理已有的 Agent 绑定（"脏绑定"）。原因是在内核权限模型下，caller 只能操作自己 owner 的 agent，跨 owner 清理会 403；而保留脏绑定是无害的——下游注入、memory-bridge 和详情页在读取侧都会按当前可见性过滤（`apply_visibility_filter=true`）。把一致性检查从写入侧挪到读取侧，换来了操作的原子性和简单性。

## 面板上的落点

这些概念在 Memory Hub 里对应的具体操作：

- **组队**：建立 Team，加入人和 Agent，确定共享边界；
- **资产背包**：打开、搜索、审核和管理四类资产；
- **Agent Loadout 编辑**：在 Agent 编辑弹窗里为它增删 Wiki/CodeGraph/Chat Memory 绑定、查看 Skill fork 情况；
- **权限切换**：在 private/team/restricted 之间调整可见性，必要时通过 ACL 收回共享。
