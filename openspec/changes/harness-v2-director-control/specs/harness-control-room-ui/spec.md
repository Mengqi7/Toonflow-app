# harness-control-room-ui - AI影视智能工作台

> 本 spec 定义 Harness 主控台 (`#/harness/control/:instanceId`) 的第一阶段 UI、原型与交互规范。

## ADDED Requirements

### Requirement: 主控台必须呈现 AI 制片指挥舱

系统 SHALL 在 `#/harness/control/:instanceId` 渲染 AI影视智能工作台，而不是单一生图仪表盘。

#### Scenario: 用户打开主控台
- **WHEN** 用户访问 `#/harness/control/demo`
- **THEN** 页面显示项目名、Harness 实例状态、暂停/恢复/版本入口
- **AND** 页面显示导演对话、Agent 任务图、产物队列、审核门禁和设置入口
- **AND** 页面不得以生图网格或 ComfyUI 参数面板作为主视觉重点

### Requirement: 主控台必须采用未来工业工厂中控布局

系统 SHALL 采用高信息密度的未来工业工厂中控布局：左侧流程管线，中间工位详情，右侧全局监控与审核门禁。

#### Scenario: 工厂中控渲染
- **WHEN** 主控台加载完成
- **THEN** 左侧以纵向发光管线展示调度类、执行类、审核类 Agent 工位
- **AND** 中间显示选中工位的输入信息、工作过程、产物输出、审核闭环四类信息
- **AND** 右侧显示整体进度、任务统计、异常告警、资源占用、循环次数、待处理门禁和设置入口

### Requirement: 导演对话必须支持内联决策卡

系统 SHALL 将 `director.user_input_required` 事件渲染为对话窗口中的内联决策卡。

#### Scenario: 监制要求人工确认
- **WHEN** 事件流收到 `director.user_input_required`
- **THEN** 导演对话追加确认卡片
- **AND** 卡片显示门禁标题、监制摘要、产物链接和可选决策
- **AND** 用户点击决策后调用 `POST /api/harness/control/:id/user-input`

### Requirement: 工作台必须展示细化 Harness Agent 工位

系统 SHALL 在主控台中展示调度类、执行类、审核类 Agent 工位，并明确每个工位的输入、输出、存储位、上下游和责任归属。

#### Scenario: Agent 任务图更新
- **WHEN** 事件流收到 `task.started`、`task.completed` 或 `review.reroute`
- **THEN** 对应 Agent 卡片状态实时更新为等待、运行中、已完成、需确认或已打回
- **AND** 执行类 Agent 至少覆盖剧本改编、台词打磨、角色设定、服化道设计、场景概念、衍生图合成、分镜脚本、分镜提示词优化、分镜生图执行、视频生成、一致性校验、配音生成、配乐适配、剪辑合成
- **AND** 审核类 Agent 至少覆盖剧本内容审核、角色设定审核、场景道具审核、分镜逻辑审核、提示词合规审核、图片质量审核、视频质量审核、音画同步审核、总监制

### Requirement: 工位详情必须全过程透明化

系统 SHALL 在选中任一 Agent 工位时展示输入信息区、工作过程区、产物输出区、审核闭环区。

#### Scenario: 用户查看分镜生图执行 Agent
- **WHEN** 用户选择分镜生图执行 Agent
- **THEN** 输入信息区显示已审核的分镜提示词包和指定模型配置
- **AND** 工作过程区显示模型名称、版本、参数、正向提示词、负面提示词、参考素材和分步日志
- **AND** 产物输出区显示逐镜分镜成品图、产物 ID、版本号、生成时间、AgentID
- **AND** 审核闭环区显示图片质量审核状态、审核意见、打回原因、修正要求和历史版本入口

### Requirement: 分镜模块必须提供专项强化视图

系统 SHALL 提供分镜生产线专项视图，完整展示镜头时间轴、提示词、模型参数、审核日志和版本对比。

#### Scenario: 用户查看单镜头详情
- **WHEN** 用户点击镜头卡片
- **THEN** 页面展示镜号、景别、时长、分镜文字描述、镜头语言参数、正向提示词、负面提示词、调用模型、采样参数、参考素材、审核记录和多版本生成结果
- **AND** 页面提供批量查看提示词合规报告、批量触发重生成和批量调整一致性约束的入口

### Requirement: 工作台必须展示产物回写队列

系统 SHALL 在主控台中展示 Harness 产物写回 Toonflow 业务表的状态。

#### Scenario: 剧本产物写回
- **WHEN** 事件流收到 `callback.persisted` 且 targetTable=`o_script`
- **THEN** 产物队列显示剧本已写回
- **AND** 用户可点击跳转到现有剧本业务页面查看详情

#### Scenario: 分镜产物写回
- **WHEN** 事件流收到 `callback.persisted` 且 targetTable=`o_storyboard`
- **THEN** 产物队列显示分镜已写回
- **AND** 用户可点击跳转到现有分镜业务页面查看详情

### Requirement: 审核门禁必须是第一阶段核心交互

系统 SHALL 在右侧门禁区展示质量监制 Agent 的审核报告和用户终审入口。

#### Scenario: 阶段终审出现
- **WHEN** 某阶段所有节点内审完成
- **THEN** 右侧门禁区显示终审卡片
- **AND** 卡片提供通过、打回原生产 Agent、跨工种打回、人工修改后再审、暂停补充指令等操作
- **AND** 卡片显示审核 Agent、审核对象、核心审核维度、打回对接 Agent、结构化修正意见和循环次数

#### Scenario: 用户选择跨工种打回
- **WHEN** 用户在终审卡片选择跨工种打回
- **THEN** 系统提交用户选择和补充说明
- **AND** DirectorOrchestrator 根据该选择更新 TaskGraph
- **AND** 工作台显示新的 `review.reroute` 事件

### Requirement: 工作台必须提供全局设置入口

系统 SHALL 在主控台中提供 Toonflow 全局设置入口，覆盖模型服务、Agent 配置、提示词管理、Skills 管理、Agent 记忆配置和 Harness 工程管理。

#### Scenario: 用户打开 Harness Agent 设置
- **WHEN** 用户点击右侧设置入口中的 Harness Agent
- **THEN** 系统打开设置视图或跳转到 Toonflow 设置中心
- **AND** 用户可查看和编辑 Harness 下 Agent 的 system prompt、skills、模型映射和 retry 策略

### Requirement: 第一阶段不得在主控台直接调用 ComfyUI

系统 SHALL 在第一阶段移除主控台中的 ComfyUI 直接调用、参数编辑、测试运行和 workflow 切换能力。

#### Scenario: 主控台检查 ComfyUI 直接调用控件
- **WHEN** 用户查看主控台任意场景
- **THEN** 页面不得出现 “ComfyUI 参数快照”、“测试运行”、“workflow 切换”、“ComfyUI server 选择” 等直接调用控件
- **AND** 只可出现“生成后端插件（二期预留）”一类范围说明或设置入口

### Requirement: 原型必须支持多场景交互验证

系统 SHALL 在 Figma 和本地 HTML 原型中展示主控台、审核门禁、Agent/设置、流程导览四类核心画面。

#### Scenario: 用户切换原型场景
- **WHEN** 用户在 HTML 原型中点击主控台、审核门禁、Agent 设置或流程导览
- **THEN** 原型切换到对应画面
- **AND** 每个画面展示与 Harness 闭环相关的可验证交互
- **AND** 不展示 ComfyUI 直接调用场景

### Requirement: 流程导览必须展示自驱闭环

系统 SHALL 用流程导览展示输入、规划、执行、回写、内审、门禁、驳回、推进的完整闭环。

#### Scenario: 用户查看流程导览
- **WHEN** 用户点击流程导览
- **THEN** 页面展示 Harness 闭环流程图
- **AND** 页面展示实时事件流样例
- **AND** 事件流至少包含 `task.started`、`callback.persisted`、`review.scored`、`director.user_input_required`、`review.reroute`、`version.created`
