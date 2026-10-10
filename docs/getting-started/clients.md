# 更多客户端接入

Proxy 的设计目标是"协议不变，零代码接入"——所有客户端的共性是：**把 base URL 指向 Proxy，带上用户密钥，其余配置不动**。差异只在各客户端把 URL 和 Key 放在哪。

## 五种客户端对照表

| 维度 | Claude Code | CodeBuddy | Codex | DeepSeek Harness (dsh) |
|---|---|---|---|---|
| 协议 | Anthropic Messages | OpenAI Chat Completions | OpenAI Responses | OpenAI Chat Completions |
| 配置位置 | 环境变量 | `~/.codebuddy/models.json` | `~/.codex/config.toml` | `~/.dsh/settings.yaml` + `.credentials.yaml` |
| URL 前缀 | `/claude-code/<spaceId>` | `/codebuddy/<spaceId>` | `/codex/<spaceId>` | `/dsh/<spaceId>`（尾巴**不带** `/v1`） |
| Key 传递 | env `ANTHROPIC_AUTH_TOKEN` | JSON `apiKey` 字段 | TOML `experimental_bearer_token` | `.credentials.yaml` 环境变量 |
| Session init | 自动弹表单 | 自动弹表单 | **首次需手动切 Plan 模式** | 自动弹表单（按钮式） |

WorkBuddy（桌面端）与 CodeBuddy 同构：改 `~/.workbuddy/models.json`，URL 用 `/workbuddy/<spaceId>`。Hermes 与 OpenClaw 走 header 直注册模式，见下文。

## CodeBuddy / WorkBuddy

在 `~/.codebuddy/models.json` 中添加自定义模型：

```json
{
  "models": [
    {
      "id": "claude-sonnet-4-20250514",
      "name": "proxy-memory-agent",
      "vendor": "claude",
      "apiKey": "<业务用户的 sk-mem-...>",
      "maxInputTokens": 200000,
      "url": "http://127.0.0.1:8096/codebuddy/default",
      "supportsToolCall": true,
      "supportsImages": true
    }
  ]
}
```

注意两点：`id` 必须与 Proxy 上游支持的模型匹配；`apiKey` 用业务用户的 user_key。CodeBuddy **4.10.2–4.10.4 有已知 Bug**（不携带 sessionId 导致 session init 失败），请用 ≥ 4.10.5 或 ≤ 4.10.1。

## Codex CLI

编辑 `~/.codex/config.toml`：

```toml
model_provider = "team-proxy"
model = "claude-opus-4.7"
disable_response_storage = true

[model_providers.team-proxy]
name       = "TDAI team-proxy"
wire_api   = "responses"
base_url   = "http://127.0.0.1:8096/codex/default"
experimental_bearer_token = "<业务用户的 sk-mem-...>"
```

两个关键细节：`wire_api = "responses"` 必填（Codex 走 Responses 协议）；`disable_response_storage = true` 关闭本地缓存，否则第二轮起可能命中缓存跳过注入。

**首次对话前必须切到 Plan 模式**（`Shift+Tab`）：默认 Agent 模式会自动执行 proxy 返回的 session-init 表单工具、跳过用户选择，导致永远绑不上 Team/Agent/Task。选完三元组后再切回 Agent 模式正常使用。

## DeepSeek Harness (dsh)

编辑 `~/.dsh/settings.yaml`：

```yaml
llm-deepseek:
  apiKeyEnv: PROXY_USER_KEY
  baseURL: http://127.0.0.1:8096/dsh/default   # 尾巴不要加 /v1！
  reasoningEffort: high
```

密钥放 `~/.dsh/.credentials.yaml` 的 `PROXY_USER_KEY:` 字段，并收紧权限（dsh 启动时强制检查）：

```bash
chmod 700 ~/.dsh && chmod 600 ~/.dsh/.credentials.yaml
```

Web UI 里每个新对话首帧会渲染 4 步按钮式选择器（是否关联团队资产 → Team → Agent → Task）；CLI headless 模式 proxy 会自动检测无交互能力而 bypass session-init，直接透传。

## Hermes 与 OpenClaw：header 直注册模式

这两个框架无法响应交互式表单，因此通过请求头**直接完成 session 注册**，跳过弹窗：

```yaml
# Hermes ~/.hermes/config.yaml（节选）
base_url: http://<proxy-host>:<port>/hermes/default
api_key: <user_key>
extra_headers:
  x-team-id: <team_id>
  x-agent-id: <agent_id>
  x-task-id: <task_id>          # 当前版本必填
  x-conversation-id: <自定义会话标识>
```

OpenClaw 在 `~/.openclaw/openclaw.json` 的 `models.providers` 里做等价配置（`baseUrl` 用 `/openclaw/<spaceId>`，headers 同上）。

两条当前版本的已知限制要心里有数：

1. **`x-task-id` 必填**——缺了它 proxy 会尝试弹表单，而这俩框架接不住，最终 session bypass（注入与回流全部失效）。切换任务需要手动改配置。
2. **`x-conversation-id` 静态指定**——同一 ID 的所有请求共享同一 session；每次开新对话需手动更换 ID，否则沿用上次会话状态。

官方已在路线图中计划让 task 可选并优化 conversation ID 体验。

## 其他平台（通用接入法）

任何兼容 OpenAI API 的平台都能挂上来：

```text
http://<proxy-host>:8096/<agent-source>/<spaceId>
```

- `<agent-source>` 从 `claude-code / codebuddy / workbuddy / codex / hermes / openclaw` 中选用（其他平台可伪装成其中之一）；
- 必带 Header：`Authorization: Bearer <user_key>` + 四个 `x-*` header（同上表）；
- 缺 header 的平台将触发 session bypass——透传正常，但记忆不生效。

## 接入后的通用验证清单

无论哪个客户端，接入后建议按顺序确认三件事：

1. 首条消息触发 session init（或 header 注册成功），面板上能看到会话绑定；
2. 对话几轮后，Core `/health` 的 pipelineWorker 计数增长；
3. 输入 `mem:help` 能返回指令帮助——说明注入管线工作正常。
