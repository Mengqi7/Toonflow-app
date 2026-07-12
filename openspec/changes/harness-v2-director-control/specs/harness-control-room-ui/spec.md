# harness-control-room-ui - AI 影视智能工作台

> 本 spec 定义 Harness 主控台 (`#/harness/control/:instanceId`) 的第一阶段 UI、原型与交互规范。

## ADDED Requirements

### Requirement: 主控台必须呈现对话中枢

系统 SHALL 在 `#/harness/control/:instanceId` 提供一个固定可见的导演对话中枢，作为所有调度、确认、修改和终审入口。

#### Scenario: 用户输入创作指令
- **WHEN** 用户输入“把第 3 场对白缩短 30%”
- **THEN** 对话中枢展示解析结果和下一步计划
- **AND** DirectorOrchestrator 生成对应任务
- **AND** 页面追加一条可追踪的指令卡

### Requirement: 主控台必须采用三层工作台布局

系统 SHALL 采用三层布局：左侧对话与项目导航，中间阶段工位，右侧产物仓库与审核门禁。

#### Scenario: 工作台加载完成
- **WHEN** 用户打开主控台
- **THEN** 左侧显示项目、案例工程、对话窗口和 Agent 入口
- **AND** 中间显示当前阶段工位与阶段产物
- **AND** 右侧显示版本历史、审核门禁、全局设置和运行概览

### Requirement: 主控台必须按阶段展示工作流

系统 SHALL 将工作流拆分为剧本、人物、场景道具、分镜、视频、音轨、终审等阶段，并允许用户在阶段之间查看上下游关系。

#### Scenario: 用户切换到分镜阶段
- **WHEN** 用户点击“分镜阶段”
- **THEN** 中间区域展示分镜工位、镜头列表、分镜产物、审核结果和版本轨
- **AND** 页面显示该阶段的上游输入与下游待交付目标

### Requirement: 主控台必须承载每个阶段的真实产物

系统 SHALL 为每个阶段提供明确的产物承载区，产物包括文本、图片、音频、视频、审核报告和版本记录。

#### Scenario: 剧本阶段完成
- **WHEN** 编剧 Agent 产出剧本
- **THEN** 剧本内容显示在剧本产物区
- **AND** 版本信息、生成 Agent、审核状态和回写状态同时可见

### Requirement: 主控台必须提供产物仓库视图

系统 SHALL 提供统一的产物仓库视图，支持按阶段、类型、版本、审核状态和案例工程过滤。

#### Scenario: 用户查看人物产物
- **WHEN** 用户切换到人物仓库
- **THEN** 显示人物设定图、三视图、提示词、版本链和关联场景

### Requirement: UI 必须借鉴 LaperAI 的对话驱动与版本组织

系统 SHALL 借鉴 LaperAI 的对话驱动入口、阶段分区、版本历史、审阅链路与专业感表达，但不得复制其具体视觉细节。

#### Scenario: 用户查看历史版本
- **WHEN** 用户打开任意产物的版本历史
- **THEN** 显示版本列表、差异摘要、评分、反馈和回滚入口
- **AND** 版本历史保持与当前阶段同步

### Requirement: 主控台必须保留 Harness 特色的自动调度感

系统 SHALL 在界面中显式展示 Agent 自动进场、任务流转、审核打回和重跑状态。

#### Scenario: 监制打回分镜
- **WHEN** 监制审核失败
- **THEN** 对话中枢收到打回摘要
- **AND** 分镜工位显示重跑状态
- **AND** 右侧门禁区显示新的重试指令

### Requirement: 主控台不得在第一阶段暴露 ComfyUI 直接调用

系统 SHALL 在第一阶段移除主控台中的 ComfyUI 直接调用、参数编辑、测试运行和 workflow 切换能力。

#### Scenario: 用户检查生成入口
- **WHEN** 用户浏览生成区
- **THEN** 页面不得出现 ComfyUI 参数快照、测试运行或 workflow 切换
- **AND** 仅保留“生成后端插件（二期预留）”类入口
