# harness-department-agents — 13 工种 Agent 完整定义

> 本 spec 定义 13 工种 Agent 的角色、上场时机、输入输出契约、相互关系、打回路径。

## ADDED Requirements

### Requirement: 15 个 Agent 全部注册到 AgentRegistry

系统 SHALL 在 `src/agents/<role>/` 下注册 15 个 Agent: producer / director / assistant_director / supervisor / script_supervisor / screenwriter / dp / lighting / costume / makeup / set_decorator / sound / sound_designer / editor / vfx。

#### Scenario: AgentRegistry 启动后列出 15 个 Agent
- **WHEN** `initHarness()` 完成
- **THEN** `harness.agentRegistry.listAll().length === 15`
- **AND** 每个 Agent 的 `descriptor` 包含 `id` / `name` / `role` / `capabilities` / `version` / `factory`

### Requirement: 每个 Agent 必须有中文 system prompt

系统 SHALL 为 15 个 Agent 各编写中文 system prompt, 定义其角色、职责、输入输出格式、约束。

#### Scenario: 编剧 Agent 的 system prompt
- **WHEN** ScreenwriterAgent.init() 被调用
- **THEN** `agent.getSystemPrompt()` 返回中文 prompt, 包含:
  - 角色定义: "你是 Toonflow 影视项目的编剧"
  - 输入格式: "接收小说原文"
  - 输出格式: "场号|场景|人物|对白|动作|时长"
  - 约束: "每场戏 30 秒-3 分钟, 保留核心情节"

### Requirement: Agent 上场时机由导演 Agent 决策

系统 SHALL 把 Agent 的上场时机决策权交给导演 Agent (LLM), 而非静态 DAG 写死。

#### Scenario: 编剧完成 → 导演决策派副导演
- **WHEN** ScreenwriterAgent 的 task.completed 事件到达
- **THEN** DirectorOrchestrator 调用 LLM 决策
- **AND** LLM 输出 `{ action: "dispatch", nextTask: { agentRole: "assistant_director", input: { script: "<upstream>" } } }`

#### Scenario: 美术部三工种并行
- **WHEN** 副导演完成分镜
- **THEN** 导演 Agent 决策"美术部三工种并行"
- **AND** 并行派发 3 个任务: costume / makeup / set_decorator
- **AND** parallelDegree=3

### Requirement: Agent 输入输出必须有结构化契约

系统 SHALL 要求每个 Agent 的 `execute()` 返回值包含结构化 `data` 对象, 其字段映射到业务表。

#### Scenario: DPAgent 输出契约
- **WHEN** DPAgent.execute() 返回
- **THEN** `result.data.images` 是数组, 每个元素包含 `{ shotId, imageUrl, compositionPrompt, backend, workflowId }`
- **AND** CallbackBridge 据此写入 `o_assets` (type=image) 和 `o_storyboard.imageUrl`

#### Scenario: 编剧 Agent 输出契约
- **WHEN** ScreenwriterAgent.execute() 返回
- **THEN** `result.data.script` 是字符串, 格式为 "场号|场景|人物|对白|动作|时长"
- **AND** CallbackBridge 解析场号并写入 N 行 `o_script`

### Requirement: Agent 失败必须显式抛错 (无 mock)

系统 SHALL 禁止 Agent 在失败时返回 mock 数据, 必须抛出 `AgentExecutionError`。

#### Scenario: DPAgent 调用 API 失败
- **WHEN** `ai.Image()` 抛出 API 限流错误
- **THEN** DPAgent 抛出 `AgentExecutionError("api_error", { prompt, backend, humanReadableReason: "图片生成 API 配额已用完" })`
- **AND** 不返回 mock 图片路径

#### Scenario: 编剧 LLM 返回无法解析
- **WHEN** ScreenwriterAgent 的 LLM 返回非标准格式
- **THEN** 抛出 `AgentExecutionError("parse_failed", { rawText })`
- **AND** 不返回默认剧本

### Requirement: Agent 之间必须通过 MemoryBus 共享上下文

系统 SHALL 允许 Agent 通过 MemoryBus 写入和读取共享上下文 (角色库、风格、分镜等)。

#### Scenario: 服装 Agent 写入角色服装设定
- **WHEN** CostumeAgent 产出服装方案
- **THEN** 调用 `memoryBus.set({ namespace: "agent:costume", key: "<characterId>:outfit", value: <spec>, type: "long-term" })`

#### Scenario: DP Agent 读取角色服装设定
- **WHEN** DPAgent 生成图片前
- **THEN** 调用 `memoryBus.get({ namespaces: ["agent:costume"], keys: ["<characterId>:outfit"] })`
- **AND** 把服装设定拼入构图 prompt

### Requirement: Agent 必须有专属 ReviewCriteria 文件

系统 SHALL 为 15 个 Agent 各提供 `data/rules/<id>.md` 文件, 包含 `## Review Criteria` 章节供 ReviewPipeline 解析。

#### Scenario: ReviewPipeline 加载 DP 审核标准
- **WHEN** `ReviewPipeline.loadCriteriaForAgent("dp")` 被调用
- **THEN** 返回 `ReviewCriterion[]`, 包含 resolution / composition / styleMatch / shotTypeRatio / lightingConsistency 等维度
- **AND** 每个维度有 weight / threshold / description

### Requirement: 跨工种打回路径必须按设计文档定义

系统 SHALL 按 design.md 第 5.3 节的协作矩阵实现跨工种打回: DP→编剧 (内容不符) / DP→服装化妆 (角色不一致) / 视效→DP (首帧图问题) / 剪辑→视效 (视频卡顿) 等。

#### Scenario: DP 图片角色不一致, 打回给服装
- **WHEN** SupervisorAgent 判断 "角色一致性评分 0.6 < 0.7"
- **THEN** 输出决策 `{ action: "reroute", targetAgent: "costume", retryInstruction: { suggestions: ["陈凡的西装颜色改为深蓝"] } }`
- **AND** DirectorOrchestrator 重新派活给 CostumeAgent
