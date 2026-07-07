# harness-control-room-ui — 主控台 UI

> 本 spec 定义 Harness 主控台 (`#/harness/control/:instanceId`) 的布局、组件、交互规范。

## 新增需求 (ADDED Requirements)

### 需求: 主控台必须采用左右双列布局

系统 SHALL 在 `#/harness/control/:instanceId` 路由渲染 `HarnessControlRoom.vue`, 采用 CSS Grid 双列布局: 左 40% 是导演 Agent 对话窗口, 右 60% 是动态步骤执行画面。

#### 场景: 用户打开主控台
- **WHEN** 用户访问 `#/harness/control/abc123`
- **THEN** 左侧 40% 渲染导演对话窗口
- **AND** 右侧 60% 渲染当前步骤的执行组件
- **AND** 顶部显示项目名 + 7 步骤导航条

### 需求: 左侧对话窗口必须沿用 #/scriptAgent 风格

系统 SHALL 让左侧导演对话窗口的视觉风格与 `#/scriptAgent` 一致: 蓝色导演气泡 + 灰色用户气泡 + 底部输入框。

#### 场景: 导演消息蓝色气泡
- **WHEN** HarnessEvent `director.message` 到达
- **THEN** 聊天追加蓝色气泡, 包含导演头像 + "导演" 名称 + 消息内容 + 时间戳
- **AND** 消息内容中的 `[文本](#路由)` 渲染为可点击链接

#### 场景: 用户输入框 Enter 发送
- **WHEN** 用户在输入框输入文本并按 Enter
- **THEN** 发送到 `POST /api/harness/control/:id/message`
- **AND** 立即显示灰色用户气泡
- **AND** 输入框在等待导演回复期间禁用

### 需求: 右侧必须根据当前步骤动态切换 7 个子组件

系统 SHALL 根据导演 Agent 当前任务的 agentRole, 切换右侧步骤组件。

#### 场景: 当前任务是 DP, 切换到 StageShotImageGrid
- **WHEN** HarnessEvent `task.started` 到达, agentRole="dp"
- **THEN** 右侧切换到 `<StageShotImageGrid>` 组件
- **AND** 该组件订阅 `dp.*` 事件, 显示 shot 缩略图网格 + 状态徽章

#### 场景: 当前任务是编剧, 切换到 StageScriptEditor
- **WHEN** HarnessEvent `task.started` 到达, agentRole="screenwriter"
- **THEN** 右侧切换到 `<StageScriptEditor>` 组件
- **AND** 该组件 import 复用 `src/views/script/components/ScriptTable.vue`
- **AND** 传入 `source="harness"` 过滤 Harness 生成的剧本

### 需求: 顶部步骤导航条必须支持点击跳转

系统 SHALL 提供 7 步骤导航条 (小说/剧本/角色场景/分镜/生图/视频/审核), 每个步骤可点击查看历史状态。

#### 场景: 用户在生图阶段点击"剧本"
- **WHEN** Harness 正在生图阶段, 用户点击顶部"剧本"步骤
- **THEN** 右侧展开一个侧边面板, 显示 8 场剧本 (只读快照)
- **AND** 不暂停正在运行的 Harness

### 需求: 用户确认弹窗必须内联显示在对话窗口

系统 SHALL 把 `director.user_input_required` 事件渲染为对话窗口中的内联确认卡片。

#### 场景: 弹窗显示剧本确认
- **WHEN** 导演 Agent 发出 `director.user_input_required`, prompt="剧本已生成, 是否进入分镜阶段?", options=["通过, 进入分镜", "需要修改"]
- **THEN** 对话窗口追加一张确认卡片
- **AND** 卡片包含: 标题 + 剧本预览链接 + 2 个按钮
- **AND** 用户点击按钮后, 发送 `POST /api/harness/control/:id/user-input` 携带 choice

### 需求: 步骤组件必须实时显示产物 (通过 SSE)

系统 SHALL 让每个步骤组件通过 SSE 订阅 Harness 事件, 产物到达时立即显示, 而非轮询。

#### 场景: DP 完成 shot_3, 立即显示缩略图
- **WHEN** HarnessEvent `task.completed` 到达, agentRole="dp", data.images 包含 shot_3 的图片
- **THEN** `<StageShotImageGrid>` 立即更新 shot_3 的缩略图 (从"生成中"变为"已生成")
- **AND** 显示评分徽章

### 需求: 主控台必须支持多场景切换演示

系统 SHALL 在原型 HTML 中支持 9 个场景切换: 启动 / 剧本生成 / 分镜生成 / 美术部 / 生图 / 生视频 / 终审 / ComfyUI 配置 / 版本历史。

#### 场景: 切换到"生图"场景
- **WHEN** 用户在原型右下角点击"生图"按钮
- **THEN** 右侧切换到 StageShotImageGrid
- **AND** 显示 24 张缩略图, 其中 12 张 approved / 1 张 rejected / 4 张 running / 7 张 pending
- **AND** 底部显示驳回弹窗 + 5 个用户决策按钮

### 需求: 流程导览模式必须用动画展示完整流转

系统 SHALL 提供"流程导览"模式, 用动画从左到右展示 [小说]→[剧本]→[分镜]→[美术]→[生图]→[生视频]→[后期]→[成片] 的状态。

#### 场景: 当前在生图阶段
- **WHEN** 用户点击"流程导览"按钮
- **THEN** 顶部展开一条横向流程图
- **AND** [小说]/[剧本]/[分镜]/[美术] 显示 ✓ 绿色
- **AND** [生图] 显示 🔄 黄色脉动
- **AND** [生视频]/[后期]/[成片] 显示 ○ 灰色
