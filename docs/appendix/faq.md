# FAQ 汇编

按主题归档的常见问题。部署类问题另见[常见问题排查](../getting-started/troubleshooting.md)。

## 产品与定位

**Q：和直接给 Agent 加一个"记忆插件"有什么区别？**

单机记忆插件把记忆锁在单个 Agent/框架里。本项目的记忆是**资产化的团队资源**：带 Owner、版本、可见性与 ACL，可以跨框架迁移、跨成员共享，由人审核与装配。Proxy 模式下甚至不需要任何插件——改一个 base URL 就接入。

**Q：必须用腾讯云的产品吗？**

不需要。默认形态只用 SQLite + 本地文件 + 任一 OpenAI-compatible LLM API；TCVDB（腾讯云向量库）与 COS 都是可选升级项，用于规模化场景。

**Q：支持哪些 Agent？**

经 Proxy 零代码接入：Claude Code、CodeBuddy、WorkBuddy、Codex CLI、DeepSeek Harness、Hermes、OpenClaw；任何 OpenAI 兼容平台可走通用接入法；自研运行时用 TS/Python SDK。

## 架构与数据

**Q：我的对话数据存在哪里？**

standalone 默认在 `~/.memory-tencentdb/memory-tdai`（SQLite + 本地文件）。Docker 部署在 named volume 中。Proxy 自身不落任何记忆数据。

**Q：L1/L2/L3 是实时生成的吗？**

不是。写入 L0 后由后台管线异步提炼：默认每 5 轮触发一次（新会话有 1→2→4→8 的预热加速），会话空闲超时也会触发。这是刻意设计——提炼不该阻塞对话本身。

**Q：记忆会不会把上下文撑爆？**

不会，这是设计的核心关切之一：召回有条数上限、字符预算与超时三重护栏；注入侧遵循"稳定进缓存、易变走工具"的分层；知识（Wiki/CodeGraph）平时只是可调用的工具，不进入上下文。

**Q：自动抽取的记忆错了怎么办？**

当前版本可在面板删除后重建；v2.0.1 正式版计划开放 L1-L3 的面板编辑。自定义 Memory Prompt 可以从源头调整提炼关注点，减少系统性偏差。

## 使用技巧

**Q：怎么让记忆更快"长出来"？**

做真实工作对话（改文件、跑测试、给结论），明确说出约束与偏好；用 `mem:create-skill` 显式归档有价值的过程；导入历史 Session 补足存量。`promptMode=code` 只对代码类对话有效，闲聊抽不出东西。

**Q：如何验证注入真的生效了？**

三步：`mem:help` 有响应 → Core `/health` 的 pipelineWorker 计数增长 → 用 `/analyse` marker 做一轮资产反思评估（见[可观测性](../advanced/observability.md)章）。

**Q：多个 Agent 可以共享同一条记忆吗？**

可以，这正是 Team 的意义：把资产可见性设为 team 或通过 ACL 授权，再绑定到需要的 Agent。注意 Skill 的共享方式是 fork 副本而非绑定。

## 开发与贡献

**Q：想贡献代码，从哪里入手？**

读 [CONTRIBUTING_CN.md](https://github.com/TencentCloud/TencentDB-Agent-Memory/blob/main/CONTRIBUTING_CN.md)；特别欢迎的方向是新框架 Adapter 与 Memory Hub 用法。注意 CI 的 Skill Queue Isolation 红线（见[升级与迁移](../advanced/upgrade-migration.md)章）。

**Q：CodeGraph 支持私有仓库吗？**

当前优先支持公开 HTTPS 仓库；私有仓库与 SSH 凭证接入在完善中。

**Q：哪里可以反馈问题？**

GitHub Issues（项目方承诺 24 小时内响应）；想法交流去 Discussions；也有微信社群。
