# 升级与数据迁移

## 版本演进脉络

公开仓库的 CHANGELOG 从 2.0.0-beta.1 起步（更早的 v0.x/v1.x 是内部历史）。关键节点：

| 版本 | 时间 | 里程碑 |
| --- | --- | --- |
| 2.0.0-beta.1 | 2026-07-21 | 首次公开发布：四类记忆资产、Memory Hub、Proxy 双协议、三镜像、官方 SDK |
| 2.0.0 | 2026-08-03 | Skill 强制归档、CodeGraph 定时同步、Cost Guard、面板中英文、System Admin 开放资产管理 |
| 2.0.1-beta.1 | 2026-08-13 | 冷启动开箱即用（默认 Agent + 预置 Skill）、Wiki 并发加速、Codex/WorkBuddy/dsh 接入、清空对话记忆 |
| 2.0.1-beta.2 | 最新 | 发布迭代（文档与图标更新） |

## 数据迁移：v2 → v3

v1.x / v0.x 的数据格式是 v2；v2.0.0+ 使用格式 v3。**升级后必须先迁移再启动新版 Gateway**，否则新代码无法读取旧数据。

### 迁移步骤

```bash
# 0) 备份！备份整个数据目录
cp -r ~/.memory-tencentdb/memory-tdai ~/.memory-tencentdb/memory-tdai.bak

# 1) dry-run 检查，确认无报错
python scripts/migrate-v2-to-v3/v2-to-v3-migrate.py \
  ~/.memory-tencentdb/memory-tdai --dry-run

# 2) 正式执行
python scripts/migrate-v2-to-v3/v2-to-v3-migrate.py \
  ~/.memory-tencentdb/memory-tdai
```

工具位于 `MemoryCore/scripts/migrate-v2-to-v3/`，目录内有独立的 README 说明全部参数。其他存量迁移脚本还有 `migrate-sqlite-to-tcvdb`（SQLite → 腾讯云向量库）与 `import-opik-to-memory-core`（从 Opik 导入历史数据）。

## 升级操作建议

- **Docker 部署**：named volume 里的数据跨版本保留；拉新镜像重启即可。跨大版本（v1→v2）先对 volume 里的数据目录跑迁移脚本；
- **源码部署**：pull 后 `npm install && npm run build` 再迁移再启动；
- **SDK**：注意 npm 包名曾迁出 `-v2` 后缀的历史；Python 包根导入默认给 v2 兼容客户端，v3 要显式 `from tencentdb_agent_memory.v3 import ...`；
- **Proxy 客户端配置**：小版本内兼容；大版本留意 INSTALL 文档中的已知限制变化（例如 `x-task-id` 必填是否放开）。

## CI 红线：贡献者必读

项目的 CI（`.github/workflows/pr-ci.yml`）目前聚焦 MemoryCore，五个 job：

1. **Install**：Node 22 + 依赖缓存；
2. **Pack**：`npm pack` 并上传 tgz 工件（7 天留存）;
3. **Manifest**：校验 `openclaw.plugin.json` 合法性与 package.json 的 OpenClaw 扩展元数据；
4. **Size Guard**：tarball ≤ 2048 KB，超了直接失败——插件体积是被硬约束的；
5. **Skill Queue Isolation**（最特殊）：跑 `scripts/ci/check-skill-queue-isolation.sh`，基于设计文档 `docs/design/2026-06-16-skill-extract-queue.md` 检查 diff：
   - 禁止触碰记忆模块红线文件（state/pipeline-worker/integrations/redis）;
   - 禁止 `src/core/skill/**` 新增直接 fs import。

这条红线的背景：Skill 抽取队列被刻意设计为与记忆管线隔离的独立队列——保证 Skill 归档的延迟不影响主记忆链路，也保证它不依赖进程本地状态。改动这些区域前先读对应设计文档。

## Roadmap 摘要

v2.0.1 正式版规划中的重点方向：

- **Agent 模版**：管理员定义默认 Agent 的初始资产装配（冷启动的下一步）；
- **`mem:` 指令扩展到 Task 维度**：对话内创建/更新 Task；
- **记忆可编辑**：L1-L3 支持面板编辑修正——从"系统产出的结果"变为"可人工校准的资产"；
- **L0/L1 记忆搜索**：按内容定位而不仅是时间过滤；
- **Cursor 支持**：新增客户端适配。

完整计划见仓库 `ROADMAP_CN.md`；优先级会根据社区反馈动态调整。
