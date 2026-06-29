## ADDED Requirements

### Requirement: 编剧 Agent 多角色协作创作
编剧 Agent MUST 内部分解为 storySkeletonAgent → adaptationStrategyAgent → scriptAgent 三阶段流水线，且每阶段输出接受导演 Agent 的审核反馈。

#### Scenario: 小说结构分析
- **WHEN** 用户提交 50 万字网络小说
- **THEN** storySkeletonAgent 分析并输出: { actStructure: "三幕/五幕", keyPlotPoints: [{ chapter, event, characters }], characterArcs: [{ name, arcDescription, keyScenes }], sceneLocations: [{ name, description, frequency }] }。如果小说超过 10 万字，Agent 分批处理（每批 5 万字）后合并结果

#### Scenario: 改编策略生成
- **WHEN** adaptationStrategyAgent 收到 novelAnalysis + 用户指定的 targetFormat="tv-series"
- **THEN** 输出 { targetFormat, episodeCount: 24, episodeDuration: "40-45min", adaptationStrategy: "cut-subplots-focus-main"，cutList: [{ original: "chapter 12-15", reason: "副线无视觉张力", replacement: "浓缩为蒙太奇" }], newElements: [{ type: "visual-motif", description: "贯穿全剧的时钟意象" }] }

#### Scenario: 导演审核剧本
- **WHEN** screenwriter.generate 生成剧本初稿后进入 review.script 审核关卡
- **THEN** 导演 Agent 作为 reviewerAgent 从三个维度评分: completeness(情节完整度)/format(格式规范)/dialogue(对白自然度)。如 passThreshold 未达标，生成 RetryInstruction 包含具体修改位置（如"第 3 场对话过长，建议拆分为两场，增加动作描写"），退回编剧 Agent 重试


### Requirement: 分镜规划与场景管理
导演 Agent MUST 将剧本分解为分层结构: Episode → Sequence → Scene → Shot，并在各层级维护一致性元数据。

#### Scenario: 多层级分镜拆解
- **WHEN** 导演 Agent 获取 24 集电视剧剧本
- **THEN** 输出分层 StoryboardPlan:
\`\`\`typescript
{ episodes: [{ episodeNumber, sequences: [{ sequenceName, scenes: [{ sceneNumber, location, timeOfDay, characters, shots: [{ shotNumber, type, angle, movement, duration, description, dialogue, soundNotes }] }] }] }] }
\`\`\`
每个 scene 携带 locationContinuity 标记（如 "sameAs:ep1_seq3_scene2"），下游 Agent 据此确保场景一致性

#### Scenario: 跨集场景一致性
- **WHEN** 第 1 集第 3 场是"主角公寓客厅"，第 8 集第 5 场也是同一地点
- **THEN** 导演 Agent 在两处 scene 中标注 locationToken: "apt-living-room"，并在 MemoryBus 中存储该场景的视觉参考（先行生成的第 1 集画面作为参考图），确保后续生成保持一致


### Requirement: Agent 协作时序协议
各 Agent MUST 遵循明确的时序协作规则：先决 Agent 完成→依赖 Agent 启动。并行执行的 Agent 通过 WorkflowContext 共享数据，不直接通信。

#### Scenario: DP + 灯光美术 Agent 并行协作
- **WHEN** 导演 Agent 完成 style + storyboardPlan，进入 generate.shots 阶段
- **THEN** DP Agent 和 Lighting Agent 作为同一个 parallel-fork 的不同子节点并行启动。DP Agent 生成构图 prompt + 图片；Lighting Agent 根据同一 shot 的 style 和 scene 描述生成 LightingSpec + ArtDirectionSpec。两者的输出都在 WorkflowContext 中，供下游 review.image 合并审核。如果 Lighting Agent 先完成，其输出已在 Context 中等候，DP Agent 也可以读取

#### Scenario: 剪辑 Agent 等待素材就绪
- **WHEN** generate.shots.join 完成所有 12 个 shot 的画面生成
- **THEN** 剪辑 Agent 的 init 阶段读取 ctx.input.bindings["shots"] 获取所有画面的 url 和数据。如果某个 shot 的 review 被打回重做中，该 shot 的数据标记为 pending，剪辑 Agent 等待直到全部就绪后才开始 execute()

#### Scenario: Agent 冲突解决协议
- **WHEN** Costume Agent 审核发现 DP 生成的画面中角色 A 的发色与角色库不一致（黑色 vs 棕色）
- **THEN** Costume Agent 不直接修改 DP Agent 的输出，而是通过 review-gate 返回 RetryInstruction，WorkflowRunner 将 DP Agent 重新调度。DP Agent 在重试时读取 RetryInstruction.suggestions，在生成 prompt 中加入"角色 A: 黑色短发, 中分"


### Requirement: 资产管理管道
系统 MUST 管理从制作到成品的所有中间产物：原始生成图、缩略图、审核通过/未通过的版本、视频片段、音频文件，提供统一的引用和检索能力。

#### Scenario: 画面版本管理
- **WHEN** Shot #5 的图片第一次生成质量 0.62 打回重做，第二次生成 0.82 通过
- **THEN** oss 目录中保留两个版本: shot_05_v1.png 和 shot_05_v2.png，o_production_asset 表记录两者的元数据（版本号/审核分数/RetryInstruction/生成后端的）。WorkflowContext 中仅引用最新的通过版本

#### Scenario: 资产引用完整性
- **WHEN** 剪辑 Agent 的 EditTimeline 引用 "shot_05_v2.mp4" 作为第 5 镜的素材
- **THEN** 系统在 o_production_asset 表中建立引用关系: { assetId: "shot_05_v2", usedBy: ["editTimeline-v1"], stage: "editing" }。用户删除该素材时，系统警告"该素材被剪辑时间线引用，删除后需重新生成"

#### Scenario: 中间产物清理策略
- **WHEN** film-production 工作流完成后，o_production_asset 表中有 300+ 条记录（含多个被驳回的版本）
- **THEN** 系统提示用户"发现 47 个未使用的中间版本，释放 2.3GB 空间"，用户可选: 保留所有 / 仅保留最终版 / 移至归档目录。手动清理时可选择范围（按项目/按 stage/按审核状态）


### Requirement: 制作进度恢复
系统 MUST 支持制作过程的中断恢复，不仅恢复工作流状态，还恢复各 Agent 的内部状态和中间产物。

#### Scenario: 断点续制
- **WHEN** 用户在 12 镜画面中审核了 5 镜后关闭应用，次日重新打开
- **THEN** 系统从 o_workflow_state 恢复 WorkflowInstance: nodeStates 显示 review.image[0-4].status=completed、[5-11].status=pending；o_production_asset 中已存 5 个通过版本的图片和元数据。前端展示"已完成 5/12 镜"，用户点击"继续"后 resume 工作流

#### Scenario: 重新生成已完成的阶段
- **WHEN** 用户对第 3 镜的通过图片不满意，手动点击"重新生成"
- **THEN** 系统将 generate.shot.unit[2] 节点的状态重置为 pending，清除 WorkflowContext 中该节点数据，删除 o_production_asset 中对应的最终版标记（保留历史版本）。重新调度该节点后，下游的 generate.shots.join 感知到变更，自动重新聚合


### Requirement: 最终成片组装
final.assemble 脚本 MUST 将视频片段、音频方案、字幕/特效合成为可交付的视频文件。

#### Scenario: 最终渲染
- **WHEN** generate.videos.join 完成所有视频片段、sound.design 完成音频方案
- **THEN** final.assemble ScriptExecutor 读取 editTimeline、各 clip 的 videoUrl、soundPlan，调用 FFmpeg（通过 child_process）执行: 1) 按 timeline 拼接视频片段 2) 添加转场效果 3) 叠加配音/音效/BGM 4) 嵌入字幕轨道 5) 输出 MP4 到 oss/production/{projectId}/final.mp4。渲染进度通过 EventBus 实时推送

#### Scenario: 渲染失败回退
- **WHEN** final.assemble 因 FFmpeg 内存不足崩溃
- **THEN** 脚本捕获错误，将节点状态置为 failed，记录错误日志。用户可以降级渲染参数（分辨率 4K→1080p，码率减半）后重试，或选择"分段渲染后拼接"策略
