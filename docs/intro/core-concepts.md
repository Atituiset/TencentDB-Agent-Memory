# 核心概念：资产、Team 与 Loadout

在深入架构之前，先建立一套贯穿全书的词汇表。这套概念体系是理解所有后续设计的前提——几乎每一个 API、每一张表、每一段注入逻辑，都围绕它们展开。

## 记忆资产（Memory Asset）

Chat Memory、Skill、Wiki 和 CodeGraph 在系统内被统一登记为**记忆资产**。资产是权限、版本与路由的基本单位，每个资产都携带这些属性：

- **Owner**：资产的归属用户，自动获得该资产的管理权；
- **Team**：资产归属的团队容器；
- **可见性**：`private` / `team` / `restricted` / `agent`（详见[资产体系](../panorama/asset-system.md)）；
- **版本与状态**：Skill 有显式版本链；Wiki/CodeGraph 有构建状态机；
- **使用记录**：最近是否被使用、被哪些 Agent 绑定。

点开一条资产时，面板关心的不只是"它写了什么"，还有"它从哪来、是哪个版本、分给了谁、最近是否被使用"。这是它与一个"聊天记录仓库"最本质的区别。

## 组织三元组：Team / Agent / Task

Coding Agent 使用记忆必须落到具体的三元组上：

**Team（团队）** 是一组资产的归属容器。memory、skill、knowledge 都归 Team 所有，成员关系决定了谁能读写哪些资产。

**Agent（智能体）** 是 Team 内的角色化执行者。创建时要填写清晰的 `description` 和 system prompt（角色说明），例如"bug-fix 工程师""前端评审 agent""SQL 优化师"。注意一个容易混淆的点：在这个体系里，Agent 是**被管理的元数据实体和调用方**——MemoryCore 不负责托管、调度或运行 Agent 本身。

**Task（任务）** 是"这一次工作的抓手"，比如"修复登录页 XSS""上线 v1.4 灰度"。Task 是可选的：不建 Task 也能用，但 L2/L3 记忆会缺 Task 维度；对话中产生的记忆会关联到当前 Task 上，成为日后回溯的线索。

三元组加上 User 一起构成了 v3 数据面的强隔离维度：几乎所有 `/v3/*` 接口都要求 `team_id`、`agent_id`、`user_id` 三元组（通过请求体或 `x-tdai-*` Header 传入），可选的 `session_id` 进一步限定会话范围。

## Loadout：Agent 的记忆装配

传统做法是把一大段"全局记忆"塞进 system prompt，所有人共享、所有会话都背。本项目的做法完全不同：每个 Agent 通过 **Fixed Binding + ACL** 决定它能带走哪些资产。

运行时的决策顺序是：先按 Team、User、Agent 和可见性缩小权限范围，再按当前问题做语义召回。于是：

- 团队可以共享经验，却不必共享全部隐私；
- 换 Agent 或换框架，只需重新装配，不必重新训练；
- 不同角色拿到不同的装配——Scout 不需要 Release Checklist，Reviewer 不需要市场研究 Wiki。

"配装备"这个比喻值得记住：Memory Hub 里给 Agent 绑定资产的页面，本质上就是在编辑它的 Loadout。

## Memory Instance 与 spaceId

**Memory Instance（记忆实例）** 是 Memory Core 中一组数据的逻辑隔离单元。每个请求都必须通过 `x-tdai-service-id` Header 声明自己属于哪个实例；本地部署通常固定叫 `default`。在 Proxy 的 URL 路径里，实例 ID 以 `<spaceId>` 的形式出现：

```text
http://127.0.0.1:8096/claude-code/default
                            └─ agent-source ─┘└spaceId┘
```

多租户部署时，不同实例的数据、配置乃至 Pipeline 状态彼此独立。

## 会话初始化（Session Init）

当一个 coding agent 第一次经过 Proxy 对话时，Proxy 会拦截请求并引导完成一次**会话绑定**：依次选择本次会话所属的 Team → Agent → Task（可选）。绑定完成后：

- 后续每一轮请求自动注入所选 Agent 的 L2/L3 记忆、Skill 与 Knowledge；
- 原始对话（L0）自动回流到 MemoryCore；
- 同一进程内的后续轮次不再重复询问。

对 Claude Code 这类交互式客户端，选择以原生问答工具的形式弹出；对无法响应交互表单的平台，则通过 `x-team-id` / `x-agent-id` / `x-task-id` 请求头直接注册。

## 数据面与管理面

最后一条分界线是 **数据面** 与 **管理面** 的分离：

- **数据面**处理记忆内容本身：写入 L0、检索 L1/L2/L3、Skill 的增删改查与抽取。它要求完整的三元组隔离。
- **管理面**处理元信息：User、Team、Agent、Task、Asset 及其权限关系（`/v3/meta/*`），以及知识资产的登记（`/v3/knowledge/*`）、自定义 Prompt（`/v3/memory-prompt/*`）等。

Panel 是管理面的主要消费者；Proxy 和各 Adapter 主要工作在数据面上。理解这条线，后面阅读 API 列表和源码目录时会顺畅很多。
