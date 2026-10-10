# 进阶导览

从这一章开始，我们下到源码层面。进阶篇按"组件 × 主题"组织：

**理解核心（MemoryCore）**

- [存储与网关](./memorycore-internals.md)：SQLite/TCVDB 存储抽象、三层鉴权、v2/v3 API 演进、双部署形态；
- [生成管线与召回机制](./pipeline-recall.md)：Scanner/Worker 调度、预热阈值、L1→L2→L3 提炼、BM25+向量+RRF 混合召回、缓存友好的上下文拆分；
- [自定义 Prompt 与生成溯源](./custom-prompt-lineage.md)：Prompt 绑定优先级、版本语义、Generation Log 证据链。

**理解接入（Proxy / Adapter / SDK）**

- [MemoryProxy 内幕](./proxy-internals.md)：八阶段请求处理、各注入器的内容块、KV cache 保护、存储后端降级链、限流与计费；
- [`mem:` 会话指令](./mem-commands.md)：对话内就地操作记忆的轻量入口；
- [SDK 深度使用](./sdk-guide.md)：TS/Python 客户端全景、隔离模型、错误处理；
- [编写自定义 Adapter](./custom-adapter.md)：三步曲模式与两个参考实现。

**理解知识与管理（Knowledge / Panel）**

- [MemoryKnowledge 内幕](./knowledge-internals.md)：Wiki ingest 流水线、CodeGraph 桥接、tools 协议、llm_binding、MCP 通道；
- [MemoryPanel 内幕](./panel-internals.md)：六边形 kernel 架构、白名单代理、角色模型实现。

**生产实践**

- [部署形态进阶](./deployment-topologies.md)：standalone vs service、多节点扩展、镜像构建发布；
- [可观测性体系](./observability.md)：Opik/Langfuse/ClickHouse 三路上报与日志体系；
- [升级与数据迁移](./upgrade-migration.md)：v2→v3 迁移工具与 CI 红线。

## 阅读建议

- 想为项目贡献代码：先读 MemoryCore 两章 + 部署形态中的 CI 一节（有一条关于 Skill 队列隔离的硬性红线）。
- 想接入自研 Agent：SDK 章 + Adapter 章 + Proxy 章的注入块一节即可覆盖所需知识。
- 想做生产运维：部署形态 + 可观测性 + 升级迁移三章是主线。
- 所有章节的结论都尽量标注了源码路径，建议对照仓库阅读；本文基于 v2.0.1-beta.x 分支（`feat/server_team`），细节可能随版本演进。

## 贯穿全篇的四条设计主线

提前把四条主线放在这里，读每一章时都可以回头对照：

1. **双部署形态对称**——`standalone | service` 是第一分叉，两态共享同一套业务逻辑，只是状态存放位置不同；
2. **全链路降级而非崩溃**——几乎每个可选依赖都有 fallback，故障体现为日志标签而非异常中断；
3. **幂等与可追溯**——upsert 写入、乐观锁更新、只追加审计、每次生成都留证据链；
4. **缓存友好的上下文分层**——稳定内容进 system prompt 尾部命中缓存，易变内容走工具或前置注入。
