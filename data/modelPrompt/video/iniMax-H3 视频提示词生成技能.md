---
name: minimax_h3_video_prompt_generation
description: >-
  MiniMax-H3 视频提示词生成技能（完整版，适配 H3 双模式）。当任务涉及 H3 视频提示词编写、
  h3_output_mode 模式路由（native_toonflow / minimax_base / minimax_fullref）、
  Toonflow 标签与 Minimax <Subject>/<Picture>/<Audio> 标签双向映射、T2VA/I2VA/FL2VA/L2VA 四字段、
  FullRef 六段式全参考、videoDesc 12维结构化字段解析、台词/音频/镜头术语映射时激活本技能。
---
# toonflow视频提示词生成Skill（完整版\-适配MinimaxH3双模式）

## 文档说明

本文档为最终完整版视频提示词生成技能，完整保留原生Toonflow全部逻辑，同时扩展适配Minimax\-H3两大官方工作流模式（Base T2VA/I2VA/FL2VA/L2VA、Full\-Reference全参考六段式），可直接作为Agent系统技能文件使用，所有规则、映射、示例、约束统一整合，无冗余内容、无需二次修改。

**新增核心能力**：模式智能路由、Toonflow标签与Minimax标签双向映射、双模式专属格式生成、全场景台词/音频/镜头适配、格式互斥约束

## 一、输入规范

### 1\.1 核心输入参数

新增顶层控制参数 `h3_output_mode`，用于切换输出格式，枚举值如下（默认 `native_toonflow`）：

- `native_toonflow`：原生Toonflow输出，兼容所有旧模型，无Minimax专属标签

- `minimax_base`：Minimax基础模式，适配T2VA/I2VA/FL2VA/L2VA任务

- `minimax_fullref`：Minimax全参考六段式模式，官方高阶工作流

### 1\.2 模式智能路由规则

|输入匹配条件|生效输出模式|核心说明|
|---|---|---|
|seedance\-2\-0 \+ 多参：是|Seedance2\.0原生模式|保留原生多参引用、中文结构化输出|
|Wan2\.6 / 万象2\.6|Wan2\.6原生模式|单首帧叙事式英文提示词，无标签堆砌|
|其他模型 \+ 多参：是|通用多参模式|多资产、多分镜图引用，英文结构化输出|
|其他模型 \+ 多参：否|通用首尾帧模式|纯文本五维度输出，无资产标签引用|
|h3\_output\_mode = minimax\_base|Minimax\-Base 四字段模式|适配T2VA/I2VA/FL2VA/L2VA四大任务类型|
|h3\_output\_mode = minimax\_fullref|Minimax\-FullRef 六段式模式|全参考官方标准格式，结构化最全|

### 1\.3 资产与分镜输入格式

#### 资产信息格式

资产信息\[id, type, name\]，type仅支持：role角色、scene场景、prop道具

#### 分镜信息格式

以 `storyboardItem` 标签传入，核心依赖 `videoDesc` 12维结构化字段、duration时长、shouldGenerateImage生图标识、associateAssetsIds关联资产ID

## 二、编号与标签映射核心规则

### 2\.1 Toonflow原生编号规则

- 资产按输入顺序从 `@图1` 连续递增，不区分资产类型

- 分镜图编号接续资产编号，顺延递增

- `shouldGenerateImage="false"` 分镜不分配编号，后续编号顺延不断层

### 2\.2 Toonflow → Minimax 标签一一映射规则

**核心约束：编号完全对齐，不重置、不洗牌、不重新排序**

|原始对象|Toonflow标签|Minimax映射标签|规则说明|
|---|---|---|---|
|角色/场景/道具资产|@图X|\<Subject X\>|所有业务资产统一为主体标签，记录资产ID、类型、名称，用于主体定义|
|有效生成分镜图|@图Y|\<Picture Y\>|作为镜头构图、首帧、尾帧锚点，绑定对应Shot序号|
|音效/音色参考资产|无原生标签|\<Audio N\>|仅存在音频资产时生成，绑定对应发声主体|

## 三、原生Toonflow四大模型生成规则

### 3\.1 通用多参模式

输出结构：\[References\]资产分镜汇总 \+ \[Instruction\]时序叙事英文描述，严格引用 `@图N` 标签，不编造画面内容，完整保留台词、音效、运镜信息。

### 3\.2 通用首尾帧模式

纯文本五维度输出（Visual/Motion/Camera/Audio/Narrative），**禁止使用任何标签引用**，全程单镜头无切镜，时间分段最小1秒，严格区分台词类型并标注嘴部状态。

### 3\.3 Seedance2\.0模式

中文结构化输出，前置图片定义，分镜分段描述，支持9维度精细化音色配置，区分普通对白、内心OS、画外音VO，严格匹配分镜时长，单镜最低1秒。

### 3\.4 Wan2\.6模式

单分镜输入输出，叙事式英文描写，三段式结构（风格基调\-主体画面\-镜头收尾），无标签堆砌，纯文本叙事，完整保留台词与音效细节。

## 四、Minimax\-H3 双模式专属生成规则

### 4\.1 通用基础约束

- 全文主体描述为英文，**台词、画面文字保留原始语言**，包裹 `<d>[lang]内容</d>`

- 镜头时间戳最小粒度1秒，禁止0\.5秒细分

- 严格基于videoDesc生成，禁止编造画面、动作、音效、台词

- 格式互斥：FullRef六段式与Base三字段不可混用；native模式禁止出现Minimax标签

### 4\.2 Minimax\-Base模式（T2VA/I2VA/FL2VA/L2VA）

#### 4\.2\.1 任务类型自动判定

|场景条件|任务类型|专属指令头|
|---|---|---|
|单张分镜图为0s首帧|I2VA|For the target video, at 0\.00 seconds into the target video, \<Picture Y\> \(from \[Shot 1\]\) is fully referenced\.|
|两张分镜图对应首尾帧|FL2VA|How the reference pictures align with the target video — \<Picture Y1\> \(from \[Shot 1\]\) aligns with the 0\.00‑second mark of the target video; \<Picture Y2\> \(from \[Shot N\]\) aligns with \{总时长\}\.00‑second mark of the target video\.|
|单张分镜图为末尾关键帧|L2VA|How the reference pictures align with the target video — \<Picture Y\> \(from \[Shot N\]\) aligns with \{总时长\}\.00‑second mark of the target video\.|
|无有效分镜图|T2VA|无指令头，直接输出主体描述|

#### 4\.2\.2 固定输出字段

指令头（按需） \+ integrated\_multimodal\_description（时序镜头描述） \+ overall\_soundscape（环境音效） \+ non\_diegetic\_music（背景音乐）

### 4\.3 Minimax\-FullRef全参考六段式模式

**固定输出顺序，不可调换**

1. **subject\_definitions**：定义所有Subject、Picture、Audio主体信息，标注资产来源与用途

2. **summary**：视频叙事总览，标注任务类型，仅引用已定义标签

3. **retention\_analysis**：逐条分析主体保留规则（fully\_preserved/partially\_preserved等）

4. **detailed\_description**：分镜时序详细叙事，含风格、运镜、动作、台词、光影

5. **overall\_soundscape**：全局环境物理音效

6. **non\_diegetic\_music**：背景纯音乐，无则填N/A

## 五、镜头术语映射对照表

### 5\.1 景别映射

|中文景别|通用英文标准术语|
|---|---|
|远景|extreme wide shot|
|全景|wide establishing shot|
|中景|medium shot|
|近景/特写|close\-up|
|大特写|extreme close\-up|

### 5\.2 运镜映射

|中文运镜|通用英文标准术语|
|---|---|
|静止|static shot|
|推进|push in|
|拉远|pull out|
|跟踪|tracking shot|
|摇镜|slow pan|
|甩镜|whip pan|
|升降|crane up / crane down|
|环绕|orbiting shot|

## 六、全模式统一执行约束

- 仅输出纯提示词文本，禁止输出推理过程、表格、注释、多余说明

- 所有时间分段最小1秒，杜绝0\.5秒及以下细分时长

- 台词100%保留原始语言，不翻译、不修改，按类型正确标注

- 严格依从videoDesc字段生成，无编造、无新增画面/音效/动作

- 标签映射严格遵循原始编号顺序，禁止打乱重置

- 各模式格式严格互斥，不混用字段与标签体系

## 七、完整可运行示例（三模式对照）

### 7\.1 通用测试输入

```Plain Text
{
    "model": "Seedance2.0",
    "h3_output_mode": "native_toonflow",
    "多参": "是",
    "资产信息": [
        ["A001", "role", "沈辞"],
        ["A002", "role", "苏锦"],
        ["A003", "scene", "城楼"]
    ],
    "storyboardItems": [
        {
            "videoDesc": "（沈辞独立城楼远眺苍茫大地、城楼、沈辞/城楼、4s、全景、静止、负手而立衣袂随风飘扬、坚定决绝、黄昏冷调侧逆光、无台词、风声衣袂声、A001/A003）",
            "prompt": "全景，平视略仰，城楼之上，沈辞负手而立，衣袂飘扬，黄昏冷调侧逆光",
            "track": "main",
            "duration": "4",
            "associateAssetsIds": ["A001","A003"],
            "shouldGenerateImage": "true"
        },
        {
            "videoDesc": "（苏锦登上城楼走向沈辞、城楼、苏锦/沈辞/城楼、4s、中景、跟踪、苏锦拾级而上走向沈辞、担忧、黄昏余晖渐暗、苏锦说：你又一个人在这里、脚步声风声、A001/A002/A003）",
            "prompt": "中景，跟踪，苏锦拾级而上走向城楼上的沈辞",
            "track": "main",
            "duration": "4",
            "associateAssetsIds": ["A001","A002","A003"],
            "shouldGenerateImage": "true"
        }
    ]
}
```

### 7\.2 输出1：native\_toonflow 原生Seedance2\.0

```Plain Text
画面风格和类型: 真人写实, 电影风格, 冷调, 古风
图片定义:
@图1: 沈辞，黑色长袍，气质冷峻的青年男性
@图2: 苏锦，浅色衣裙，神情细腻的青年女性
@图3: 城楼，古代砖石城楼与台阶场景
生成一个由以下 2 个分镜组成的视频:
场景:
分镜过渡: 镜头平滑切换，从全景过渡到中景跟踪，焦点从沈辞独处转向苏锦到来。
分镜1 4s: 时间：黄昏，场景：城楼，镜头：全景，平视略仰，静止镜头，沈辞独立城楼之上，负手而立，衣袂随风飘扬，目光远眺苍茫大地，神情肃然面容沉着，眼神坚定目光清冽，眉眼沉静气质凛然。无台词。背景是古城楼砖石纹理清晰，远方大地苍茫辽阔，天际线冷暖交替。黄昏斜射余晖侧逆光，冷调为主，长影拉伸，轮廓光微勾勒人物边缘，光感诗意。镜头静止。
分镜2 4s: 时间：黄昏，场景：城楼，镜头：中景，平视，跟踪拍摄，苏锦拾级而上，走向城楼上的沈辞，面部朝向沈辞方向，神情微愣面色微变，眼神中带着担忧，苏锦说：「你又一个人在这里。」音色：女声，青年音色，音调中等偏高，音色质感明亮清脆，声音清亮柔和，发音方式干净，气息充沛平稳，语速适中，带温婉真诚感。背景城楼台阶纹理清晰，余晖渐暗，天际线冷暖交替加深。镜头跟踪苏锦移动。
```

### 7\.3 输出2：minimax\_base I2VA模式

```Plain Text
For the target video, at 0.00 seconds into the target video, <Picture 4> (from [Shot 1]) is fully referenced.

integrated_multimodal_description:
[Shot 1] Cinematic ancient‑drama realistic style, wide establishing shot, the shot begins from <Picture 4>. <Subject 1> stands alone atop <Subject 3>, hands clasped behind his back, robes billowing in wind, gazing far out over the vast land, firm and resolute expression. Cold dusk side‑backlight casts long silhouettes across stone battlements. The camera holds static shot throughout this segment.
[Shot 2] At 00:04.000, the shot cuts to medium tracking shot. <Subject 2> climbs stone steps and walks toward <Subject 1>, worried look on her face, dusk ambient light dims gradually. <Subject 2> (S1) turns toward <Subject 1> and says: <d>[Chinese]你又一个人在这里。</d>. The camera follows <Subject 2> with smooth tracking movement.
overall_soundscape:
Wind blows across ancient city wall, fabric flutters rhythmically. Stone footsteps are heard as the second character ascends steps.
non_diegetic_music:
N/A
```

### 7\.4 输出3：minimax\_fullref 六段式全参考模式

```Plain Text
subject_definitions:
<Subject 1> is the character Shen Ci from asset A001(role), a stern young man wearing dark ancient long robes.
<Subject 2> is the character Su Jin from asset A002(role), a delicate young woman in light‑colored ancient dress.
<Subject 3> is the ancient city‑wall environment from asset A003(scene), masonry tower with stone steps and vast distant land view.
<Picture 4> is storyboard reference for [Shot 1], defining viewpoint, subject placement and overall composition of the opening wide shot.
<Picture 5> is storyboard reference for [Shot 2], defining framing and character layout for the medium tracking shot.

summary:
[reference generation] The target cinematic ancient‑drama video contains two shots. <Subject 1> stands alone on <Subject 3> gazing into distance, then <Subject 2> walks toward <Subject 1> and delivers dialogue. <Picture 4> and <Picture 5> provide storyboard composition guidance for respective shots.

retention_analysis:
<Subject 1> (appears in [Shot 1], [Shot 2]): fully_preserved - character appearance, costume and solemn resolute temperament are kept consistently.
<Subject 2> (appears in [Shot 2]): fully_preserved - character appearance, light dress and worried facial expression are retained.
<Subject 3> (appears in [Shot 1], [Shot 2]): fully_preserved - masonry city‑wall environment, stone steps and distant landscape are preserved.
<Picture 4> ([Shot 1] storyboard composition reference): fully_preserved - camera angle, subject arrangement and scene layout of shot 1 follow this reference.
<Picture 5> ([Shot 2] storyboard composition reference): fully_preserved - medium‑shot framing and character positional relation of shot2 follow this storyboard reference.

detailed_description:
The target video adopts cinematic ancient‑drama realistic visual style, cold‑toned dusk lighting palette.
[Shot 1] A wide establishing shot derived from <Picture 4>. <Subject 1> stands alone atop <Subject 3>, hands clasped behind back, dark robes billowing in wind, gaze stretching toward the boundless distant land, facial expression firm and unwavering. Cold dusk side‑backlight carves sharp silhouette and stretches long shadows over stone surface. Camera keeps static shot without movement. No character speaks in this shot.
[Shot 2] At 00:04.000, the shot cuts to medium tracking shot defined by <Picture 5>. <Subject 2> climbs stone steps and approaches <Subject 1>, her facial features show obvious worry, ambient dusk light fades gradually. <Subject 2> (S1) faces <Subject 1> and speaks, <d>[Chinese]你又一个人在这里。</d>. Camera performs smooth tracking shot following <Subject 2>’s forward movement.

overall_soundscape:
Continuous wind noise flows over city‑wall battlements; fabric flutters in breeze; clear footsteps sound while <Subject 2> walks up stone steps.
non_diegetic_music:
N/A
```

> (Note: May contain AI-generated content.)
