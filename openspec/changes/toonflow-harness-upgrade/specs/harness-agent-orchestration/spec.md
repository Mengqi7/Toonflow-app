## ADDED Requirements

### Requirement: Workflow DAG 编排
Harness 引擎 MUST 支持用 YAML/JSON 定义 DAG 工作流，每个节点代表一个 Agent 任务或流程控制节点 (parallel-fork/parallel-join/review-gate)。引擎 MUST 自动解析拓扑顺序，在依赖满足时最大化并行执行。

#### Scenario: 小说到剧本的串行流水线
- **WHEN** 用户提交一部小说并启动 film-production 工作流
- **THEN** Harness 按拓扑顺序执行: screenwriter.analyze → screenwriter.adapt → screenwriter.generate → review.script，每步完成后将输出写入 WorkflowContext

#### Scenario: 并行生成多个分镜画面
- **WHEN** director.storyboard 输出包含 12 个 shot 的 storyboardPlan 后，工作流到达 generate.shots.fork 节点
- **THEN** parallel-fork 节点将 items 数组展开，以 parallelDegree=4 并行调度 12 个 generate.shot.unit 实例，每个实例独立执行 DP Agent → review.image，全部完成后由 parallel-join 聚合结果

#### Scenario: 工作流节点失败并重试
- **WHEN** review.image 节点判定某 shot 的质量分数 0.62 < passThreshold 0.75
- **THEN** 系统根据 onReject=retry 自动生成 RetryInstruction（含失败原因+修改建议+建议参数），将 generate.shot.unit 节点状态置为 pending，重新执行 Agent 并传入 retryInstruction，最多重试 maxRetries 次

#### Scenario: 工作流暂停和恢复
- **WHEN** 用户在 generate.shots 阶段点击"暂停"
- **THEN** WorkflowRunner.pause() 将当前运行的节点完成（不中断执行中的），新的节点不再调度，WorkflowInstance 状态变为 paused，所有 WorkflowContext 数据写入 o_workflow_state 表持久化。恢复时调用 resume() 从断点继续


### Requirement: Agent 通信协议
Agent 之间 MUST 通过标准化协议通信。Agent 不直接调用其他 Agent，而是通过 WorkflowContext 读写数据 + EventBus 发送事件，由 WorkflowRunner 作为中介协调。

#### Scenario: 导演 Agent 向 DP Agent 传递风格约束
- **WHEN** director.style 完成并输出 visualStyle 到 WorkflowContext
- **THEN** DP Agent 在 init 阶段通过 ctx.input.bindings["style"] 解析引用路径，从 WorkflowContext 中获取完整的 VisualStyleSpec 对象，无需知道 producer Agent 的身份

#### Scenario: Agent 请求协作（导演要求 DP 重新构图）
- **WHEN** 导演 review.image 判定构图不通过需要 DP 重新生成
- **THEN** 不是导演直接调用 DP Agent，而是 WorkflowRunner 收到 review-gate 的驳回结果后，自动将 generate.shot.unit 节点重置为 pending 状态，携带 RetryInstruction（含导演的构图建议）重新调度。DP Agent 从 ctx.input 中读取 retryInstruction 并据此调整生成策略

#### Scenario: 跨 Agent 事件通知
- **WHEN** 编剧 Agent 完成剧本生成
- **THEN** 通过 EventBus.emit("agent:screenwriter:script-complete", { projectId, scriptId }) 发布事件，导演 Agent 的监听器收到后触发 styleInference 准备，UI 端也收到该事件更新进度条


### Requirement: 工作流状态持久化与恢复
系统 MUST 支持将运行中的 WorkflowInstance 完整持久化到 SQLite，支持服务重启后从断点恢复。

#### Scenario: 服务器意外重启后恢复
- **WHEN** 服务器在 film-production 工作流执行到 generate.shots 阶段（已完成 5/12 个 shot）时因故障重启
- **THEN** 重启后系统从 o_workflow_state 表读取 WorkflowInstance：nodeStates 显示 generate.shot.unit[0-4] 为 completed、[5-11] 为 pending；WorkflowContext.data 包含已完成节点的所有输出数据。系统自动调用 resume()，从 generate.shots.fork 继续调度剩余 7 个 shot

#### Scenario: 工作流数据存储策略
- **WHEN** WorkflowContext.data 中包含大体积的二进制数据（生成的图片 base64）
- **THEN** 图片数据存储在 oss 目录，WorkflowContext 中只保存文件路径引用（imageUrl），确保 o_workflow_state 的单行数据不超过 100KB。表结构: (id TEXT, definitionId TEXT, status TEXT, nodeStates TEXT, contextRefs TEXT, timestamps TEXT)


### Requirement: Agent 能力协商与降级
系统 MUST 在 Agent 执行前验证所需能力是否可用，不可用时尝试降级方案或通知用户。

#### Scenario: ComfyUI 不可用时降级为 API
- **WHEN** DP Agent 的 selectBackend() 返回 "comfyui" 但 MCPConnector.healthCheck("comfyui-server") 返回 false
- **THEN** Agent 自动降级为 "api" 后端，在返回的 AgentResult 中标记 metrics.degraded: true，并记录日志 "ComfyUI server 不可用，已降级为模型 API"

#### Scenario: 必需模型不可用时报错
- **WHEN** 导演 Agent 需要的 text model（配置在 o_agentDeploy）对应的 vendor 已被禁用
- **THEN** Agent 在 init 阶段抛出 CapabilityError，WorkflowRunner 将节点状态置为 failed，不进入重试（retryableErrors 不包含 CapabilityError），暂停工作流并通知前端"导演 Agent 启动失败：模型配置无效"


### Requirement: 资源感知调度
系统 MUST 感知外部服务的资源状态（ComfyUI GPU VRAM、模型 API 速率限制），在资源不足时自动排队或限流。

#### Scenario: ComfyUI VRAM 不足时排队
- **WHEN** parallel-fork 节点以 parallelDegree=4 同时向 ComfyUI 提交 4 个生成任务，但 ComfyUIClient.getSystemStats() 显示 vram_free < 2GB
- **THEN** WorkflowRunner 将超出 VRAM 容量的任务加入 ComfyUIQueue，设置 maxConcurrent=1，按 FIFO 顺序逐个提交。每个任务完成后释放 VRAM，下一个自动出队

#### Scenario: 模型 API 速率限制
- **WHEN** 短时间内向某文本模型 API 发起超过 10 个并发请求，返回 429 Too Many Requests
- **THEN** AIClient 自动启用速率限制器（token bucket），将超出速率的请求加入等待队列，以每秒 2 个请求的速度释放。Agent 调用方无感知，仅增加延迟


### Requirement: 工作流模板系统
系统 MUST 提供工作流模板机制，允许用户选择预设模板（电影/电视剧/短剧）或自定义 DAG 结构。

#### Scenario: 选择预设工作流模板
- **WHEN** 用户创建新项目时选择"短剧模式"（short-drama-production）
- **THEN** WorkflowRunner 加载 data/workflows/short-drama-production.yaml，其 DAG 结构简化（跳过灯光美术 Agent、合并剪辑和音频阶段），仅设 2 个审核关卡

#### Scenario: 用户自定义工作流
- **WHEN** 用户在"工作流编辑器"中拖拽 Agent 节点，自定义 DAG 结构并保存
- **THEN** 前端生成 WorkflowDefinition YAML，保存到 o_workflow_template 表。之后用户可以选择该自定义模板启动制作

#### Scenario: 工作流模板版本化
- **WHEN** Toonflow 升级后内置 film-production.yaml 的某些节点从 v1 变为 v2
- **THEN** 已存在的项目继续使用 v1 工作流定义。新项目默认使用 v2。用户在项目设置中可手动升级到 v2


### Requirement: 监控与遥测
系统 MUST 收集每个 Agent 的执行指标，供性能分析和成本优化。

#### Scenario: Agent 执行指标收集
- **WHEN** 任何一个 Agent 完成 execute()
- **THEN** AgentResult.metrics 包含: { durationMs, tokensUsed, apiCalls, imagesGenerated, costEstimate, retryCount }。WorkflowRunner 聚合所有节点指标到 WorkflowResult.metrics

#### Scenario: 工作流瓶颈分析
- **WHEN** film-production 工作流完成后
- **THEN** 系统输出各阶段耗时占比: 编剧 8%、导演 5%、画面生成 65%（ComfyUI 平均单张 45s）、剪辑 15%、音频 7%。用户可据此优化（如升级 ComfyUI GPU 或用 API 替代）
