# production-agent (二轮 delta)

> 来自一阶段。本 spec 是 delta 增量, 描述 productionAgent 流水线被 8 工种拆分替代。

## 修改的需求 (MODIFIED Requirements)

### 需求: productionAgent 流水线被 8 工种拆分

**替换** (来自一阶段): "productionAgent 是从分镜到成片的单一 Agent"

系统 SHALL 把单 Agent 流水线 (storyboard + image gen + video gen + edit) 拆为 8 个工种协作: dp / lighting / costume / makeup / set_decorator / sound_designer / editor / vfx。原 productionAgent 保留为 deprecated façade, 调用时打印警告并委托给 DirectorOrchestrator。

#### 场景: productionAgent 调用时打印 deprecation 警告
- **WHEN** 任何代码调用 `productionAgent.execute(ctx)`
- **THEN** 打印 `console.warn("[productionAgent] DEPRECATED, use DirectorOrchestrator with department agents")`
- **AND** 委托给 `directorOrchestrator.enqueueHarnessFromExistingProject(projectId)`

### 需求: 图片生成路由到 DP, 不再由 productionAgent 处理

**替换** (来自一阶段): "productionAgent 内的 image generation step"

系统 SHALL 让所有图片生成通过 DPAgent, 由 DirectorOrchestrator 按 shot 派发, 支持 VisualStyleSpec / 角色库 / retryInstruction。

#### 场景: 导演 Agent 按 shot 并行派发 DP
- **WHEN** AssistantDirectorAgent 返回 24 个 shots
- **THEN** DirectorOrchestrator 派发 24 个 DPAgent 任务 (parallelDegree=4)
- **AND** 每个 DPAgent 任务接收 `{ shot, style, retryInstruction? }`
- **AND** 并行发出 24 个 task.completed 事件

### 需求: 视频生成路由到 VFX, 不再由 DP 处理

**替换** (来自一阶段): "video generation 也由 DP 完成 (实际是 bug)"

系统 SHALL 让所有视频生成通过 VFXAgent, 与 EditorAgent 的 clip plan 结合, 调用视频生成 API 或 ComfyUI 视频工作流。

#### 场景: 导演 Agent 按 clip 派发 VFX
- **WHEN** EditorAgent 返回 editTimeline.tracks[0].clips[]
- **THEN** DirectorOrchestrator 派发 N 个 VFXAgent 任务 (parallelDegree=2)
- **AND** 每个 VFXAgent 任务接收 `{ clip, style, previousFrame? }`
- **AND** 输出 videoUrl 写入 o_assets (type=video)
