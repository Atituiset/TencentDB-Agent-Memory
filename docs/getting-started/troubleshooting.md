# 常见问题排查

本页收录一键部署路径上最高频的问题。按"症状 → 原因 → 解法"组织。

## 会话初始化类

**CC 会话没有弹选择表单？**

`PROXY_ENABLE_SESSION_INIT=1` 没开。`start-all.sh` 默认已打开；如果你手动改过 `.env` 或用 `PROXY_FULL_STACK=0` 起的，重启 proxy：`PROXY_FULL_STACK=1 ./start-proxy.sh`。

**表单选择项空空的，或只有别人的 team？**

确认当前账号在面板里建过 Team 和 Agent。Proxy 只列出当前 `user_key` 对应用户 own 的资产——用 admin key 但没建过资产、或用了别人的业务用户，都会看到空列表。

**Codex 永远选不了 Team/Agent/Task？**

首次对话前没切 Plan 模式。默认 Agent 模式会自动执行 session-init 表单的工具调用、跳过用户选择。先 `Shift+Tab` 切 Plan 再发第一条消息。

## 服务健康类

**面板显示 "Panel API 8125 未启动"？**

`docker ps` 看 `tdai-memory-hub` 是否 healthy；不 healthy 就 `docker logs tdai-memory-hub` 找报错——大概率是 `REMOTE_INSTANCE_URL` / `LLM_BASE_URL` 之类配错。

**本地起 Proxy 一直刷 `ECONNREFUSED 127.0.0.1:6379`？**

示例配置默认启用 Redis，而本机没跑 Redis。纯本地开发改为 `redis.enabled: false` + `storage.enabled: true`（backend: sqlite），状态走本地 SQLite。

**Core 起不来，提示需要 API Key？**

非回环地址监听时必须设置 `TDAI_GATEWAY_API_KEY`。另外注意一键部署脚本有个已知约定：`MEMORY_CORE_GATEWAY_API_KEY` 需留空——proxy 的 auth 校验调用 verify 时不带 Bearer 头，强开 Gateway 层鉴权会不兼容。

## 记忆生成类

**L1/L2 一直没跑起来，面板没有记忆产出？**

最常见的两个原因：

- 配置了 `promptMode=code` 但对话内容是闲聊——LLM 判定无可沉淀内容返回 0 条。改回 `chat` 或做真实工作对话（改文件、跑测试、给结论）。
- 对话轮数还没到触发阈值。默认每 5 轮触发一次（有预热机制，前几轮更快）；会话闲置超时也会触发。可用 `/health` 的 pipelineWorker 计数确认管线是否消费了任务。

**想切换到别的 team/agent？**

新开一个 agent 会话（新窗口/新 session）就会重新弹绑定表单。

**导入的历史会话时间线错乱？**

v2.0.1-beta.1 已修复该问题，请升级到最新镜像。

## 客户端兼容类

**CodeBuddy 不弹 session init？**

版本 4.10.2–4.10.4 存在已知 Bug：请求不携带 sessionId。换 ≥ 4.10.5 或 ≤ 4.10.1。

**Hermes/OpenClaw 记忆完全不生效？**

按顺序检查四个 header 是否齐全且值正确：`x-team-id` / `x-agent-id` / `x-task-id` / `x-conversation-id`。缺任何一个都会 session bypass。特别注意 `x-task-id` 当前必填，以及静态 conversation ID 需要"每次新对话手动更换"。

**dsh 报错 baseURL 相关异常？**

检查两点：尾巴不能带 `/v1`（dsh 客户端硬编码 `${baseURL}/chat/completions`）；`.credentials.yaml` 权限必须是 600、目录 700。

## 数据与迁移类

**从旧版升级后数据不见了/启动报格式错误？**

v1.x/v0.x（数据格式 v2）升级到 v2.0.0+（v3）必须先跑迁移脚本再启动新版 Gateway：

```bash
python scripts/migrate-v2-to-v3/v2-to-v3-migrate.py ~/.memory-tencentdb/memory-tdai --dry-run
# 确认无误后去掉 --dry-run 执行
```

迁移前务必备份整个数据目录。详见进阶篇[升级与数据迁移](../advanced/upgrade-migration.md)。

## 其他注意事项

- Wiki 与 CodeGraph 是异步构建的，导入后需等待处理完成才能 ready；
- 全自动记忆路由仍在迭代，当前通过面板人工绑定资产即可覆盖绝大多数场景；
- 遇到本文未覆盖的问题，到 [GitHub Issues](https://github.com/TencentCloud/TencentDB-Agent-Memory/issues) 提交，项目方承诺 24 小时内响应。
