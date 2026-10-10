# 术语表

按概念相关性分组，供阅读文档与源码时快速对照。

## 记忆模型

**L0 Conversation**：原始对话层。完整保留上下文，用于核对原话、时间与来源。

**L1 Atom（原子记忆）**：从对话中提取的事实、偏好、约束与事件，是最常被精确召回的一层。

**L2 Scenario / Profile（场景记忆）**：围绕项目或场景组织的知识块（Scene Markdown），挂在 Agent Profile 下，用于快速恢复工作场景。

**L3 Core / Persona（核心画像）**：跨场景沉淀的长期画像与稳定模式。

**Generation Log（生成溯源）**：每次 L1/L2/L3 生成留下的证据记录——Prompt ID、版本、内容哈希、输入输出引用。

## 资产与权限

**Memory Asset（记忆资产）**：Chat Memory、Skill、Wiki、CodeGraph 的统一登记形态，携带 Owner/Team/可见性/版本等元信息。

**Visibility（可见性）**：`private`（仅 Owner）/ `team`（团队成员）/ `restricted`（ACL 精确授权）/ `agent`（定向装配）四级。

**Fixed Binding（固定绑定）**：Agent 与资产间的显式绑定关系，Loadout 的数据基础。

**ACL**：User/Role/Agent 粒度的访问控制表，配合 restricted 可见性使用。

**Loadout（装配）**：一个 Agent 实际携带的记忆资产组合——先按权限收敛、再按问题召回。

## 组织结构

**Team / Agent / Task 三元组**：v3 数据面的强隔离维度。Team 是资产容器；Agent 是角色化执行者（也是被管理的元数据实体）；Task 是可选的工作抓手。

**Memory Instance（记忆实例）**：逻辑隔离的数据单元，请求经 `x-tdai-service-id` 声明；在 Proxy URL 中表现为 `<spaceId>` 段。

**System Admin / Team Admin / Member**：全局运维角色与团队内角色的两层体系。

## 服务与接口

**MemoryCore**：记忆与元数据核心服务（:8420），数据权威所在。

**Knowledge Service（KS）**：Wiki + CodeGraph 引擎（:8421/:8424），API 前缀 `/v3`。

**Panel / Memory Hub**：无状态 Web 管理控制台（:8125）。

**MemoryProxy**：透明 LLM 请求代理（:8096），在转发前后完成会话初始化、注入、回流与上报。

**Session Init（会话初始化）**：首次对话时绑定 team → agent → task 的交互流程；无法交互的客户端用 `x-team-id` 等 header 直接注册。

**Tools 协议**：`POST /v3/tools/list` + `/v3/tools/call` 的能力自发现协议，知识按需调用的落地形态。

## 存储与算法

**RRF（Reciprocal Rank Fusion）**：多路检索结果的排名融合算法，score = Σ 1/(k + rank)，k=60。

**BM25 / FTS5**：关键词检索算法与其 SQLite 实现；配合 jieba 中文分词。

**sqlite-vec / TCVDB**：本地向量扩展与腾讯云向量数据库；后者提供服务端原生 hybrid 检索。

**ProxyStorage**：Proxy 的统一存储抽象，四后端 cos/sqlite/fs/memory 加降级链。

**Offload**：大对象到 COS 或本地文件的下沉存储。

## 运行机制

**Pipeline（提炼管线）**：L0 → L1 → L2/L3 的异步生成系统，由 Scanner 触发、Worker 执行。

**Warm-up（预热阈值）**：新会话的触发阈值 1→2→4→8→…→N 翻倍爬升机制，保证冷启动快速产出首批记忆。

**KV Cache 保护**："稳定内容进 system prompt 尾部命中缓存，易变内容走工具"的注入分层原则。

**mem: 指令**：Proxy 在对话内拦截的轻量操作入口，如 `mem:sync`、`mem:create-skill`。

**Adapter 三步曲**：自定义接入件的标准模式——capture（写 L0）、recall（召回注入）、tools（暴露查询工具）。
