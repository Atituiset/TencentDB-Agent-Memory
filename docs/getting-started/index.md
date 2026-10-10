# 快速开始总览

本部分的目标是让你在半小时内从零跑到"看到记忆在面板里生长"。四章按真实使用顺序排列：

1. **[一键部署三件套](./quickstart.md)** —— 用官方脚本拉起 Memory Core + Memory Hub + Proxy，拿到管理员密钥。
2. **[建立组织结构并接入 Claude Code](./first-memory.md)** —— 登录面板建 Team/Agent/Task，把 coding agent 挂到 Proxy 上，完成第一次会话绑定，观察记忆生长。
3. **[更多客户端接入](./clients.md)** —— CodeBuddy、Codex、DeepSeek Harness、Hermes、OpenClaw 及任意 OpenAI 兼容平台的接入配置与差异对照。
4. **[冷启动：先读档再开工](./cold-start.md)** —— 把已有的代码库、文档和历史对话导入为资产，让新 Agent 团队从现有经验开始。

最后附一页**[常见问题排查](./troubleshooting.md)**，收录部署后最容易踩的坑。

## 部署前的准备清单

开始之前确认这几件事：

- **Docker** 已安装且可用（一键部署基于 Docker Compose 式的容器编排）；
- **两组 LLM 凭证**：
  - `MEMORY_LLM_*`（base URL / API key / model）：供 Memory Core 的记忆提炼和 Wiki 生成内部使用，任何 OpenAI 兼容端点均可；
  - `PROXY_UPSTREAM_*`：Proxy 转发用户对话请求的上游模型——这决定你在 Claude Code 里实际对话用的模型；
- **端口** 8420 / 8125 / 8424 / 8096 未被占用；
- 如果打算让局域网内其他机器访问，准备一个可路由的主机地址。

> 一个常见的取舍问题：两组 LLM 可以配同一个模型。记忆提炼的任务偏轻量（抽取、归纳），给它配一个便宜快速的模型是合理的省钱姿势；`PROXY_UPSTREAM_*` 则按你的编码质量要求选。

## 三条部署路径

| 路径 | 适合场景 | 入口 |
| --- | --- | --- |
| **完整三件套**（推荐） | 从零体验全部能力 | `deploy/global-images/start-all.sh` |
| 只装 Memory Hub | 本机已有 Memory Core 在跑 | `docker run agentmemory/memory-hub` |
| 源码启动 | 二次开发、调试 | 各组件目录 `npm install && npm run dev` |

本书主线走第一条；其余两条在对应章节给出最小步骤。生产部署与多节点扩展不在入门范围内，请直接阅读进阶篇的[部署形态进阶](../advanced/deployment-topologies.md)。
