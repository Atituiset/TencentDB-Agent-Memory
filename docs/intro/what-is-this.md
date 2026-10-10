# TencentDB Agent Memory 是什么

## 一句话定位

TencentDB Agent Memory 是一套开源的 **Agent 记忆基础设施**：它把 Agent 工作中产生的对话、技能、文档理解与代码理解，沉淀为四类可管理的**记忆资产**，并通过一个团队化的 Hub 让这些资产在人、Agent 与框架之间流动、复用与继承。项目由腾讯 TencentDB 团队发起，MIT 协议开源，全部服务基于 Node.js（>= 22.16）构建。

## 四个"大脑器官"

项目的功能版图可以概括为四个互相配合的子系统，每个对应一种记忆资产：

### Chat Memory：能记住人和事的大脑

Chat Memory 保留用户的偏好、事实、决策和交互历史，并按 L0 → L3 四层逐级提炼（详见[记忆模型](../panorama/memory-model.md)）。每个 Agent 创建时自动获得一份独立记忆，下次对话不必从自我介绍开始。

它的设计动机很直接："别重构旧鉴权模块，移动端还在用。"——这种代价高昂的上下文，不应该依赖人每次提醒，也不应该随着会话关闭而消失。

### Skill 库：会积累经验的肌肉记忆

Agent 做完复杂工作后，系统可以从对话和工具调用中**提炼**出可复用的 Skill——排障流程、Review 要点、上线检查清单。需要时再注入到指定 Agent 的上下文中。

这里的 Skill 不只是一段 Prompt：它有**版本、资源文件、触发边界、执行步骤和验证规则**。个人 Skill 默认私有；经过审核后可分享给团队，再装配给其他 Agent。"练会一次，全队可用"是它的目标。

### Wiki + CodeGraph：同时看懂文档和代码的知识地图

- **Wiki** 把产品文档、设计方案和运维手册交给 LLM 抽取为结构化页面，并自动生成页面间的链接图谱（这一思路源自 Andrej Karpathy 的 "LLM Wiki" 构想）。Agent 不必先读完所有文件目录再开工，而是可以搜索、沿链接下钻。
- **CodeGraph** 对代码库建立索引：符号、文件、调用关系和影响路径。Agent 不仅能查到"代码在哪"，还能在动手改代码之前先做 impact analysis——"改了这里可能影响哪"。

两者平时都只是**可调用的工具**，只有真正需要时才进入上下文，避免整库注入撑爆窗口。

### Memory Hub 面板：由人掌握的操作台

Memory Hub 不是一块展示数据的展板，而是一个操作台：在这里建 Team、录成员、创建 Agent，审核、分享并配装记忆资产，统一管理 Owner、版本、状态、可见性与使用次数。人始终握有最终控制权——分享是一个明确的动作，而不是默认的泄漏。

## 系统形态：三件套 + 一组接入件

从部署视角看，项目由三个核心服务组成（通常用 Docker 一键拉起）：

| 服务 | 默认端口 | 职责 |
| --- | --- | --- |
| Memory Core | 8420 | 记忆存储与处理、元数据管理、Skill 数据面 |
| Memory Hub（Panel + Knowledge） | 8125 / 8424 | 团队管理面板 + Wiki/CodeGraph 引擎 |
| Proxy | 8096 | LLM 请求透明代理：会话初始化、记忆注入、对话回流 |

围绕这三个服务，项目提供两类接入方式：

1. **Proxy 接入（零代码）**：把 Claude Code、CodeBuddy、Codex、WorkBuddy、DeepSeek Harness、Hermes、OpenClaw 等 Agent 的 API base URL 指向 Proxy 即可。协议不变、代码不改，不需要插件、Hook 或 MCP Server。
2. **SDK / Adapter 接入（深度定制）**：TypeScript 与 Python SDK 直接对接 Memory Core Gateway；OpenClaw 插件与 Hermes 插件则示范了自研 Adapter 的标准姿势。

## 一个具象的玩法：一个人的公司

README 里有一个广为流传的例子，值得在这里重述，因为它浓缩了整套产品的使用哲学——给一个人的公司组一支会成长的 Agent 队伍：

```text
Tiny but Serious Inc.
├── 👤 You · 定目标 / 做判断
├── 🔭 Scout · 查资料 / 找机会
├── 🛠 Builder · 写代码 / 做产品
├── 🧪 Reviewer · 测试 / 挑毛病
└── 🧠 Agent Memory · 让经验留在队伍里
```

这不是开四个彼此失联的聊天窗口，而是在组一支角色不同、能够继承团队经验的 Agent 小队。招人之后还要配装备——每个角色拿到不同的 Loadout：

```text
🔭 Scout
   ├── 用户访谈 Chat Memory
   ├── 市场研究 Wiki
   └── 竞品分析 Skill

🛠 Builder
   ├── 产品 Wiki
   ├── 项目 CodeGraph
   └── Feature Delivery Skill

🧪 Reviewer
   ├── 历史事故 Chat Memory
   ├── 项目 CodeGraph
   └── Release Checklist Skill
```

不同角色、不同装配：少给噪音，多给它完成工作真正需要的记忆。公司可以很小，经验可以一直复利。

## 技术实现要解决的三个问题

项目在技术上的自我约束可以概括为一句话：不追求"存下所有东西"，而是解决三个问题——**什么值得留下、谁可以使用、下一次怎样少拿但拿对**。这三个问题分别对应本书全景篇将要展开的三条技术主线：

1. **记忆不是平铺记录，而是逐层生长**（L0–L3 分层 + 异步提炼管线）；
2. **记忆不是全局 Prompt，而是 Agent 的 Loadout**（Fixed Binding + ACL 决定每个 Agent 能带走哪些资产）；
3. **知识不整库注入，而是按需调用**（Wiki/CodeGraph 以 tools 协议按需读取）。

后续章节将逐条展开这些机制的实现细节。
