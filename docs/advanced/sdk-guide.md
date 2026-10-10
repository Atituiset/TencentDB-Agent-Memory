# SDK 深度使用

当 Proxy 的"零代码注入"满足不了需求——比如你要在自研 Agent 运行时里精细控制记忆的读写时机——SDK 是正确的接入层。官方提供 TypeScript 与 Python 两个实现，能力对齐。

## 安装

```bash
# TypeScript
npm install @tencentdb-agent-memory/memory-sdk-ts

# Python
pip install tencentdb-agent-memory-sdk-python
```

## TypeScript 客户端全景

| 客户端类 | 覆盖端点 | 说明 |
| --- | --- | --- |
| `MemoryClient`（v3） | L0-L3 全部数据面 | 构造强制三元组隔离 |
| `SkillClient` | `/v3/skill/*` 全部 14+ action | 含对话增量摄取 |
| `MetadataClient` | `/v3/meta/*` + `/v3/knowledge/*` | 约 60 个管理面方法 |
| `MemoryPromptClient` | 自定义记忆 Prompt CRUD/绑定/生效查询 | |
| `MemoryGenerationLogClient` | 生成溯源 list/get/getByMemoryId | |

### 最小示例

```typescript
import { MemoryClient } from "@tencentdb-agent-memory/memory-sdk-ts/v3";

const client = new MemoryClient({
  endpoint: "http://127.0.0.1:8420",
  apiKey: "your-gateway-api-key",
  serviceId: "your-memory-instance-id",
  teamId: "team-xxx", agentId: "agt-xxx", userId: "usr-xxx",
  sessionId: "sess-1",
});

// 写 L0
await client.addConversation({
  messages: [{ role: "user", content: "Hello" }],
});

// 检索 L1 原子记忆
await client.searchAtomic({ query: "user preferences", limit: 5 });

// 读 L3 长期画像
await client.readCore();
```

### 隔离模型：withIsolation

v3 客户端的灵魂是三元组隔离。构造时缺任一维度直接抛 `ParamError`；需要跨作用域操作时用派生克隆：

```typescript
const scoped = client.withIsolation({ sessionId: "sess-2", agentId: "agt-other" });
```

几条刻意的安全设计值得注意：

- **写路径强制 session_id**（缺失即抛错），读路径可省略以跨会话聚合；
- **deleteConversation 故意不回退默认 session**——防止误删整个会话的数据；
- 删除入参在客户端先归一化去重并限流（单批 ≤100，总 ≤5000）。

## Python 客户端全景

Python 版提供同步与异步双客户端（基于 httpx），方法与 TS 一一对应（snake_case）：

```python
from tencentdb_agent_memory.v3 import MemoryClient as V3   # v3 严格隔离版

client = V3(endpoint="http://127.0.0.1:8420",
            api_key="your-api-key", service_id="default",
            team_id="team-xxx", agent_id="agt-xxx", user_id="usr-xxx")

client.add_conversation(session_id="sess-1",
                        messages=[{"role": "user", "content": "Hello"}])
hits = client.search_atomic(query="preferences", limit=5)
core = client.read_core()

# 异步用法
from tencentdb_agent_memory import AsyncMemoryClient
async with AsyncMemoryClient(endpoint=..., api_key=..., service_id=...) as c:
    await c.search_atomic(query="preferences")
```

注意导入路径的版本语义：包根导出默认指向 v2 兼容客户端（平滑迁移期设计），v3 需要 `from tencentdb_agent_memory.v3 import ...` 显式引入。

SkillClient / MetadataClient / MemoryPromptClient / MemoryGenerationLogClient 同样有同步与异步两套。

## 错误处理

两端一致：非零业务 code 抛 `TDAMError`，携带 `code / message / request_id / details`。`request_id` 与 Gateway 日志对应，排查问题时带上它能直接定位服务端日志行。

## v2 → v3 差异速查

| 维度 | v2 | v3 |
| --- | --- | --- |
| 路径前缀 | `/v2/*` | `/v3/*` |
| L0/L1 写入 | session 可选 | **session 强制**（缺失 422） |
| 隔离参数 | 约定俗成 | 三元组协议化（body 或 `x-tdai-*` header） |
| Offload/COS 直读 | v2 客户端能力 | 移除（改由服务端统一处理） |

新项目一律从 v3 开始；v2 仅用于存量兼容。

## 一个自研 Agent 的典型集成节奏

```text
每轮结束 ──► addConversation(messages)          # L0 回流
构造 prompt 前 ──► readCore() + searchAtomic()  # 画像 + 相关事实
用户问细节时 ──► queryScenario()/listScenarios() # 场景下钻
长期任务收尾 ──► SkillClient.conversationAdd()   # 喂给 Skill 抽取缓冲区
```

这与[自定义 Adapter](./custom-adapter.md)章的三步曲完全同构——SDK 就是把 Adapter 要做的三件事原语化了。
