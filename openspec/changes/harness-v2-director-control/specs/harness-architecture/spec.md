# harness-architecture — 架构与流转流程

> 本 spec 定义 Harness V2 的整体架构、六要素规范遵循、调度权分层、端到端流转流程。

## 新增需求 (ADDED Requirements)

### 需求: Harness V2 必须遵循标准 Harness 工程六要素规范

系统 SHALL 包含 agents / skills / hooks / workflow / scripts / memory 六大要素, 并各自有明确的目录与实现。

#### 场景: 启动时六要素全部就绪
- **WHEN** `initHarness()` 完成
- **THEN** AgentRegistry 注册 15 个 Agent (13 工种 + 导演调度者 + 制片人)
- **AND** RulesEngine 加载 `data/rules/*.md` 共 13 个规则文件
- **AND** SkillsRegistry 加载 `data/skills/<role>/*.md`
- **AND** Hooks 注册 5 个钩子 (beforeTask / afterTask / onReview / onReroute / onUserConfirm)
- **AND** WorkflowRunner 加载 `data/workflows/*.yaml` 作为可选模板
- **AND** ScriptExecutor 加载 `data/scripts/*.js`
- **AND** MemoryBus 初始化 `o_memory` 表

### 需求: 调度权分层 — 导演 Agent 是顶层调度者

系统 SHALL 把导演 Agent (DirectorOrchestrator) 设为 Harness 的顶层调度者, WorkflowRunner 降级为单任务执行容器。

#### 场景: 导演 Agent 决策下一步
- **WHEN** 用户发送消息 "开始制作《退婚后...》"
- **THEN** DirectorOrchestrator 调用 LLM 决策
- **AND** 返回结构化 JSON `{ action: "dispatch", nextTask: { agentRole: "screenwriter", ... } }`
- **AND** 调用 `workflowRunner.enqueueTask(nextTask)`

#### 场景: WorkflowRunner 仅执行单任务
- **WHEN** DirectorOrchestrator 调用 `enqueueTask(taskNode)`
- **THEN** WorkflowRunner 执行该任务: bindInputs → createInstance → init → execute → cleanup
- **AND** 应用 review-gate (如有配置)
- **AND** 发出 task.started / task.progress / task.completed / task.failed 事件

### 需求: 端到端流转必须覆盖从小说到成片的 14 个步骤

系统 SHALL 支持完整的端到端流转: 用户启动 → 制片人立项 → 导演决策 → 编剧 → 监制审核 → 用户确认 → 副导演 → 美术部并行 → DP 生图 → 视效生视频 → 剪辑录音 → 终审 → 用户确认 → 制片人汇报。

#### 场景: 完整流程跑通
- **WHEN** 用户在主控台输入小说并启动
- **THEN** 系统按 14 步顺序执行, 每步产物落库, 关键节点用户确认
- **AND** 最终在 `o_assets` 中有视频产物, 在 `o_script` 中有剧本, 在 `o_storyboard` 中有分镜

### 需求: 多 Agent 协作必须有契约定义

系统 SHALL 要求每个 Agent 声明 AgentContract (角色定义/上场时机/输入输出/相互关系/失败兜底)。

#### 场景: 编剧 Agent 契约可查询
- **WHEN** 开发者查询 `agentRegistry.getContract("screenwriter")`
- **THEN** 返回 `{ role, name, description, triggerConditions, inputs, outputs, dependsOn, canBeReroutedFrom, canRerouteTo, onFailure, maxRetries }`

### 需求: 提示词驱动 — 除 pipeline 代码外全部由 LLM + 提示词决策

系统 SHALL 把调度决策、审核决策、驳回决策全部交给 LLM + 提示词完成, 仅保留确定性逻辑 (FFmpeg 合并、数据转换、参数注入) 在代码中。

#### 场景: 导演调度决策由 LLM 生成
- **WHEN** 一个 task 完成, 需要决策下一步
- **THEN** DirectorOrchestrator 调用 LLM, 输入当前任务图 + 已完成任务 + 用户意图
- **AND** LLM 输出 JSON 决策 `{ action, nextTask, userPrompt, message }`

#### 场景: 监制审核决策由 LLM 生成
- **WHEN** ReviewPipeline 完成 3 阶段评分
- **THEN** SupervisorAgent 调用 LLM, 输入评分 + 失败维度 + 历史驳回记录
- **AND** LLM 输出 JSON 决策 `{ action: approve|reroute|ask_user, targetAgent, retryInstruction }`
