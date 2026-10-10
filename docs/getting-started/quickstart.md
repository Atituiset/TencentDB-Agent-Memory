# 一键部署三件套

## 拉起服务

整个过程四条命令：

```bash
# 1) 拿脚本
git clone https://github.com/TencentCloud/TencentDB-Agent-Memory.git
cd TencentDB-Agent-Memory/deploy/global-images

# 2) 准备 .env（把 LLM 相关字段填成真值）
cp .env.example .env
$EDITOR .env

# 3) 干跑校验（可选；会真做 LLM 通路预检，加 --skip-llm 跳过）
./verify.sh

# 4) 一键起
./start-all.sh
```

`.env` 里最关键的是两组 LLM 参数：

```dotenv
MEMORY_LLM_BASE_URL=...      # memory + hub 内部提炼用
MEMORY_LLM_API_KEY=...
MEMORY_LLM_MODEL=...

PROXY_UPSTREAM_URL=...       # proxy 转发到的上游（你实际对话的模型）
PROXY_UPSTREAM_API_KEY=...
PROXY_UPSTREAM_MODEL=...
```

## 脚本背后发生了什么

理解脚本的编排逻辑，出问题时才知道去哪看。`start-all.sh` 在 `tdai-memory-stack` 这个 Docker 网络上按依赖顺序拉起三个容器，每一步都等待健康检查通过再继续：

**Memory Core 容器**：脚本动态生成一份 standalone 模式的 Gateway 配置（开启 Skill、pipeline 每 5 轮触发、召回阈值 0.3），挂载到容器内并挂一个 named volume 做数据持久化。接着是 **init-admin 流程**——用 openssl 生成 `sk-mem-<32位随机>` 作为管理员密钥，调用 `/v3/internal/meta/user/init-admin` 注册 admin 用户；密钥以严格文件权限落盘为 `./.admin-key`，重复执行会复用已有文件。

**Memory Hub 容器**：合并镜像同时跑 Panel 与 Knowledge Service。它通过容器网络别名 `http://memory-core:8420` 连接 Core，脚本还会探测宿主机局域网 IP 以生成正确的对外访问地址。

**Proxy 容器**：同样由脚本从 `.env` 生成最小 config.yaml，打开三大开关——鉴权（auth）、会话初始化（sessionInit）、记忆接入（tdai）——即 `PROXY_FULL_STACK=1` 的完整流水线。

全部就绪后，脚本打印服务地址表和一段可直接复制运行的 Claude Code 启动命令。

## 端口速查

| 服务 | 端口 | 用途 |
|---|---|---|
| Memory Core | `8420` | 记忆读写、鉴权、skill/RAG 数据面 |
| Panel UI | `8125` | 团队记忆管理面板 |
| Knowledge | `8424` | Wiki / Code-Graph 服务（Swagger 在 `/docs`） |
| Proxy | `8096` | LLM 请求代理（Anthropic / OpenAI 双协议） |

## verify.sh 都检查什么

建议第一次部署前跑一次干跑。它会依次验证：Docker 可用性、`.env` 存在且必填字段没有遗留 `REPLACE_ME` 占位、本地镜像是否存在（仅警告）、端口占用情况（仅警告）、以及**真实的 LLM 通路预检**——对 openai 协议端点发 `GET /models`（零 token 消耗），对 anthropic 协议端点发一条 `max_tokens=1` 的探测消息（≤10 token）。两组 LLM 配置相同时自动去重。任何 error 会中止，warning 放行。

这个预检能提前暴露最常见的部署事故：API key 写错、base URL 尾部多了或少了 `/v1`、模型名不存在、公司网络出口被墙。

## 只装 Memory Hub 的轻量形态

如果本机已经有一个跑着的 Memory Core（比如源码启动的开发实例），一条命令拉起面板：

```bash
docker run -d --name tdai-memory-hub \
  --add-host=host.docker.internal:host-gateway \
  -p 8125:8125 -p 8424:8424 \
  -v tdai-panel-data:/data/knowledge \
  -e REMOTE_INSTANCE_URL=http://host.docker.internal:8420 \
  -e REMOTE_INSTANCE_KEY=local \
  -e KNOWLEDGE_PUBLIC_BASE_URL=http://host.docker.internal:8424/v3 \
  -e LLM_MODE=custom \
  -e LLM_BASE_URL=<OPENAI_COMPATIBLE_BASE_URL> \
  -e LLM_API_KEY=<YOUR_API_KEY> \
  -e LLM_MODEL=<MODEL_ID> \
  docker.io/agentmemory/memory-hub:latest
```

注意 `KNOWLEDGE_PUBLIC_BASE_URL` 必须带 `/v3` 后缀且 Agent 可达；`REMOTE_INSTANCE_*` 指向你的 Core 地址。

## 停止与清理

```bash
./stop-all.sh            # 停容器，保留 volume 数据 & admin key
./stop-all.sh --purge    # 连 volume、admin key、proxy config 一起清
```

数据都在 named volume 里，普通 stop/start 不丢；只有 `--purge` 才是彻底重来。admin 密钥丢了又没 purge 的话，只能 purge 重建。
