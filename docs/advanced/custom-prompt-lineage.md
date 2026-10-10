# 自定义 Prompt 与生成溯源

自动抽取的记忆不可能永远符合你的团队语境。MemoryCore 提供了两个配套机制：**自定义 Memory Prompt**（调整提炼的关注点）与 **Generation Log**（追溯每条记忆是怎么来的）。两者合起来，把记忆从"系统产出的黑盒"变成"可调校、可审计的资产"。

## 自定义 Prompt 的能力边界

先说清它**能改什么、不能改什么**：

- ✅ 调整 L1/L2/L3 提炼时的关注点与归纳策略，例如"重点提取架构决策、兼容性约束、风险和可复用方法"；
- ❌ 不能修改固定输出协议——L1 的 JSON 结构、L2 Scene Markdown 和 L3 Persona/Doctrine 的格式是硬契约。

配额限制：每个 Memory Instance 最多 500 个自定义 Prompt；单个 Prompt 内容最长 10,000 个 Unicode 字符。

## 绑定模型与优先级

Prompt 本体和目标绑定分开存储。绑定目标有三层，解析时按优先级生效：

```text
Agent > Team > Instance > 系统内置
```

- Agent 由 `team_id + agent_id` 唯一确定；
- 未命中任何自定义 Prompt 时完全使用系统默认；
- 命中时只**追加**客户的记忆策略（不是替换系统 Prompt）；
- 删除 Prompt 会清理相关绑定，运行时自动回退到下一级。

版本语义：更新保持 `memory_prompt_id` 不变并执行 `version += 1`，已有绑定的新生成任务自动使用最新版本——正在跑的旧任务不受影响。

## 主要接口

```text
POST /v3/memory-prompt/create     # 创建
GET  /v3/memory-prompt/get       # 查询
POST /v3/memory-prompt/update    # 更新（version+1）
POST /v3/memory-prompt/delete    # 删除（清理绑定）
POST /v3/memory-prompt/set       # 绑定到 Agent/Team/Instance
GET  /v3/memory-prompt/log       # 设置操作日志
GET  /v3/memory-generation-log/list | /get   # 生成溯源
```

创建示例：

```bash
curl -sS -X POST http://127.0.0.1:8420/v3/memory-prompt/create \
  -H "Authorization: Bearer ${TDAI_GATEWAY_API_KEY}" \
  -H "x-tdai-service-id: local-memory" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "architecture-decisions",
    "layer": "l1",
    "prompt": "重点提取架构决策、兼容性约束、风险和可复用方法。"
  }'
```

> 本地未配置 `TDAI_GATEWAY_API_KEY` 且只监听回环地址时可省略 `Authorization`；`x-tdai-service-id` 始终必填。

## Generation Log：证据链设计

每次 L1/L2/L3 生成都会落一条溯源记录，回答三个问题：

1. **用了哪个 Prompt？** 记录 `memory_prompt_id`、版本、来源（自定义/内置）以及内容的 **SHA-256 哈希**——注意不保存 Prompt 正文快照，既省空间又避免正文里的敏感信息扩散。
2. **输入是什么？** 本次生成引用了哪些 L0/L1 记录。
3. **输出了什么？** 生成的 Memory ID 与结果的存储位置。

实现上分两层：数据库表 `memory_generation_refs` 做反向索引（"这条记忆由哪个 prompt 版本生成"），完整日志对象写 COS 或本地目录，对象键形如：

```text
memory-generation-logs/v1/layer={l}/date={d}/hour={h}/{倒序ts}__mid={anchor}__lid={logId}.json
```

倒序时间戳的设计让按时间"新到旧列举"变成一次字典序扫描。按 Memory ID 查询：

```bash
curl -sS -G http://127.0.0.1:8420/v3/memory-generation-log/get \
  -H "Authorization: Bearer ${TDAI_GATEWAY_API_KEY}" \
  -H "x-tdai-service-id: local-memory" \
  --data-urlencode "memory_id=<memory-id>" \
  --data-urlencode "layer=l1"
```

## 实操建议

一个经过验证的调校流程：

1. 先观察默认 Prompt 的产出：面板里看 L1 条目是否抓对了重点；
2. 针对系统性偏差写自定义 Prompt——比如发现它总是忽略性能约束，就加一句"特别关注性能相关约束与权衡"；
3. 绑定到 Team 层（而非逐 Agent 配置），让整个团队共享同一套提炼口径；
4. 用 `/v3/memory-generation-log/get` 对比调校前后同一对话的产出差异；
5. E2E 验证可跑 `npm run e2e:memory-prompt:vdb-cos`——它会验证 Agent/Team/Instance 三层 Prompt 的实际模型请求、持久化与 COS 日志，并用唯一测试 ID 清理数据。

SDK 侧：TypeScript 导出 `MemoryPromptClient` 与 `MemoryGenerationLogClient`，Python SDK 提供同步/异步双版本，方法一一对应。
