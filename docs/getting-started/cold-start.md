# 冷启动：先读档，再开工

多数 Agent 接手新任务的第一件事，是重新学习你的项目——遍历目录、通读文档、摸索规范。这些学习成本你早就付过了。TencentDB Agent Memory 把它们变成存档：**代码库、文档、历史对话**三类已有资产都可以导入，让新 Agent 团队直接从现有经验开始。

## 三条导入通道

| 你有什么 | 导入后变成 | 处理方 |
| --- | --- | --- |
| 代码库（公开 HTTPS Git 仓库） | **CodeGraph**：符号、文件、调用关系与影响路径索引 | Knowledge Service |
| 文档与文件（设计方案、运维手册、FAQ…） | **Wiki**：结构化页面 + 链接图谱 + 全文检索 | Knowledge Service |
| 历史 Agent 对话 Session | **Skill 与 Chat Memory**：自动提取可复用方法与记忆资产 | Memory Core |

三者都在面板上操作，导入后异步处理——Wiki 和 CodeGraph 构建需要等待一段时间才能 `ready`（面板会显示进度）。

## 导入代码库 → CodeGraph

在 CodeGraph 工坊登记一个仓库地址，KS 会 `git clone` 并构建索引。构建完成后：

- Agent 可以搜索代码、查 callers/callees、在改代码前做 impact analysis；
- 把它绑定给 Builder/Reviewer 角色的 Agent（Loadout 编辑），运行时以 `<knowledge_tools>` 工具形式按需调用；
- 开启 Auto-Sync 后可定时拉取 git 更新自动重建。

当前版本优先支持公开 HTTPS 仓库；私有仓库和 SSH 凭证接入仍在完善中。

## 导入文档 → Wiki

上传文档或文件后，LLM 会把它们抽取为结构化页面并自动生成页面间的引用图谱。价值在于两点：Agent 不必先读完所有文件再开工，可以搜索和沿链接下钻；文档之间的关系（"A 方案被 B 方案取代"这类链接）被显式保存下来。

## 导入对话 → Skill 与 Chat Memory

把过去与 Agent 的对话 Session 从面板导入，系统会走与实时回流相同的管线：写入 L0、后台提炼 L1-L3、判定是否包含可抽取的 Skill。这是把"老 agent 的经验"迁移给"新 agent 队伍"最直接的路径。

## 用 Loadout 完成装配

资产就绪后，最后一步是把它们配给正确的 Agent。打开 Agent 编辑弹窗：

- Wiki / CodeGraph / Chat Memory 走 allocate/unbind 增量绑定；
- Skill 通过 fork 复制到目标 Agent 名下；
- 每个角色只配它需要的——少给噪音，多给完成工作真正需要的记忆。

## 一个务实的冷启动剧本

假设你要为一支三人的 Agent 小队（Scout/Builder/Reviewer）冷启动：

1. 登记产品 Wiki（产品文档 + 设计方案），等 ready；
2. 登记主仓库 CodeGraph，等 ready；
3. 导入过去一个月的关键排障对话 Session；
4. 面板审核自动抽出的 Skill 候选，通过后 fork 给对应角色；
5. 给 Scout 配市场 Wiki，给 Builder 配 CodeGraph + 产品 Wiki，给 Reviewer 配 CodeGraph + 事故 Chat Memory；
6. 各自开一次会话验证 `<knowledge_tools>` / `<available_skills>` 注入正常（`mem:help` 有响应即说明链路通）。

完成后，这支队伍的第一轮对话就已经"读过你的项目"了——不再重新训练每一个 Agent，给它读档。
