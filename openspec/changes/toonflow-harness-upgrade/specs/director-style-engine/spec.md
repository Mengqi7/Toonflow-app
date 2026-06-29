## ADDED Requirements

### Requirement: 风格自动推理引擎
导演 Agent MUST 通过多步推理链自动输出 VisualStyleSpec，而非单一 prompt 调用。推理链包含: 题材识别→情绪分析→参考匹配→参数生成。

#### Scenario: 完整推理链
- **WHEN** 导演 Agent 输入剧本（都市悬疑题材，三章/12 场，场景包含办公室+旧公寓+雨夜街道）
- **THEN** 推理链步骤: 1) styleInference_AnalyzeGenre("urban-suspense") → 获取题材特征: 蓝灰冷色调/高对比/压抑配乐 2) styleInference_AnalyzeMood("cold-oppressive-rain") → 情绪映射: 低饱和度/硬光/手持镜头 3) styleInference_MatchReference(referenceImages) → 如用户上传了参考图，embedding 匹配提取视觉特征 4) styleInference_GenerateSpec(allInputs) → 输出完整 VisualStyleSpec

#### Scenario: 推理链可追溯
- **WHEN** 用户查看导演 Agent 推荐的色调方案 "蓝灰 + 高对比"
- **THEN** VisualStyleSpec 的 metadata 字段记录推理依据: { genreInfluence: "都市悬疑: 冷色调(conf=0.92)", moodInfluence: "压抑: 低饱和(conf=0.85)", referenceInfluence: "用户参考图: 色板匹配 87%", temperature: "根据以上因素综合推断: cool" }。用户可逐项质疑并手动覆盖


### Requirement: 风格库管理
系统 MUST 支持用户创建、编辑、共享风格模板，风格可跨项目复用。

#### Scenario: 保存导演方案为风格模板
- **WHEN** 用户在"Project A - 港风警匪片"中满意导演 Agent 自动推理的风格方案
- **THEN** 点击"保存为风格模板"，输入名称"港风警匪默认"，标签["港风", "警匪", "高对比", "蓝绿色调"]。保存到 o_style_library 表。新建 Project B 时，在导演风格页面可选择此模板，Agent 基于该模板调整而非从零推理

#### Scenario: 风格模板市场
- **WHEN** 用户浏览社区共享的风格模板
- **THEN** 展示模板列表: 名称/预览图(自动生成的示例画面)/标签/使用次数。用户可一键导入。导入后模板存为本地副本，用户可自由修改而互不影响


### Requirement: 风格时间线
系统 MUST 支持定义同一制作内风格随时间线渐变的能力，而非全局统一的风格方案。

#### Scenario: 场景间风格渐变
- **WHEN** 导演 Agent 分析剧本: 第 1 幕（白天的办公室，明亮中性）→ 第 2 幕（傍晚街道，暖金过渡）→ 第 3 幕（雨夜公寓，冷暗压抑）
- **THEN** VisualStyleSpec 不再是单一对象，而是 TimelineStyleSpec: [{ sceneRange: [1, 4], style: { warmNeutral, highKey } }, { sceneRange: [5, 8], style: { warmGold, transition } }, { sceneRange: [9, 12], style: { coolBlueDark, lowKey } }]。各 scene 的 shot 自动应用对应时间段的风格

#### Scenario: 风格转场处理
- **WHEN** 第 4 场→第 5 场需要色调从明亮→暖金的渐变过渡
- **THEN** 导演 Agent 标记 scene[4] 和 scene[5] 为风格转场边界。DP Agent 在处理 scene[4].lastShot 和 scene[5].firstShot 时，使用 interpolated style（两种风格的加权混合），生成渐变过渡画面


### Requirement: 风格到模型的映射层
VisualStyleSpec 的参数 MUST 能够自动转换为不同生图后端的 prompt 指导或参数设置，无需人工翻译。

#### Scenario: 风格参数映射到 API prompt
- **WHEN** VisualStyleSpec 包含 { colorPalette: { primary: "#2C3E50", temperature: "cool" }, lighting: { style: "hard", keyLightDirection: "top-right" }, composition: { ruleOfThirds: true, depthOfField: "shallow" } }
- **THEN** StyleMapper.toAPIPrompt() 生成: "Moody cool tone with blue-gray color grading. Hard key light from top-right casting defined shadows on subject. Rule of thirds composition, subject positioned at right third intersection. Shallow depth of field, f/1.8, background bokeh. Widescreen 2.35:1 aspect ratio."

#### Scenario: 风格参数映射到 ComfyUI 参数
- **WHEN** VisualStyleSpec 的 lighting 要求 "hard key light from 45° top-right"
- **THEN** StyleMapper.toComfyUIParams() 生成: { IC-Light node: { lightDirection: "top-right", intensity: 0.8, hardness: 0.9 }, CLIPTextEncode: { promptSuffix: "hard directional lighting, chiaroscuro, dramatic shadows" } }。这些参数自动注入到选定的 ComfyUI 工作流中


### Requirement: 交互式风格细化
系统 MUST 提供直观的 UI 让用户与导演 Agent 协作微调风格方案。

#### Scenario: 风格变体探索
- **WHEN** 导演 Agent 推荐了 3 组色调方案，用户不确定选哪个
- **THEN** 系统为每组方案自动生成 3 张示例画面（同一简单场景，不同色调），以网格形式展示。用户点击选择，或标记"方案 A 的主体色调 + 方案 B 的光影风格"混合生成新方案

#### Scenario: 自然语言风格调整
- **WHEN** 用户看了风格方案后说"颜色太冷了，加点温暖感但保持悬疑氛围"
- **THEN** 导演 Agent 调用 styleAdjust("warm-up", { temperature: +20%, preserveSuspense: true })，输出修正方案: { primary: "#3D5A80"（原 #2C3E50 偏暖），temperature: "slightly-cool"（原 "cool"）}。用户可重复微调直到满意

#### Scenario: 风格即时预览
- **WHEN** 用户调整了 colorPalette.primary 从 #2C3E50 改为 #4A6B8A
- **THEN** 前端实时调用 stylePreview API，传入更新后的 VisualStyleSpec + 预览 shot 的简短描述，在 5 秒内生成一张 512x512 预览图，用户直观看到色调变化的效果


### Requirement: 风格一致性强制执行
在制作流水线中，所有 Agent MUST 遵守导演 Agent 确立的风格方案，偏离时自动提醒和修正。

#### Scenario: DP Agent 偏离风格自动修正
- **WHEN** DP Agent 生成的画面中，导演风格要求 "shallow depth of field" 但结果明显是 deep focus
- **THEN** review.image 审核时自动检测: 调用 AI 视觉模型分析景深 → 与 style.composition.depthOfField 对比 → 发现偏离 → 在 ReviewScore 中 artistic.composition 维度扣分，并在 feedback 中说明"景深不符要求，需要浅景深"

#### Scenario: 剪辑 Agent 风格适配
- **WHEN** 导演风格中 camera.movement 偏好 "handheld, quick cuts"
- **THEN** 剪辑 Agent 读取该偏好，在 EditTimeline 中自动: 1) 平均镜头时长缩短至 2-3s（而非 4-5s）2) 偏好 cut 而非 dissolve 转场 3) 节奏 bpm 提高。如果偏离此风格（如出现了 6s 长镜头），导演审核时标记 warning
