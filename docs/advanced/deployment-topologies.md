# 部署形态进阶：单机到多节点

入门篇的一键三件套适合体验与小团队。本章讨论当规模、可靠性或合规要求提高时，各组件如何演进。

## 形态一：Standalone 单机（默认）

MemoryCore 的 standalone 模式是整个项目的默认形态：

- 状态全在进程内：任务队列用内存 Map + checkpoint 文件，定时器用 `setTimeout`；
- 存储：SQLite + 本地数据目录（`~/.memory-tencentdb/memory-tdai`）；
- 唯一外部依赖是 LLM API。

适用：个人使用、开发调试、Agent sidecar。局限：单点、无水平扩展、重启瞬间丢失进行中的管线任务（checkpoint 会恢复大部分状态）。

## 形态二：Service 模式

把 `deployMode` 切到 service 后，有状态的部分全部外置：

| 组件 | 外置为 |
| --- | --- |
| 任务队列 | Redis Stream |
| 定时调度 | 16 分片的 Timer ZSET（Lua 脚本原子认领） |
| 并发控制 | 分布式锁 `pipeline:{inst:tid:aid}[:s:sess]` |
| 向量存储 | TCVDB（服务端原生 hybrid 检索） |
| 大对象 | COS |
| 元数据 | MongoDB（可选） |

关键在于**业务 handler 与执行器完全复用**——两态差异收敛在 `pipeline-manager.ts` 与 `stateful-pipeline-manager.ts` 的状态管理层。这意味着从单机迁到 service 不需要改任何业务代码，只改配置与基础设施。

## Proxy 的多节点要点

Proxy 无状态化的前提是三个配置同时到位，缺一不可：

1. **`storage.backend=cos`**：会话/注入/Skill 状态跨节点共享。降级链上 sqlite/fs/memory 都不能多实例共享——用它们做多节点会导致各实例状态分裂；
2. **`injection.externalGatewayUrl` 显式配置**：让注入缓存指向统一入口。否则每个实例各自缓存，同一会话的请求轮转在不同实例上会造成上游 KV cache 反复 miss——成本和延迟双输；
3. **可选的一致性哈希网关**（`MemoryProxy/gateway/`）：按 keyId 一致性哈希把同一用户固定到同一 proxy 实例，进一步稳定缓存命中。`/skill-bridge` 与 `/memory-bridge` 前缀由外层 gateway 原样透传到 proxy 实例。

运维配套：`/v3/instance/proxy-destroy` 在实例销毁时清 COS 缓存；`/health` 的 `storage.effective` 是确认实际生效后端的观测锚点；停机前确保 L0 pending write 队列 flush 完成。

## 合并镜像与镜像发布

**panel-knowledge-combined**：Panel + KS 打进一个镜像（`deploy/panel-knowledge-combined/`），四阶段构建（panel-ui-builder → panel-builder → knowledge-builder → runtime）。入口脚本 `start-combined.sh` 优先尊重用户 bind-mount 的 `metadata-instances.json`；没有时用 env 现场生成单实例注册表，然后同容器拉起双进程。云上部署最少只需三项配置：instances JSON、`KNOWLEDGE_PUBLIC_BASE_URL`（必须含 `/v3` 且外部可达）、`KNOWLEDGE_LLM_PROXY_BASE_URL`。

**dockerhub 发布流水线**（`deploy/dockerhub/publish.sh`）：

```bash
VERSION=x.y.z ./publish.sh all   # 或 memory-core / memory-proxy / memory-hub
```

buildx 多架构（linux/amd64 + arm64）；`NAMESPACE=agentmemory`；支持 `ALSO_LATEST/PUSH/DRY_RUN/APT_MIRROR` 等开关。两个值得知道的细节：Proxy 的私有模块 cost-guard 用 stub 包顶替（运行时动态 import 失败自动降级直通）；MemoryCore 的 integrations 目录在 .dockerignore 中排除并走 fallback——开源镜像不携带内部集成代码，但功能完整。

## 安全加固清单

生产部署前过一遍：

- **Gateway 层**：非回环监听必须设置 `TDAI_GATEWAY_API_KEY`；CORS 默认关闭，只放行明确可信 Origin，禁止 `*`；
- **Proxy 层**：启用 `auth.enabled=true`；env 注入 `TDAI_PROXY_ADMIN_API_KEY` 保护运维端点；
- **凭证管理**：一切 Secret 走环境变量或 Secret Manager；`.env`/数据库文件/日志/导出数据绝不入库；提交前跑 `bash MemoryPanel/scripts/secret-scan.sh --strict`；
- **租户隔离**：每个请求校验实例与 Team/User/Agent 归属，防止跨租户访问；
- **凭证泄漏应急**：凭证一旦进入 Git 历史，立即轮换并清理历史。

## 容量与成本直觉

最后给几条 sizing 直觉：

- 记忆提炼（L1/L2/L3）的 LLM 开销与对话量成正比，`everyNConversations` 调大可省 token 但记忆更新变慢；
- Wiki ingest 是一次性大消耗（整批文档抽取），之后增量维护很便宜；
- Proxy 注入本身零 LLM 成本，但注入内容增加会推高每轮 input token——给不同角色配不同 Loadout 同时也是成本控制手段；
- CodeGraph 索引构建 CPU 密集，Auto-Sync 的扫描周期与并发数按仓库数量与机器规格权衡。
