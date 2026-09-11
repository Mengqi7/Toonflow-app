# MiniMax-H3 视频工厂工作流（Toonflow × 本地 ComfyUI）

> 基于业界 Ref2VA 最佳实践构建的高质量视频生成工作流，已适配 Toonflow 一键导入。

## 工作流文件

- `data/workflows/Toonflow_MiniMaxH3_Ref2VA_工厂工作流.json`
- 导入方式：Toonflow 设置 → ComfyUI 配置 → 「一键导入工作流 JSON」选择该文件
- 导入后自动注册为「ComfyUI 工作流」供应商下的模型，可在模型选择器中直接选用

## 工作流架构（27 节点 / 31 连线）

```
┌─ 模型加载 ─────────────────────────────────────────────┐
│ UNETLoader (ref2va pruned int8)  ← 本地 MiniMax-H3     │
│ CLIPLoader (Qwen3-VL-32B int8)                         │
│ VAELoader ×2 (视频 VAE + 音频 VAE)                      │
└───────────────────────────────────────────────────────┘
┌─ 加速链 ───────────────────────────────────────────────┐
│ SageAttention (auto) → 显存优化补丁 → TE-Speed (0.12)   │
└───────────────────────────────────────────────────────┘
┌─ 参考输入（多参考 Ref2VA）─────────────────────────────┐
│ LoadImage ×2（参考图：人物 + 环境/道具）                │
│ VHS_LoadVideo ×1（参考视频：运镜/节奏）                 │
│ VHS_LoadAudioUpload ×2（参考视频音轨 + 独立音频参考）    │
└───────────────────────────────────────────────────────┘
┌─ 条件化 ───────────────────────────────────────────────┐
│ CR Text（六段式提示词模板）                             │
│ ResolutionSelector（9:16 / 0.4MP / 32 对齐）            │
│ ComfyMathExpression（时长 17k+5 帧网格对齐）            │
│ MiniMaxH3ReferenceToVideo（ref_image_size=max 保真）    │
└───────────────────────────────────────────────────────┘
┌─ 采样/解码/输出 ──────────────────────────────────────┐
│ RandomNoise + KSamplerSelect(res_multistep)            │
│ BasicScheduler(simple, 25步) + BasicGuider             │
│ SamplerCustomAdvanced（视频+音频双流）                  │
│ VAEDecode + VAEDecodeAudio → CreateVideo → SaveVideo   │
└───────────────────────────────────────────────────────┘
```

## 质量设计要点

1. **Ref2VA 模型（完整版，非 pruned）**：`minimax_h3_ref2va_int8_convrot.safetensors`。
   ⚠️ **必须使用完整未剪枝模型**——pruned 剪枝版将 adaln 时间嵌入从 2688 维压缩到 8 维，
   **音频流严重受损（实测表现为 400Hz 谐波机械伪影/电流声）**，视频正常但音频不可用。
   完整版下载：https://hf-mirror.com/Comfy-Org/MiniMax-H3/resolve/main/diffusion_models/minimax_h3_ref2va_int8_convrot.safetensors （34GB）
2. **ref_image_size = max**：参考图按 2048px 短边处理，保留最高身份保真度
   （参考 token 全程注入，生成更"像"参考）。
3. **六段式提示词**：按官方 MiniMax-H3 规范（subject_definitions / summary /
   retention_analysis / detailed_description / overall_soundscape / non_diegetic_music），
   使用 `<Picture 1>` / `<Video 1>` / `<Audio 1>` 标签。
4. **分辨率 0.4MP 9:16**（480×864）：竖屏短剧标准画幅，4080 SUPER 32GB 可流畅运行。
5. **25 步 simple + res_multistep**：业界大炮工作流同款采样配置。

## 使用说明

### Toonflow 生成时
- **提示词**：填六段式 Ref2VA 提示词（参考 `data/skills/production_skills/minimax_h3_video_generation.md`）；
  不填则使用工作流内置模板。
- **参考图**：按顺序上传（第 1 张 → 参考图1=人物，第 2 张 → 参考图2=环境/道具）。
- 视频/音频参考：将文件放入 ComfyUI `input/` 目录后在 ComfyUI 中修改对应节点文件名。

### 直接改工作流（在 ComfyUI 中打开 JSON）
- 时长：改「时长(秒)」PrimitiveFloat（默认 10，自动对齐 17k+5 帧网格）
- 分辨率：改 ResolutionSelector（0.3MP 更快 / 0.5MP 更清晰）
- 参考视频/音频：VHS_LoadVideo / VHS_LoadAudioUpload 节点改文件名
- 提示词：CR Text 节点

## 已验证

- ✅ 导入 Toonflow（自动分析：25 节点 / 2 提示词 / 2 图片输入 / 1 视频输出）
- ✅ ComfyUI 提交校验通过（含 Autogrow 参考输入 `ref_images.ref_image_0` 等点号键格式）
- ✅ 完整执行链路：模型加载 → SageAttention → Ref2VA 条件化 → 采样 → 视频解码 → 音视频合成 → SaveVideo 输出
- ✅ **音频正常**（需配合 ComfyUI 音频修复，见 `docs/comfyui-minimax-h3-audio-fix.md`）
