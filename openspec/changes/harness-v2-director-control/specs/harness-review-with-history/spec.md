# harness-review-with-history — 多级审核与历史版本

> 本 spec 定义多级审核流水线 (技术→艺术→内容→监制→用户确认) 和历史版本管理。

## 新增需求 (ADDED Requirements)

### 需求: 审核流水线必须按 5 级顺序执行

系统 SHALL 按 5 级顺序审核每个 Agent 产物: 技术审核 → 艺术审核 → 内容审核 → 监制 Agent 决策 → 用户确认 (关键节点)。

#### 场景: DP 图片通过全部审核
- **WHEN** DPAgent 完成 shot_3 的生图
- **THEN** ReviewPipeline 依次执行: TechnicalReviewer (分辨率/AI瑕疵) → ArtisticReviewer (构图/风格) → ContentReviewer (与分镜一致性)
- **AND** SupervisorAgent 综合决策 `{ action: "approve" }`
- **AND** 因 shot_3 是关键节点 (生图阶段每 8 张触发用户确认), 进入 UserConfirmGate

#### 场景: 技术审核失败自动打回
- **WHEN** TechnicalReviewer 检测到图片分辨率低于 720p
- **THEN** 自动打回给 DP, 不进入后续审核阶段
- **AND** 附带技术建议: "图片分辨率 540p, 要求 720p+, 请检查 size 参数"

### 需求: 监制 Agent 必须用 LLM 决策通过/打回/升级用户

系统 SHALL 由 SupervisorAgent 调用 LLM 综合判断审核结果, 输出结构化决策。

#### 场景: 艺术审核失败, 监制决策打回给 DP
- **WHEN** ArtisticReviewer 评分 composition=0.58 < 0.7
- **THEN** SupervisorAgent 调用 LLM, 输入评分 + 失败维度 + 历史
- **AND** LLM 输出 `{ action: "reroute", targetAgent: "dp", retryInstruction: { suggestions: ["增加前景纵深", "主体居中"] }, userInputRequired: false }`

#### 场景: 内容审核失败, 监制决策升级用户
- **WHEN** ContentReviewer 评分 sceneAccuracy=0.4 (画面与剧本不符)
- **THEN** SupervisorAgent LLM 输出 `{ action: "ask_user", userPrompt: "shot_3 画面与剧本描述不符, 您希望?", userOptions: ["修改剧本描述", "重新生成图片", "跳过该 shot"] }`

### 需求: 用户确认环节必须在关键节点弹出确认窗口

系统 SHALL 在 5 个关键节点强制弹出用户确认窗口: 剧本生成后 / 角色场景设计后 / 生图每 8 张 / 生视频每 4 段 / 终审。

#### 场景: 剧本生成后用户确认
- **WHEN** 编剧 Agent 完成 8 场剧本, 监制审核通过
- **THEN** DirectorOrchestrator 发出 `director.user_input_required` 事件
- **AND** 前端弹出确认窗口: "剧本已生成, 是否进入分镜阶段?"
- **AND** 选项: ["通过, 进入分镜", "需要修改 (在对话中输入)"]
- **AND** Harness 暂停, 等待用户响应

#### 场景: 生图每 8 张触发用户确认
- **WHEN** DPAgent 完成 8 张图 (out of 24)
- **THEN** 监制 Agent 触发 UserConfirmGate
- **AND** 弹窗显示 8 张缩略图 + 评分
- **AND** 选项: ["全部通过, 继续下一批", "选择部分重做", "全部重做"]

### 需求: 历史版本必须保存到 o_artifact_version 表

系统 SHALL 在每次审核失败或用户打回时, 把当前版本保存到 `o_artifact_version` 表, 然后生成新版本。

#### 场景: shot_3 第一次审核失败保存 v1
- **WHEN** DPAgent 第一次生成 shot_3, 审核失败
- **THEN** CallbackBridge 把当前图片路径和评分写入 `o_artifact_version` (version=1, reviewScore, reviewFeedback)
- **AND** 重新派活 DP 生成新图

#### 场景: shot_3 第二次通过保存 v2
- **WHEN** DPAgent 第二次生成 shot_3, 审核通过
- **THEN** CallbackBridge 写入 `o_artifact_version` (version=2, reviewScore=0.85, reviewFeedback=null)
- **AND** v2 成为当前版本

### 需求: 用户必须能查看历史版本并回滚

系统 SHALL 提供版本对比 UI, 用户可查看某产物的所有历史版本, 并回滚到指定版本。

#### 场景: 查看 shot_3 的版本历史
- **WHEN** 用户在主控台点击 shot_3 的"版本历史"
- **THEN** 显示版本列表: v2 (当前, 0.85 ✓) / v1 (0.58 ✗, 构图问题)
- **AND** 每个版本显示缩略图 + 评分 + 反馈 + 时间

#### 场景: 回滚到 v1
- **WHEN** 用户点击"回滚到 v1"
- **THEN** CallbackBridge 把 v1 的图片路径设为 `o_storyboard.imageUrl` 当前值
- **AND** 创建 v3 (新版本号) 作为回滚结果
- **AND** 后续操作基于 v3

### 需求: 每个任务自动重试次数必须 ≤ 2

系统 SHALL 限制每个任务的自动重试次数为 2, 第 3 次失败强制 `userInputRequired: true`。

#### 场景: shot_3 第三次失败触发用户介入
- **WHEN** DPAgent 对 shot_3 已自动重试 2 次都失败
- **THEN** SupervisorAgent 必须输出 `{ action: "ask_user", userInputRequired: true }`
- **AND** 不允许第 4 次自动重试

### 需求: 审核评分必须包含人可读反馈

系统 SHALL 在审核失败时, 由 LLM 生成中文反馈, 说明失败原因和修改建议。

#### 场景: 构图失败的人可读反馈
- **WHEN** shot_3 构图评分 0.58
- **THEN** SupervisorAgent 生成反馈: "构图问题: 画面主体偏离中心, 缺少前景纵深。建议: 1. 主体位于画面右侧 1/3; 2. 增加前景书桌虚化做纵深; 3. 主光源左前方 45°"
- **AND** 该反馈显示在用户确认弹窗和对话窗口
