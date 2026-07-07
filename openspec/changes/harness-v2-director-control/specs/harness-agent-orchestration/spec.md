# harness-agent-orchestration (二轮 delta)

> 来自一阶段 `toonflow-harness-upgrade`。本 spec 是 delta 增量, 描述 WorkflowRunner 职责收缩为"单任务执行容器"。

## 修改的需求 (MODIFIED Requirements)

### 需求: WorkflowRunner 是单任务执行容器, 不再是顶层调度者

**替换** (来自一阶段): "WorkflowRunner 是 Harness 引擎的顶层调度器"

系统 SHALL 把 WorkflowRunner 的职责限制为执行单个工种任务: bindInputs → createInstance → init → execute → cleanup → 应用 review-gate → 重试预算 → 发出 task.* 事件。顶层调度 (决定哪个 Agent 何时上场) SHALL 由 DirectorOrchestrator 完成。

#### 场景: DirectorOrchestrator 调用 enqueueTask
- **WHEN** DirectorOrchestrator 决策派编剧
- **THEN** 调用 `workflowRunner.enqueueTask(taskNode)`
- **AND** WorkflowRunner 执行该单任务并返回结果
- **AND** WorkflowRunner 不再决定下一步派谁

### 需求: AgentRegistry 必须注册 15 个 Agent (8 旧 + 7 新 + 1 director 升级)

**增加** (来自一阶段): "AgentRegistry 自动扫描 src/agents/**/index.ts"

系统 SHALL 在 AgentRegistry 注册 15 个 Agent: 8 个原有 (screenwriter/director/dp/lighting/costume/sound/editor/vfx) + 7 个新增 (producer/supervisor/assistant_director/script_supervisor/makeup/wardrobe/set_decorator/sound_designer)。

#### 场景: listAll 返回 15 个 Agent
- **WHEN** `initHarness()` 完成
- **THEN** `harness.agentRegistry.listAll().length === 15`
- **AND** 每个 Agent 的 descriptor.id 唯一

### 需求: YAML 工作流变为可选模板

**修改** (来自一阶段): "YAML 工作流定义必需"

系统 SHALL 允许 Harness 实例不依赖 YAML 工作流, 完全由 DirectorOrchestrator 动态规划任务图。YAML 仅作为 LLM 决策失败时的降级方案。

#### 场景: 不传 workflowTemplate 启动 Harness
- **WHEN** `POST /api/harness/control/start` 不传 workflowTemplate
- **THEN** DirectorOrchestrator 用 LLM 动态规划任务图
- **AND** 不需要任何 YAML 加载

#### 场景: 传 workflowTemplate 作为提示
- **WHEN** 传 `workflowTemplate: "short-drama-production"`
- **THEN** DirectorOrchestrator 用该 YAML 的节点列表作为"候选工种集合"
- **AND** LLM 仍可增删任务
