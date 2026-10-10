# 生成管线与召回机制

记忆系统有两个引擎：一个负责"长出来"（生成管线），一个负责"找回来"（召回）。本章深入两者的实现。

## 生成管线：从 L0 到 L3

### 调度结构

```text
L0 写入 ──► Timer Scanner ──► 任务队列 ──► Worker Permit Pool ──► Pipeline Worker
   (services/timer-scanner.ts)              (worker-permit-pool.ts)   (pipeline-worker.ts)
```

- **Scanner** 周期扫描各会话的未处理轮数，判断是否达到触发条件；
- **队列**在 standalone 模式是进程内 Map（checkpoint 到文件防重启丢失），service 模式是 Redis Stream；
- **Permit Pool** 控制并发度，service 模式下配合分布式锁保证同一会话的任务不被多节点重复消费。

### 触发条件与预热

触发由两个条件任一满足：

1. 会话新增轮数 ≥ 阈值。稳态阈值即 `pipeline.everyNConversations`（默认 5）；
2. 会话空闲超过 `l1IdleTimeoutSeconds`——避免"差一轮永远不跑"的尴尬。

预热机制（`pipeline-manager.ts` 的 warm-up 逻辑）值得单独一提：新会话的阈值不是直接从 5 开始，而是 **1 → 2 → 4 → 8 → … → N** 翻倍爬升。效果是新用户的第 1 轮对话结束后就能看到第一条 L1 记忆，而不是对着空面板怀疑人生；随着交互加深，触发频率逐渐放缓到稳态，避免碎片化提炼。

### 各层的提炼实现

每层有专属的 Prompt 模板与后处理（`src/core/prompts/`）：

- **L1 抽取**（`l1-extraction.ts` + `l1-dedup.ts`）：LLM 从对话片段提取原子条目（事实/偏好/约束/事件），输出 JSON 协议；随后与既有 L1 做去重合并——语义等价的旧条目被更新而非重复创建。
- **L2 场景**（`scene-extraction.ts`）：把相关 L1 归纳为 Scene Markdown 块，写入 `profiles/{scope}/scene_blocks/*.md`，数据库登记元数据（TCVDB 路径下 ID 为 `profile:v1:{sha256}`）。
- **L3 画像**（`persona-generation.ts`）：跨场景沉淀稳定模式为 Persona 文档 `persona.md`。

固定输出协议（L1 的 JSON 结构、L2/L3 的 Markdown 格式）不可被自定义 Prompt 篡改——自定义只能调整"关注什么"，不能改变"输出成什么样"。这是下游消费方（注入器、面板渲染）赖以工作的契约。

每次生成的完整溯源（Prompt ID、版本、内容哈希、输入输出引用）写入 Generation Log，见[专章](./custom-prompt-lineage.md)。

## 召回机制：少拿但拿对

### 混合检索的三种模式

召回入口在 `src/core/hooks/auto-recall.ts` 与 `src/core/tools/memory-search.ts` / `conversation-search.ts`：

- **keyword**：FTS5 BM25 全文检索；
- **embedding**：向量相似度；
- **hybrid**（默认）：双路并行检索，结果用 **RRF（Reciprocal Rank Fusion）** 融合。

RRF 的实现非常克制（`RRF_K = 60`，取自原始论文的标准常数）：

```text
score(item) = Σ 1 / (k + rank_i + 1)
```

某条记录同时出现在关键词榜和向量榜时，两边的 RRF 分数累加——天然奖励"两种信号都认为相关"的结果。SQLite 路径下融合在客户端完成（先超额检索再合并）；TCVDB 路径则直接用服务端原生 hybridSearch 短路返回。

### 召回质量的护栏

原始相似度之外还有多层过滤：

- **分数阈值**：`recall.scoreThreshold`（默认 0.3）以下的结果丢弃；
- **条数上限**：限制返回条目数；
- **字符预算**：格式化后的总长度受限，防止记忆占满上下文；
- **超时**：召回整体有超时控制，慢查询宁可返回空也不阻塞主链路。

错误也是分级的：Embedding 未配置这类情况以结构化 `RecallError`（code 20001 等）返回，调用方可感知地降级，而不是抛异常。

### 缓存友好的上下文拆分

auto-recall 里有一处明确注释的性能设计（H-15 系列），值得所有做 LLM 应用的人学习。召回结果被拆进两个通道：

- **`appendSystemContext`**：persona、场景导航、工具使用指南——这些内容**跨轮稳定**，追加到 system prompt 尾部，可以命中上游 provider 的 prompt cache；
- **`prependContext`**：本轮查询命中的 L1 相关记忆——**每轮变化**，前置到 user prompt，不污染缓存前缀。

顺序很重要：稳定的在前、易变的在后（对 system prompt 而言），才能让缓存前缀尽量长。Proxy 的注入管线遵循同一哲学（见 [Proxy 内幕](./proxy-internals.md)）。

## Skill 子系统速写

Skill 是数据面里最复杂的业务对象，几个要点：

- **存储**：SQLite 路径用 vectors.db 的 `skills / skill_fts / skill_vec` 三表（BM25 + 向量）；资源文件按 `<skill_id>/v<version>/files/` 组织；TCVDB 路径用 `{db}_skills` 集合；
- **版本化**：`skill-versioning.ts` 维护版本链，更新走 `expected_version` 乐观锁；
- **抽取**：对话经 `/v3/skill/conversation/add` 进入缓冲区（COS 上按 `{space}/{user}/{team}/{agent}/{session}/` 组织），后台判定是否值得归档；另有 fast-path 处理显式触发的 `mem:create-skill`；
- **降级**：向量路不可用时检索自动回退 BM25 并记录 `SkillDegradation` 事件，契约层面保证 mode 不被静默吞掉；
- **隔离**：CI 对这个模块有一条硬性红线——禁止引入直接 fs import、禁止触碰 pipeline-worker/integrations/redis（见[升级与迁移](./upgrade-migration.md)章的 CI 一节）。
