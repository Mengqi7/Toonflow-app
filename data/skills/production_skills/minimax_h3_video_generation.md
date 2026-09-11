---
name: minimax_h3_video_generation
description: >-
  MiniMax-H3 本地视频生成（Toonflow × ComfyUI 适配版）。当任务涉及 H3 视频生成提示词编写、六段式 Ref2VA 提示词改写、
  <Picture>/<Video>/<Audio> 参考标签定义、T2VA/I2VA/FL2VA/L2VA/Ref2VA 模式识别、视频工厂工作流使用、
  时长/分辨率/加速配置、本地 ComfyUI 参考素材接入时激活本技能。完整参考规范在 minimax_h3_references/ 目录下。
---
# MiniMax-H3 视频生成技能（Toonflow × 本地 ComfyUI）

本技能面向 Toonflow 接入**本地 ComfyUI + MiniMax-H3** 的视频生成链路。模型为本机 ComfyUI 中的 `Minimax-h3\minimax_h3_ref2va_int8_convrot.safetensors`（Ref2VA 多参考模型，**完整未剪枝版**）。

> ⚠️ **模型选择红线**：必须使用完整未剪枝模型。`*_pruned_*` 剪枝版把 adaln 时间嵌入从 2688 维压缩到 8 维，会导致**音频严重受损**（实测 400Hz 谐波机械伪影/电流声），视频画面正常但音轨不可用。若用户使用的模型名含 `pruned`，应提示更换完整版（`minimax_h3_ref2va_int8_convrot.safetensors` / `minimax_h3_fl2va_int8_convrot.safetensors`，来自 Comfy-Org/MiniMax-H3，约 34GB）。

> ⚠️ **ComfyUI 音频修复（重要）**：若生成音频出现 400Hz 谐波机械伪影（电流声），且 `comfy/ldm/minimax/model.py` 的 `forward` 没有 undo/redo scale（而 `model_base.py` 存在 `MiniMaxH3.audio_scale`），则存在**新旧实现混用**（旧 slope_a + 新 ModelSamplingAV 双重缩放）。修复：将 model.py 替换为 [PR #15243](https://github.com/Comfy-Org/ComfyUI/pull/15243)（提交 `bdcb886`）版本并保留 TE-Speed 补丁，详见 `docs/comfyui-minimax-h3-audio-fix.md`。

## 1. 工作流总览

- Toonflow 中通过「模型选择器 → ComfyUI 工作流」调用本地 H3 工厂工作流（`Toonflow_MiniMaxH3_Ref2VA_工厂工作流`）。
- 用户只需：导入工作流 JSON → 填提示词 → 上传参考图 → 点测试/生成。
- 参考视频/音频：需提前放入 ComfyUI `input/` 目录，并在工作流中指定文件名。
- 加速链已内置：SageAttention → 显存优化补丁 → TE-Speed。

## 2. 输入模式识别（先判断再写提示词）

| 模式 | 条件 | 提示词结构 |
| --- | --- | --- |
| T2VA | 无参考 | 三字段：`integrated_multimodal_description` + `overall_soundscape` + `non_diegetic_music` |
| I2VA | 仅首帧 | T2VA 主体 + 首帧对齐指令（`at 0.00 seconds ... <Picture 1> ... fully referenced`） |
| FL2VA | 首+尾帧 | T2VA 主体 + 首尾帧对齐指令（描述两帧之间的连续运动路径，宜单镜头） |
| L2VA | 仅尾帧 | T2VA 主体 + 尾帧对齐指令（先推断前序状态再收敛到尾帧） |
| Ref2VA | 图/视频/音频多参考 | 六段式：`subject_definitions` + `summary` + `retention_analysis` + `detailed_description` + `overall_soundscape` + `non_diegetic_music` |

## 3. Ref2VA 六段式规范（多参考场景核心）

### 3.1 subject_definitions（定义参考与标签）

四类标签，一旦分配全程一致：

| 标签 | 含义 |
| --- | --- |
| `<Subject N>` | 从参考资产抽象出的可复用可见内容（人物/场景/道具/风格/动作） |
| `<Picture N>` | 参考图：作为具体目标帧、关键帧或构图锚点 |
| `<Video N>` | 参考视频：剪辑源、延续起点、运镜/节奏/时间结构 |
| `<Audio N>` | 参考音频：音色、BGM 风格、对白、节拍、声场 |

规则：
- 一个 Subject 可由多个资产定义：`<Subject 1> is the woman whose appearance comes from <Picture 1> and whose motion comes from <Video 1>.`
- 图仅用于定义人物时，不要单独建 Picture 条目，在 Subject 定义中引用来源即可。
- 音频对应说话人时绑定全局说话人 ID：`<Audio 1> is the voice-timbre reference for <Subject 1> (S1).`

### 3.2 summary（摘要）

- 单段英文，以方括号任务类型前缀开头：`[reference generation]`、`[video editing + audio reuse]`、`[audio reference]`、`[keyframe completion]` 等，多关系用 ` + ` 组合。
- 只使用已定义的标签，不得引入新标签。

### 3.3 retention_analysis（保留分析）

每个标签一行，固定标记词：

- 可见内容：`fully_preserved`（完全保留）/ `partially_preserved`（部分保留）/ `attribute_transfer`（属性迁移到其他主体）/ `weak_reference`（仅风格弱参考）
- 音频：`fully_copy`（1:1 复用为最终音轨）/ `partially_copy` / `reference`（仅参考音色节奏等）/ `weak_reference`

格式：`<Subject 1> (appears in [Shot 1], [Shot 3]): fully_preserved - 保留了什么细节。`

### 3.4 detailed_description（主体，350–500 词）

- 先以 1–2 句英文确立整体风格，再开始 `[Shot 1]`；后续镜头用 `[Shot N] At MM:SS.mmm, ...` 递增切点，切点须落在视频时长内。
- 首镜头不带时间戳。
- 相机运动写成自然英文（类型 + 幅度 + 速度）：`The camera pushes in with small amplitude at slow speed toward ...`
- 说话人用稳定 ID `(S1)/(S2)`，对白用 `<d>[English] ...</d>`，原文语言与标点逐字保留；画外音用 `says in an off-screen voiceover` 并注明嘴唇闭合。
- 屏显文字用英文双引号原样保留：`A neon sign reading "营业中" ...`
- 在参考内容实际出现/生效的镜头处自然引用标签：`the shot begins from <Picture 1>`、`<Subject 1> (S1) turns and says, <d>[English] ...</d>`。

### 3.5 overall_soundscape（环境声场，1–4 句）

总结环境音、物理动作声、非语言人声；对白/演唱/剧情音乐不重复。

### 3.6 non_diegetic_music（非剧情音乐，1–3 句）

只描述观众能听到的背景音乐：乐器、速度、节奏、动态变化；不用抽象情绪词。

## 4. 输出规则

- 除 `<d>` 内对白与屏显文字外全部使用英文。
- 描述时长必须与目标视频一致（4–15 秒，注意切点时间戳）。
- 避免抽象词（cinematic/beautiful），优先具体视觉与声音细节。
- 参考标签在所有章节保持一致。

## 5. Toonflow 使用要点

- 提示词注入位置：工作流中「H3 提示词 (Ref2VA 六段式)」节点（CR Text），生成时 Toonflow 会以用户提示词替换。
- 参考图注入：按顺序替换工作流中「参考图 1（人物）」「参考图 2（环境/道具）」两个 LoadImage 节点；单图时仅第一张生效。
- 参考视频/音频：替换 ComfyUI `input/` 目录中的文件，并在工作流的 VHS_LoadVideo / VHS_LoadAudioUpload 节点中改文件名。
- 时长：修改「时长(秒)」PrimitiveFloat 值（默认 10s），帧数自动按 17k+5 网格对齐。
- 分辨率：默认 9:16 0.4MP（480×864，适配短剧竖屏）；可在 ResolutionSelector 调整。

## 6. 参考文件

- `minimax_h3_references/base-en.txt`：官方 T2VA/I2VA/FL2VA/L2VA 提示词指南（含完整示例）
- `minimax_h3_references/ref-en.txt`：官方 Ref2VA 六段式改写格式指南（含完整示例）

需要编写或改写 H3 提示词时，先读取对应参考文件再输出。
