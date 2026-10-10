# 建立组织结构并接入 Claude Code

服务起来只是第一步。要让 coding agent 真正用上团队记忆，需要在面板里**建组织结构**，然后**在会话里绑定它们**。本章走完这条最核心的路径。

## 第 1 步：登录管理面板

打开 `http://localhost:8125`，用 `start-all.sh` 结尾打印的 admin `user_key`（即 `deploy/global-images/.admin-key` 里的 `sk-mem-...`）登录。

这里推荐养成一个好习惯——**隔离运维口与应用口**：

- admin 是"运维口"，用来管人（建团队、录成员）；
- 业务用户是"应用口"，用来管资产、跑 agent。

具体操作：在「用户管理」新建一个 `normal` 用户（面板操作或直接调 API 均可）：

```bash
ADMIN_KEY=$(cat ./.admin-key)
curl -sS -X POST http://localhost:8420/v3/meta/user/create \
  -H "x-tdai-user-key: $ADMIN_KEY" \
  -H "x-tdai-service-id: default" \
  -H "Content-Type: application/json" \
  -d '{"username":"you"}' | jq
```

返回体里的 `data.default_user_key` 是新用户的登录密钥——**只在创建时返回这一次**，立即保存。之后退出 admin，用这把新 key 重新登录。

## 第 2 步：建 Team / Agent / Task

Coding Agent 使用记忆必须落到 `team / agent / task` 三元组上：

1. **Team**：左侧「团队」→ 新建。它是资产的归属容器。
2. **Agent**：进入 Team → 「Agent」→ 新建。给它填一段清晰的角色说明（description + system prompt），例如"bug-fix 工程师""前端评审 agent"。
3. **Task**（可选）：Team →「任务」→ 新建，比如"修复登录页 XSS"。记忆会关联到 Task；不建也能用，但 L2/L3 会缺 Task 维度。

至少建 **1 个 Team + 1 个 Agent** 再继续。

> v2.0.1 起有冷启动优化：新建团队自带默认 Agent 并预置导入 Skill，不必从零开始配。

## 第 3 步：把 Claude Code 指向 Proxy

```bash
export ANTHROPIC_BASE_URL=http://127.0.0.1:8096/claude-code/default
export ANTHROPIC_AUTH_TOKEN="<业务用户的 sk-mem-...>"
claude --model <PROXY_UPSTREAM_MODEL 配的模型>
```

三个值的含义值得逐个理解：

- `ANTHROPIC_BASE_URL` 把 CC 的 API 从 anthropic.com 改指本机 proxy；路径里的 `default` 是 memory 实例 ID；
- `ANTHROPIC_AUTH_TOKEN` 是**业务用户**的 user_key——proxy 用它去 Core 反查身份，只有这个用户拥有的 team/agent/task 会出现在下一步的选择表单里；
- `--model` 必须是 `.env` 里 `PROXY_UPSTREAM_MODEL` 配置过的上游模型名。

## 第 4 步：首次会话的三连问

每开一个新的 CC 会话，proxy 会借 CC 自带的 `AskUserQuestion` 工具依次弹出：

```text
1. 请选择本次会话所属的 Team：
   ○ Team A    ○ Team B
2. 请选择「Team A」下要使用的 Agent：
   ○ bug-fix 工程师    ○ 前端评审 agent
3. 请选择关联的任务（可选）：
   ○ 修复登录页 XSS    ○ [跳过任务关联]
```

箭头键选择、回车确认。选完之后 proxy 记住本次会话的绑定，后续每一轮自动注入所选 Agent 的 L2/L3 记忆、skill 与 knowledge；同一进程内不再重复询问。想换绑定的 Team/Agent？开一个新 CC 会话即可重新弹表单。

## 第 5 步：观察记忆一层层长出来

真实工作几轮之后（改文件、跑测试、给出结论——而不是闲聊），回到面板验证循环是否转起来了：

- 左侧**「记忆」→ Chat Memory**：L0 原始对话被切分出的 scene 开始出现；
- **Agent 详情页 → Profile**：L2 场景块与 L3 画像逐步累积；
- **Skill 列表**：如果 LLM 判定对话里有可复用的操作方法，会自动抽出候选 Skill。

命令行侧可以用健康检查看后台管线是否在工作：

```bash
curl -s http://localhost:8420/health | jq .services.pipelineWorker
# tasksConsumed / tasksCompleted 应随对话增长
```

## 给记忆喂点什么

第一次看到空面板很正常——记忆需要素材。几个立竿见影的做法：

- 和 agent 做**真实工作对话**：让它读代码、改文件、复现一个 bug；
- 明确说出约束和偏好："这个项目不要引入新依赖""我们统一用 pnpm"——这些会被提炼为 L1 原子记忆；
- 完成一次复杂排障后输入 `mem:create-skill`，把过程归档为 Skill；
- 直接导入历史对话 Session（见[冷启动](./cold-start.md)）。
