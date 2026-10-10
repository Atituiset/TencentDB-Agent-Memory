# 可观测性体系

记忆系统是异步的、多级的、跨四个服务的——出了问题"为什么这条记忆没生成/没被注入"必须靠可观测性回答。本章梳理三套互相独立的上报体系与日志约定。

## Proxy 的三路 APM 上报

每次经过 Proxy 的 turn 可以同时上报三个平台，**三路完全独立，任一失败不影响业务与其他路**：

| 平台 | 粒度 | 内容 |
| --- | --- | --- |
| **Opik** | trace | LLM 调用链路追踪 |
| **Langfuse** | trace（一个 trace = 一个 turn） | 对话轮次级追踪 |
| **ClickHouse** | 按 turn | token 用量明细（计费数据源） |

源码对应 `src/opik.ts / langfuse.ts / clickhouse.ts`。设计哲学是 error-silent：上报失败记日志、吞异常，绝不把可观测性故障传染给用户对话。

## KS 的埋点

Knowledge Service 有两套可选遥测：

**ClickHouse 工具调用日志**：`KNOWLEDGE_CLICKHOUSE_ENABLED=true` 后，每个 `POST /v3/tools/call` 写入 `tool_call_logs` 表。隐私处理值得细看：请求正文**递归脱敏并截断到 512 bytes**；若调用方传了 `x-conversation-id`、`x-tdai-user-id/team-id/agent-id/space-id/turn-seq` 等 header，这些维度一并入库用于归因——但密钥永远不进库。

**Langfuse**：配置 `LANGFUSE_PUBLIC_KEY + LANGFUSE_SECRET_KEY` 后上报 Wiki 生成过程的 LLM 调用；未配置时整体关闭，零开销。

## Core 的内置度量

MemoryCore 不依赖外部 APM 也有一层自观测：

- **`GET /health`**：除了存活探针，还暴露 pipelineWorker 的 `tasksConsumed/tasksCompleted` 计数——这是确认"提炼管线在干活"最直接的指标；
- **召回度量**（`src/core/report/metric-tracking-recall.ts`）：记录召回最高分（recall_top_score）等指标；
- **性能日志标签**：如 `[skill-perf]` 输出 Skill 检索耗时分解。

## 日志标签地图

排查问题时按组件认日志前缀：

| 标签 | 来源 |
| --- | --- |
| `[tdai-gateway]` | MemoryCore Gateway |
| `[memory-tdai][...]` | MemoryCore 核心模块 |
| `[META-V3]` | v3 管理面 |
| `[skill-perf]` | Skill 检索性能 |

Panel 侧的 kernel 适配器对所有出站日志做脱敏（password/api_key/token/user_key 打码）与截断；Proxy 的结构化日志写入 `logs/YYYY-MM-DD.log`（`proxy.sh log` 直接 tail）。

## 效果评估：注入到底值不值

除了"系统是否正常"，还有一类问题更难答："注入的记忆/Skill/知识对回答质量有没有实际帮助？"Proxy 为此内置了**资产反思**机制（asset reflection）：

- 双闸门开启：config 里 `injection.assetReflection.markerOptIn: true` **且** URL 显式带 `/analyse/` 段：
  ```text
  http://<proxy>:8096/claude-code/<spaceId>/analyse/v1/messages
  ```
- 开启后 system prompt 末尾追加 `<asset_reflection>` 块，指导 LLM 在最终回答末尾**只对本轮真正调用过的资产工具**逐个复盘：是否起作用、拿到了什么关键信息、或为何未命中；
- 本轮完全没用工具也要输出固定一行："【资产反思】本轮未使用任何云端资产工具。"

定位是**接入效果验证**：把评测集或 staging 会话导到 `/analyse` URL 上，直接读回 LLM 自己给出的逐工具评价。`markerOptIn=false` 时带 marker 的请求直接 404——刻意防止客户端以为开了实际却 fall through。不要对线上真实流量默认打开。

## 建议的最小监控组合

生产环境至少盯四样东西：

1. 四个服务的 `/health`（Core 的 pipelineWorker 计数尤其重要）；
2. Proxy `/health` 里的 `storage.effective`——确认存储后端没有意外降级到 memory；
3. ClickHouse 的 token 消耗趋势（成本异常往往先在这里显形）;
4. 定期抽查 Generation Log——记忆质量回归比服务故障更隐蔽。
