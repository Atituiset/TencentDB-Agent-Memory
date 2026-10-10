# 环境变量速查

按组件归类的常用环境变量。完整清单以各组件 `.env.example` 与配置模板为准。

## MemoryCore（Gateway）

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `TDAI_GATEWAY_CONFIG` | 自动发现 | 配置文件路径 |
| `TDAI_GATEWAY_HOST` | `127.0.0.1` | 监听地址 |
| `TDAI_GATEWAY_PORT` | `8420` | 监听端口 |
| `TDAI_GATEWAY_API_KEY` | 未设置 | Bearer 鉴权；**非回环监听必须设置** |
| `TDAI_CORS_ORIGINS` | 空 | 允许的 Origin，逗号分隔 |
| `TDAI_DATA_DIR` | `~/.memory-tencentdb/memory-tdai` | 本地数据目录 |
| `TDAI_LLM_API_KEY` | 空 | LLM API Key |
| `TDAI_LLM_BASE_URL` | `https://api.openai.com/v1` | OpenAI-compatible API 地址 |
| `TDAI_LLM_MODEL` | `gpt-4o` | 模型名 |
| `TDAI_SKILL_ENABLED` | 配置文件值 | 强制启用 Skill 模块 |

配置加载优先级：`TDAI_GATEWAY_CONFIG` → 当前目录 → 数据目录 → 环境变量 → 内置默认。

## MemoryProxy

| 变量 | 说明 |
| --- | --- |
| `TDAI_MEMORY_SYSTEM_USER_ID` | memory 内部服务账号 user_id |
| `TDAI_MEMORY_SYSTEM_USER_KEY` | 内部服务账号 apiKey |
| `TDAI_PROXY_ADMIN_API_KEY` | 运维端点 shared secret |
| `PROXY_DB_PATH` | sqlite 后端 db 路径兜底 |
| `PROXY_FULL_STACK` | `1` 一键打开 auth + sessionInit + tdai 全流水线 |
| `PROXY_ENABLE_AUTH` / `PROXY_ENABLE_SESSION_INIT` / `PROXY_ENABLE_TDAI` | 三大开关，可单独控制 |
| `PROXY_CONFIG_DIR` | 指向自维护 config.yaml 目录（绕开 start-proxy.sh 覆写） |

主要配置在 `config.yaml`（CLI 参数 > YAML > 内置默认），关键段：`upstream` / `auth` / `tdai` / `skill` / `knowledge` / `injection` / `extraction` / `sessionInit` / `storage` / `redis` / `rateLimit` / `clickhouse` / `creditReport`。

## MemoryKnowledge

| 变量 | 说明 |
| --- | --- |
| `PORT` | 默认 8421（开发）/ 8424（合并镜像） |
| `API_PREFIX` | 固定 `/v3` |
| `KNOWLEDGE_DATA_DIR` / `KNOWLEDGE_DB_PATH` | 数据目录与 SQLite 路径 |
| `KNOWLEDGE_PUBLIC_BASE_URL` | 写入资源 service_url；**必须含 `/v3` 且 Agent 可达** |
| `TMC_CALLBACK_URL` | Panel 根地址（不带 callback path） |
| `LLM_MODE` | `proxy`（默认，用 Panel 推送的 binding）/ `custom`（本地直连） |
| `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL` / `LLM_PROTOCOL` | custom 模式的直连参数 |
| `KNOWLEDGE_AUTO_SYNC_ENABLED` | Auto-Sync 总开关（默认关） |
| `KNOWLEDGE_AUTO_SYNC_SCAN_INTERVAL_MIN` | 扫描周期分钟数（默认 10，clamp 1–60） |
| `KNOWLEDGE_AUTO_SYNC_MAX_CONCURRENT` | worker 数（默认 3，clamp 1–20） |
| `KNOWLEDGE_CLICKHOUSE_*` | ClickHouse 工具调用埋点（URL/DATABASE/TABLE/USER/PASSWORD…） |
| `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` | Wiki LLM 调用 trace |

## Memory Hub / Panel

| 变量 | 说明 |
| --- | --- |
| `REMOTE_INSTANCE_ID` / `REMOTE_INSTANCE_URL` / `REMOTE_INSTANCE_KEY` | 单实例快捷注册（容器网内别名如 `http://memory-core:8420`） |
| `REMOTE_INSTANCE_PROXY_URL` | UI 客户端接入地址卡片展示用 |
| `KNOWLEDGE_SERVICE_URL` | Panel → KS 管理地址（不带 `/v3`） |
| `KNOWLEDGE_LLM_BINDING_SYNC` | 启动时是否推送 llm_binding |
| `METADATA_INSTANCES_CONFIG` | 实例注册表路径 |

## 部署脚本（deploy/global-images/.env）

| 变量组 | 用途 |
| --- | --- |
| `MEMORY_LLM_BASE_URL / _API_KEY / _MODEL` | Core + Hub 内部提炼/生成用 LLM |
| `PROXY_UPSTREAM_URL / _API_KEY / _MODEL` | Proxy 转发的上游模型 |
| `PULL=1` | 启动前拉取最新镜像 |
