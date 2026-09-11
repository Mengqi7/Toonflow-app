# MiniMax H3 × ToonFlow 深度集成指南

> 资料来源：微信文章《告别高配电脑！MiniMax H3 全套AI视频工具链，短剧/带货/漫剧一键量产》（屾哥AI说）
> 整合包下载：MinimaxH3 整合包（quark 67702c69aab2）、Toonflow工作流+配置（quark 4e14f8a3da34）
> 适配对象：本地 ToonFlow（本仓库 `E:\workspace\Toonflow-app`，数据目录 `data/`）

## 一、资料学习总结（文章核心）

文章提供了一套 **MiniMax H3 + 智能自动化导演台 + ToonFlow** 的闭环工具链：

| 模块 | 角色 | 在本机落地位置 |
| --- | --- | --- |
| MiniMax H3 模型/节点 | 视频生成引擎（T2V 文生 / I2V 图生 / R2V 参考生） | `D:\mengq\Documents\MinimaxH3\`（模型+Goohai 节点+官方/导演台工作流） |
| 智能自动化导演台 | 单视频精细创作（Goohai-MiniMax-H3_Integration 节点） | `MinimaxH3\custom_nodes\Goohai-MiniMax-H3_Integration` |
| ToonFlow | 批量漫剧量产（提示词规则 + 供应商适配 + 工作流对接） | 本仓库 `data/vendor`、`data/workflows`、`data/skills` |

**H3 模型分工红线**（文章与官方一致）：
- `fl2va`（FL2V 首尾帧模型）→ 文生视频 T2V / 图生视频 I2V / 首尾帧 FL2V
- `ref2va`（Ref2V 参考模型）→ 参考生视频 R2V（图/视频/音频多参考）
- 两者都是全模态模型：**原生生成立体声音轨**（视频 VAE + 音频 VAE 双解码）

## 二、已导入清单（本次完成）

### 2.1 供应商适配器（3 个，已启用 enable=1）

| 供应商 ID | 名称 | 模型键 | 说明 |
| --- | --- | --- | --- |
| `comfyui_local_minimax_h3_r2v` | Local ComfyUI MiniMax H3‑R2V (v6.4) | `minimax-h3-r2v-fast` | R2V 多参考生视频；videoReference/audioReference；自动解析 minimax_fullref 六段式；帧数 17k+5；分辨率 480p~768p（multiple=32） |
| `comfyui_local_minimax_h3_official` | Local ComfyUI MiniMax H3 (官方对齐版, v7.1) | `minimax-h3-i2v-official` | I2V/FL2V 单图·首尾帧；动态 Lightning LoRA 开关（4步/8步/20步）；分辨率最高 1088p |
| `comfyui_local_ltx25_v5` | Local ComfyUI LTX 2.5 (API, v5.0) | `local-ltx-2.5-api` | LTX2.5 图生视频；单图模式；Prompt 增强；潜空间放大 |

> ⚠️ **本次修正**：前两个 H3 适配器原始引用 `*_pruned_int8_convrot` 模型名与 `int8_convrot` CLIP，已改为与已下载模型一致的 **完整未剪枝版**（`minimax_h3_fl2va_int8_convrot.safetensors` / `minimax_h3_ref2va_int8_convrot.safetensors`）与 **`qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors`** CLIP。完整版音轨正常；pruned 版音频有 400Hz 电流声（详见 `docs/comfyui-minimax-h3-audio-fix.md`）。

### 2.2 ComfyUI 工作流（新增 13 个，共 16 个）

全部入库 `o_comfyui_workflow`，并同步注册为「ComfyUI 工作流」虚拟供应商模型（engine=comfyui），可在模型选择器中直接选用：

- **官方工作流**：MiniMax H3 官方 T2V / I2V / R2V（Comfy-Org 原始 API 格式）
- **导演台工作流**：MiniMax H3 导演台 FL2V / R2V / RV2V / V2V（Goohai 节点）
- **导演台 V2**：MiniMax H3 智能一体化视频创作导演台 V2（旗舰，引用完整未剪枝模型，与下载文件完全匹配）
- **ToonFlow 适配版**：H3 R2V 全参考、H3 I2V 单图首尾帧（对应 2 个适配器内置工作流）
- **LTX2.5**：图生视频 API（50 节点，含 upscaler）
- **Flux2**：Flux2-Klein 三图参考（image）
- **Krea2**：krea2 四图三角度（image）⚠️ 需要额外下载 Krea2 模型，本包未含

JSON 原件归档于 `data/workflows/`（`minimax-h3-official/`、`minimax-h3-director/`、`toonflow-adapted/` 三个子目录 + 根目录两个导演台大文件）。

### 2.3 Agent Skill（新增 1 个主技能）

- `data/skills/production_skills/minimax_h3_video_prompt_generation.md` —— 文章作者的**完整版提示词生成技能**（适配 H3 双模式）：
  - `h3_output_mode` 三模式路由：`native_toonflow`（兼容旧模型）/ `minimax_base`（T2VA/I2VA/FL2VA/L2VA 四字段）/ `minimax_fullref`（六段式全参考）
  - ToonFlow `@图N` 标签 ↔ Minimax `<Subject X>` / `<Picture Y>` / `<Audio N>` 一一映射（编号严格对齐不洗牌）
  - 镜头术语映射表（景别/运镜）、时间戳最小 1 秒、台词保留原语言并包 `<d>[lang]...</d>`
- 已补 YAML frontmatter（name/description），生产 Agent 启动时自动扫描注册，可被 `activate_skill` 激活。
- 与既有 `minimax_h3_video_generation.md`（工厂工作流版）互补，两技能并存。

### 2.4 参考音频（11 个 WAV）

复制到 `data/oss/reference_audio/`，供 R2V 音频参考 / 导演台测试使用（在 ToonFlow 素材上传或 ComfyUI input 中使用）。

## 三、集成架构（三层，深度结合方式）

```
ToonFlow 前端（模型选择器 / 工作台分镜轨道）
   │
   ├─ ① 供应商适配器层（vendor .ts 脚本）——视频生成主路径
   │    u.Ai.Video("comfyui_local_minimax_h3_r2v:minimax-h3-r2v-fast")
   │    → videoRequest(config, model)  （data/vendor/*.ts）
   │    → 内嵌 WORKFLOW_JSON + 注入 base64 参考图/prompt/时长/分辨率/种子
   │    → POST http://localhost:8188/prompt → 轮询 /history → 下载成片转 base64
   │
   ├─ ② ComfyUI 工作流引擎层（engine=comfyui 模型）
   │    u.Ai.Video("comfyui:<workflowId>")
   │    → src/services/comfyui 内置引擎（workflow-analyzer + param-injector）
   │    → 按 analysis.derivedParams 注入 prompt/参考图/分辨率/时长/种子 → 执行
   │
   └─ ③ Agent Skill 层（提示词生产）
        productionAgent 执行导演 → activate_skill(minimax_h3_video_prompt_generation)
        → 按 h3_output_mode 生成官方规范提示词 → 写入分镜 videoDesc → 批量视频
```

- **适配器层**适合「H3 官方节点工作流」的精细控制（多参考、音频开关、LoRA 步数、17k+5 帧对齐），是文章推荐的量产主路径。
- **工作流引擎层**适合把任意 ComfyUI 工作流变成模型选择器里的一个模型（无需写脚本）。
- **Skill 层**解决「不会写 H3 官方规范提示词」的痛点：把 ToonFlow 分镜数据自动翻译成 `<Picture>`/`<Audio>` 标签体系。

### 模型键（modelKey）对照

| 用途 | 模型键 | 备注 |
| --- | --- | --- |
| H3 R2V 多参考 | `comfyui_local_minimax_h3_r2v:minimax-h3-r2v-fast` | 需 ≥1 张参考图（最多 9 图/3 视频/3 音频，节点实际 2 图） |
| H3 官方对齐 I2V/FL2V | `comfyui_local_minimax_h3_official:minimax-h3-i2v-official` | 单图或首尾帧；可开 Lightning LoRA |
| LTX2.5 图生视频 | `comfyui_local_ltx25_v5:local-ltx-2.5-api` | 单图 |
| 任意导入工作流 | `comfyui:<workflowId>` | 模型选择器内按工作流名称选 |

## 四、模型就位（关键一步）

ComfyUI 尚未在本机解压（大炮整合包 `D:\ComfyUI\26年4月大炮ComfyUI满血整合包\02-VIP整合包...zip`）。解压后执行：

```powershell
.\scripts\setup-comfyui-models.ps1 -ComfyUIRoot "<解压后的ComfyUI根目录>"
```

脚本会：
1. 创建 `models/diffusion_models|text_encoders|vae|loras|llm|latent_upscale_models|model_patches` 目录；
2. 用 **NTFS 硬链接**（同盘零额外空间）或复制，把 `D:\mengq\Documents\MinimaxH3\models` 与 `...\Toonflaw工作流和模型\models` 中的模型放入正确位置；
3. 为官方/导演台工作流创建 `*_pruned_int8_convrot.safetensors` **别名硬链接**（指向完整未剪枝版，避免音频电流声）；
4. 复制 8 个 custom_nodes（Goohai-MiniMax-H3_Integration、Goohaitools-comfyui、ComfyUI_LayerStyle_Advance、ComfyUI_RyanOnTheInside、ComfyUI_UltimateSDUpscale、glm_prompt、reservedvram、robe-nodes）到 `custom_nodes/`（目录联接，零复制）。

**模型 ↔ 工作流引用关系**（脚本已按此放置）：

| 工作流 | 需要模型 | 来源 |
| --- | --- | --- |
| H3 R2V 全参考（适配器 v6.4） | ref2va 完整版 + qwen3vl nvfp4_awq + 双 VAE + ref2v turbo LoRA | MinimaxH3\models |
| H3 官方对齐（适配器 v7.1） | fl2va 完整版 + qwen3vl nvfp4_awq + 双 VAE + fl2v turbo LoRA | MinimaxH3\models |
| H3 官方 T2V/I2V/R2V | fl2va/ref2va（pruned 别名）+ nvfp4_awq CLIP（int8 名称仅官方流引用，如需请另下） | 同上 |
| H3 导演台 V2 / 导演台 4 件套 | fl2va/ref2va 完整版 + nvfp4_awq + 双 VAE + fl2v turbo LoRA | 同上 |
| LTX2.5 图生视频 | ltx-2.5-22b int8/bf16 + gemma4 双件 + ltx 双 VAE + 潜空间放大 + duration-head | Toonflaw工作流和模型\models |
| Flux2-Klein 三图参考 | flux-2-klein-9b-fp8 + qwen_3_8b_fp8mixed + flux2-vae | 同上 |
| Krea2 四图三角度 | ⚠️ 未下载：krea2_turbo_fp8_scaled / qwen3vl_4b_fp8_scaled / qwen_image_vae / krea2_identity_edit_v1_2 | 需自行下载 |

## 五、使用指南（ToonFlow 内）

1. **配置**：设置 → 模型服务 → 找到三个新供应商，确认 `ComfyUI 地址` 为 `http://localhost:8188`（已启用）。若 ComfyUI 跑在云机/远端，改为对应地址。
2. **模型选择**：项目/分镜视频生成时，在视频模型下拉选择 `MiniMax H3‑R2V (多参考生视频)` / `MiniMax H3 (官方对齐版)` / `LTX 2.5`，或任一 `ComfyUI 工作流`。
3. **提示词**：让执行导演 Agent 使用 `minimax_h3_video_prompt_generation` 技能生成（自动按模式输出），或手动粘贴六段式/四字段官方格式。
4. **参考素材**：R2V 模式下按顺序上传参考图（第 1 张 → ref_image_0 主体，第 2 张 → ref_image_1 场景/道具），参考音频可选。
5. **测试**：设置 → 模型服务 → 对应模型「测试」，出片后确认音轨正常（无 400Hz 电流声）。

## 六、批量视频生产管线（后期目标）

ToonFlow 工作台天然支持批量：

- **分镜轨道批量生成**：`POST /api/production/workbench/batchGenerateVideo` —— 一个项目下多个分镜轨道（trackData[]）一次性提交，每个轨道后台并发执行 `u.Ai.Video(model)`，全部走 H3 适配器 → ComfyUI 排队出片，成片自动写回 `o_video`。
- **提示词批量生成**：`batchGeneratePrompt` / `generateVideoPrompt` 走 Agent + Skill，把每个分镜的 videoDesc 翻译为 H3 官方格式，无需人工改写。
- **规模化建议**：
  1. 本地 ComfyUI 用 `run_nvidia_gpu.bat` 启动后保持常驻（任务队列在 ComfyUI 端串行/并发执行）；
  2. H3 分辨率生产档位：测试 480–608p，正式 736–768p（0.98MP 上限，24fps）；
  3. 批量出片建议开 Lightning LoRA（4/8 步）提效，正式精修再关掉走 20 步；
  4. 大量生产可迁移到智星云 4090/A100 镜像（文章推荐），仅需把供应商 `ComfyUI 地址` 指向云机即可，模型/节点/工作流完全一致；
  5. 参考音频批量场景：把常用音色 WAV 放 `data/oss/reference_audio/`，分镜关联音频资产后由 R2V 适配器透传。

## 七、已知问题与后续建议

1. **Krea2 工作流缺模型**：如需使用请下载 4 个 Krea2 文件放入对应 models 目录。
2. **nvfp4_awq CLIP**：需较新 ComfyUI（0.3.x+，支持 FP4 量化加载）。若加载报错，改回 int8_convrot CLIP（需另下 7.4GB）并同步改适配器内 `clip_name`。
3. **pruned 别名**：脚本用完整版硬链接覆盖 pruned 名称；若用户手头确实只有 pruned 版，音频会受损（见 `docs/comfyui-minimax-h3-audio-fix.md`）。
4. **官方 T2V/I2V/R2V 工作流引用 `qwen3vl_32b_minimax_h3_int8_convrot.safetensors`**：与下载的 nvfp4_awq 不同名；在 ComfyUI 中直接打开这些工作流时需手动把 CLIP 换成 nvfp4_awq 或另下 int8 版。ToonFlow 适配器路径不受影响（已改 nvfp4_awq）。
5. **LLM GGUFs（Qwen3.8-27B + mmproj）**：供 Goohai 导演台「本地提示词优化」节点使用（读 `models/llm/`），需装 `llama-cpp-python`，可选功能不影响主流程。
6. **数据一致性**：本次导入全部走 ToonFlow 官方 API（addVendor / importWorkflow），数据库与文件均已落盘；供应商代码后续如需微调，在设置中心「模型服务」内直接编辑即可（`data/vendor/*.ts`）。

## 八、相关文件索引

- 适配器：`data/vendor/comfyui_local_minimax_h3_r2v.ts`、`data/vendor/comfyui_local_minimax_h3_official.ts`、`data/vendor/comfyui_local_ltx25_v5.ts`
- 工作流库：`data/workflows/`（三个子目录 + 根目录）
- 技能：`data/skills/production_skills/minimax_h3_video_prompt_generation.md`（新）、`data/skills/production_skills/minimax_h3_video_generation.md`（既有工厂版）
- 参考音频：`data/oss/reference_audio/`
- 模型就位脚本：`scripts/setup-comfyui-models.ps1`
- 既有研究：`docs/comfyui-minimax-h3-factory.md`、`docs/comfyui-minimax-h3-audio-fix.md`
- 原始资料：`D:\mengq\Documents\MinimaxH3`、`D:\mengq\Documents\Toonflaw工作流和模型`

## 九、本机实测结果（2026-08-23，RTX 4080 SUPER 32GB）

### 测试环境

- ComfyUI：`E:\ComfyUI\COMFYUI_dapaopao\ComfyUI`（v0.31.1，python_dapao312 torch 2.9.1+cu130，NORMAL_VRAM 动态显存）
- ToonFlow：`E:\workspace\Toonflow-app`（本地服务 10588）
- 模型：子目录 `Minimax-h3\` 内完整未剪枝 ref2va（hf-mirror 版）+ pruned fl2va + nvfp4_awq CLIP + 双 VAE + turbo LoRA

### 实测结论

| 测试 | 结果 | 耗时 | 输出 |
| --- | --- | --- | --- |
| MiniMax H3-R2V 多参考生视频（v6.4 适配器，完整 ref2va，480p/3s/20步/原生音频） | ✅ 成功 | ~106s | `data/oss/minimax_h3_r2v_480p_3s.mp4`（H264 864×480 @24fps，3.04s，AAC 立体声 32kHz，3MB） |
| MiniMax H3 官方对齐 I2V（v7.1 适配器，pruned fl2va + Lightning LoRA 8步，480p/3s） | ✅ 成功 | ~61s | `data/oss/minimax_h3_i2v_480p_3s.mp4`（H264 864×480 @24fps，3.04s，AAC，3MB） |
| LTX 2.5 图生视频（v5.0 适配器） | ⚠️ 工作流已适配（DualCFG→BasicGuider、conv VAE），执行受阻于 ComfyUI-LTXVideo ↔ ComfyUI 0.31 的 CLIP 编码接口不兼容（`process_tokens` 解包错误），需更新 ComfyUI-LTXVideo 节点包后重试 | — | — |

- 完整链路：ToonFlow 模型测试 API → 供应商 TS 适配器（`videoRequest`）→ 注入 base64 参考图/提示词/时长/分辨率 → ComfyUI `/prompt` → 采样（20步 ≈ 58s）→ 视频+音频 VAE 解码 → SaveVideo → 适配器轮询下载 → base64 回传 ToonFlow → 落盘 `data/oss/test.mp4`。
- **原生立体声音轨正常**（R2V 完整版模型），无 400Hz 电流声问题。

### 踩坑记录（重要）

1. **quark 网盘下载的 `minimax_h3_fl2va_int8_convrot.safetensors` / `minimax_h3_ref2va_int8_convrot.safetensors`（完整版）与 hf-mirror 版哈希不同，实际加载报 `Expecting value` / `shape invalid` 错误（疑似下载损坏）**。已删除平铺副本，改用上一会话从 hf-mirror 下载、已验证可用的子目录 `Minimax-h3\` 内文件。**如仍需完整 fl2va（I2V 音质正常），请从 hf-mirror 重新下载**：`https://hf-mirror.com/Comfy-Org/MiniMax-H3/resolve/main/diffusion_models/minimax_h3_fl2va_int8_convrot.safetensors`。
2. **`--lowvram` 会导致解码阶段卡死**（采样正常、VAE 解码挂起 15 分钟+）。本机 32GB 显存 + ComfyUI 动态显存管理足够，**不要加 `--lowvram`**（与「大炮配置网络启动.bat」一致）。
3. **v6.4 R2V 适配器 modelName 含 U+2011 非断行连字符**（`minimax‑h3‑r2v‑fast`），导致 ToonFlow 按 ASCII 连字符查找模型失败。已全局替换为 ASCII `minimax-h3-r2v-fast`。
4. I2V 当前使用 pruned fl2va（仅有的可用 fl2va），**音频会受损**（已知 pruned 模型问题）；视觉正常。完整 fl2va 下载到位后改回即可（适配器已指向 `Minimax-h3\minimax_h3_fl2va_int8_convrot.safetensors` 命名，重下后改 `unet_name` 一行）。
5. **LTX 2.5 适配器已做的兼容修正**：① 原工作流用 `LTXVDualCFGGuider`（当前 ComfyUI-LTXVideo 版本未提供）→ 已替换为标准 `BasicGuider`；② 视频 VAE 需用 `ltx-2.5-video-vae-conv-bf16.safetensors`（conv 变体，非 conv 版权重格式不匹配）。剩余阻塞：CLIP 编码 `process_tokens` 解包错误 —— ComfyUI-LTXVideo 与 ComfyUI 0.31 内核接口不兼容，需在 ComfyUI-Manager 中更新 ComfyUI-LTXVideo 节点包（当前网络受限无法自动更新）后重测。
6. **本机 ComfyUI 启动方式**：`E:\ComfyUI\COMFYUI_dapaopao\python_dapao312\python.exe -s ComfyUI\main.py --port 8188 --disable-pinned-memory`（工作目录 `E:\ComfyUI\COMFYUI_dapaopao`；**不要加 `--lowvram`**）。

### 查看成片

- R2V：`data/oss/minimax_h3_r2v_480p_3s.mp4`（http://localhost:10588/oss/minimax_h3_r2v_480p_3s.mp4）
- I2V：`data/oss/minimax_h3_i2v_480p_3s.mp4`（http://localhost:10588/oss/minimax_h3_i2v_480p_3s.mp4）
