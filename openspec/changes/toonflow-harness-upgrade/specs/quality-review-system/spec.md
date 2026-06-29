## ADDED Requirements

### Requirement: 分 Agent 审核标准定义
每个 Agent 的产出 MUST 有其专属的审核标准和评分维度，不共用通用标准。

#### Scenario: 编剧产出审核标准
- **WHEN** screenwriter.generate 完成剧本初稿
- **THEN** review.script 审核关卡使用编剧专属标准: completeness(情节完整度, 权重 0.35) / formatCompliance(格式规范, 0.25) / dialogueNaturalness(对白自然度, 0.25) / pacing(节奏控制, 0.15)。评分包含自动化检查（格式正则校验）+ AI 评估（对白质量）。passThreshold=0.80

#### Scenario: DP 画面审核标准
- **WHEN** DP Agent 生成分镜画面
- **THEN** review.image 使用画面专属标准: technical(分辨率/瑕疵, 权重 0.3) / composition(构图, 0.25) / styleMatch(风格匹配, 0.25) / contentMatch(内容准确, 0.2)。技术审核用程序（sharp 库读分辨率、AI 瑕疵检测模型）；艺术审核用视觉 AI 模型评分

#### Scenario: 剪辑产出审核标准
- **WHEN** editor.assemble 完成 EditTimeline
- **THEN** 剪辑专属标准: pacing(节奏, 0.35) / continuity(连续性, 0.3) / shotVariety(镜头多样性, 0.2) / durationCompliance(时长符合度, 0.15)。passThreshold=0.75

#### Scenario: 音频产出审核标准
- **WHEN** sound.design 完成 SoundPlan
- **THEN** 音频专属标准: emotionMatch(情绪匹配, 0.35) / syncAccuracy(同步精度, 0.3) / audioQuality(音质, 0.2) / variety(音效多样性, 0.15)


### Requirement: 审核历史学习
系统 MUST 记录每次审核的结果和用户的最终决策，逐步学习用户偏好，在后续审核中调整评分权重。

#### Scenario: 从驳回历史学习偏好
- **WHEN** 用户在过去 5 个项目中连续驳回了色彩偏冷的画面，并手动选择了暖色调版本
- **THEN** 系统在 o_review_preference 表中记录: { userId, criterion: "styleMatch.colorPreference", learned: "warm", confidence: 0.85 }。后续 DP Agent 生成画面时，自动在 prompt 中加入"暖色调"倾向；review.image 评分时 colorTemperature 维度自动偏好暖色

#### Scenario: 用户覆盖评分
- **WHEN** review.image 判定某画面构图评分 0.65 不通过，但用户手动点击"通过"
- **THEN** 系统不将此作为评分系统错误的证据，而是记录为偏好覆盖: { shotId, originalScore: 0.65, userOverride: "pass", reason: "用户对构图有特殊要求" }。该偏好仅对当前项目生效，不泛化到其他项目

#### Scenario: 审核准确率统计
- **WHEN** 用户完成 10 个项目
- **THEN** 系统统计: 总审核次数 240 次，自动通过 185 次，驳回 55 次。在这 55 次驳回中: 用户手动通过 12 次（说明审核过严），用户同意驳回 43 次（准确）。系统据此微调 passThreshold: 从 0.75 调整为 0.70


### Requirement: 人机协作审核接口
系统 MUST 提供灵活的人机协作审核机制，用户可在任意审核节点介入，手动通过/驳回/跳过。

#### Scenario: 审核节点用户介入
- **WHEN** 用户在审核 Dashboard 中看到 Shot #3 的画面，系统评分为 0.78（通过），但用户觉得颜色不对
- **THEN** 用户可以: 1) 手动驳回，附带修改意见（"天空太紫了，改为晴朗的蓝色"）→ 系统生成 RetryInstruction 并重新调度 2) 手动通过但调整 prompt（"这次先过，下个镜头注意"）→ 记录到 o_review_preference 3) 标记为"参考用"不参与最终成片

#### Scenario: 批量审核模式
- **WHEN** 12 个 shot 全部生成完成，用户希望快速审核
- **THEN** 审核 Dashboard 展示 12 格缩略图网格，每格下方显示系统评分和简要建议。用户可以: 1) 一键通过全部（评分>0.8 的自动过，低于的必须手动看）2) 勾选多个批量驳回（附带统一修改意见如"全部调整为暖色调"）3) 展开单格查看大图和详细评分

#### Scenario: 整场预览审核
- **WHEN** Scene #1（Shot 1-6）的 6 个画面全部完成
- **THEN** 用户可以"整场预览"模式按分镜顺序播放 6 张图片，模拟最终影片的视觉流。在此模式下审核连续性: 画面之间的色调/光影/角色位置是否连贯。不连贯的标注出来自动回退


### Requirement: 重试预算管理
系统 MUST 对每个审核节点的重试次数进行严格管理，支持全局和节点级预算设置，超出预算后智能降级或转人工。

#### Scenario: 节点级重试预算
- **WHEN** review.image 对 Shot #5 连续打回 3 次（配置的 maxRetries=3）
- **THEN** 系统不再自动重试，将节点状态置为 pending_human_required。前端通知: "Shot #5 经 3 次重试仍未通过，请人工介入"。用户可: 1) 手动通过 2) 调整配置 maxRetries=5 再试 3) 替换为之前通过的 Shot #2 的构图参考重新生成

#### Scenario: 全局预算耗尽
- **WHEN** 整个 film-production 工作流的累计 retryCount 达到全局上限 50
- **THEN** 系统暂停所有审核关卡，提示: "已达全局重试上限。已生成 108/120 个画面，通过率 90%。建议: 调整 passThreshold 或批量通过未达标的画面"。用户可一键降级通过剩余待审核项，确保制作流程不被阻断

#### Scenario: 智能降级（预算接近耗尽的策略）
- **WHEN** 全局 retryCount 达到 40/50，剩余预算紧张
- **THEN** 系统自动降低未完成节点的 passThreshold（如从 0.75 降至 0.68），并在重新提交时注入更详细的 guidance prompt（利用之前成功案例的经验）。通过率自然提升，减少重试消耗


### Requirement: 审核报告生成
系统 MUST 在每个审核关卡完成后生成审核报告，包含评分明细、修改历史和最终决策轨迹。

#### Scenario: 审核报告内容
- **WHEN** review.image 完成 Shot #7 的审核（1 次驳回 + 1 次通过）
- **THEN** o_review_report 表插入: { shotId, totalAttempts: 2, attemptDetails: [{ attempt:1, scores:{...}, totalScore:0.62, decision:"rejected", feedback:"构图偏右..."}, { attempt:2, scores:{...}, totalScore:0.82, decision:"accepted" }], finalScore: 0.82, reviewerAgentId: "director" }。前端展示审核时间线: 驳回时的截图 vs 通过时的截图对比
