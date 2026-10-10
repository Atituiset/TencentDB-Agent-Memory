# 总体架构：四个服务 + 一组 SDK

## 部署视图

把所有组件拉起来之后，你的机器上会出现这样一张拓扑图：

```text
        ┌──────────────────────────────┐
        │   编码 Agent / 自定义应用      │
        │  Claude Code · CodeBuddy ·    │
        │  Codex · dsh · Hermes · ...   │
        └───────────┬──────────────────┘
                    │ OpenAI / Anthropic 协议（不改动）
                    ▼
            MemoryProxy :8096  ═══► 上游 LLM（OpenAI-compatible）
             │        │
             │        │ 浏览器 HTTP
             ▼        ▼
   MemoryCore :8420   Memory Hub :8125/:8424
   记忆数据面+管理面     Panel UI + Knowledge Service
```

四个服务各司其职，彼此之间只通过 HTTP 通信：

- **MemoryProxy（:8096）** 是 Agent 与上游 LLM 之间的透明代理。它在请求转发的前后"顺手"完成会话初始化、记忆注入、对话回流、鉴权与用量上报。对客户端和上游模型来说它都是不可见的——协议原样转发。
- **MemoryCore（:8420）** 是记忆与元数据核心。所有 Memory / Skill / Knowledge 元信息的读写最终都落在它身上。Proxy 自己**不落任何记忆数据**——这是一条重要的分工边界：Proxy 管"接入与转发"，Core 管"存储与处理"。
- **Memory Panel（:8125 生产 / :8123 开发）** 是无状态的 Web 管理控制台。它不保存登录会话、不维护本地用户库，只做凭证校验与请求转发聚合。
- **Knowledge Service（:8424 生产 / :8421 开发）** 是 Wiki 与 CodeGraph 引擎，负责知识内容的解析、索引和检索。

## 分层视图

从职责上切，系统可以分为四层：

```text
┌─────────────────────────────────────────────────────────┐
│ 接入层   Proxy（零代码注入）· OpenClaw/Hermes 插件 · SDK    │
├─────────────────────────────────────────────────────────┤
│ 数据面   Memory L0-L3 · Skill RAG · Knowledge 检索         │
│         （MemoryCore :8420  +  MemoryKnowledge :8421）    │
├─────────────────────────────────────────────────────────┤
│ 管理面   Team/Agent/Task/Asset 元信息 · 权限 · Loadout 绑定 │
│         （MemoryCore /v3/meta/* ← Panel 转发）             │
├─────────────────────────────────────────────────────────┤
│ 存储     SQLite(FTS5/sqlite-vec) · 本地文件/COS ·          │
│         可选 TCVDB 向量库 · 可选 Redis                     │
└─────────────────────────────────────────────────────────┘
```

这个分层里最值得注意的设计是**管理面与数据面共用同一个 Gateway 进程**（都在 :8420 上），但走不同的路由前缀（`/v3/meta/*` vs `/v3/conversation|atomic|skill/*`），并且使用不同强度的身份凭证（管理面要求 `x-tdai-user-key` 用户级密钥，数据面主要靠 Bearer API Key + 三元组隔离参数）。这让单机部署极简，又不妨碍未来拆分。

## 存储视图

默认形态下（standalone 模式），整个系统的持久化需求出乎意料地轻：

- **SQLite** 一个文件搞定元数据、L0-L3 记录、Skill 索引（FTS5 全文 + sqlite-vec 向量）；
- **本地文件目录**（默认 `~/.memory-tencentdb/memory-tdai`）存放 Pipeline 产物（persona.md、scene_blocks）、Skill 资源文件和大对象；
- 除调用 LLM API 外**没有必需的外部服务**——不需要 Redis、不需要向量数据库就能完整跑通。

同时，每个环节都预留了升级通道：向量检索可切换到腾讯云 VectorDB（TCVDB）获得服务端原生混合检索；大对象可 offload 到 COS；多节点部署时 Proxy 状态可切换到 Redis 或 COS 后端。这种"单机开箱即用、按需逐级放大"的姿态贯穿全部组件。

## 关键设计不变量

阅读源码之前，先记住几条贯穿全项目的工程决策，它们解释了大量看似奇怪的代码结构：

**双部署形态对称。** `deployMode: standalone | service` 是第一分叉。standalone 下一切状态在进程内（内存队列、setTimeout 定时器、checkpoint 文件）；service 模式下状态外置（Redis Stream 任务队列、分片 ZSET 定时器、分布式锁）。两种模式共享同一套业务 handler。

**全链路降级而非崩溃。** sqlite-vec 加载失败 → 降级为纯 BM25；jieba 缺失 → 正则切词；Embedding 未配置 → 只用关键词召回。几乎每个依赖都有 fallback，故障被记录为日志标签而不是异常中断。

**幂等与可追溯。** 写入按 record_id upsert；Skill 更新用乐观锁；每次 L1/L2/L3 生成都会落一条 Generation Log（记录 Prompt ID、版本、内容哈希），形成完整的证据链。

**缓存友好的上下文分层。** 召回结果刻意拆成两类：跨轮稳定的内容追加到 system prompt 尾部（命中 prompt cache），每轮变化的内容前置到 user prompt（不污染缓存）。这是 Proxy 注入管线和 Core 召回接口共同遵守的约定。

接下来的四节将逐一走进四个组件的内部。
