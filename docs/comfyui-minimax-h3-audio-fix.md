# MiniMax-H3 音频 400Hz 谐波伪影问题修复记录

## 症状

H3 视频画面正常，但音频为**强烈机械伪影**：频谱呈 400Hz 基频 + 整数谐波（600/800/1200/1600Hz）强峰，
300Hz–1kHz 占能量 80%+，4kHz 以上几乎为零。听感为"电流声/滋滋啦啦"。

## 排查过程（已排除）

| 变量 | 结论 |
| --- | --- |
| TE-Speed 加速节点 | 排除（禁用后依旧） |
| fl2va vs ref2va 工作流 | 排除（两者都出现） |
| pruned vs 完整模型（adaln 2688 维） | 排除（完整模型依旧） |
| 音频/视频参考注入 | 排除（仅图片参考依旧） |
| res_multistep vs euler 采样器 | 排除（euler 依旧） |
| CLIP int8 vs nvfp4_awq | 排除（nvfp4 依旧） |
| 分辨率/时长 | 排除（0.3/0.4MP、5/10s 都出现） |

## 根因

**ComfyUI 核心文件版本混用**（新旧实现同时存在）：

- `comfy/model_base.py` + `comfy/model_sampling.py` = **新版**（[PR #15243](https://github.com/Comfy-Org/ComfyUI/pull/15243)，提交 `bdcb886`）：
  `ModelSamplingAV` 在采样器侧把**音频 latent 按 audio_scale（shift_video/shift_audio = 12/3 = 4）缩放到视频坐标**。
- `comfy/ldm/minimax/model.py` = **旧版**：`forward` 没有 undo/redo scale，`_forward` 末尾仍用
  `time_shift_slope` 把音频速度乘上 `dσ_audio/dσ_video`。

**新旧混用后果**：音频 latent 输入被 ×4（新版采样器），模型输出速度再被 ×slope（旧版模型），
`process_latent_out` 再 ÷4 —— 双重缩放，音频流的时间演化完全错误，退化为 400Hz 谐波伪影。

## 修复

1. 将 `comfy/ldm/minimax/model.py` 替换为 PR #15243（`bdcb886`）版本：
   - `forward` 增加 undo/redo scale（`audio_x * (sigma_a/sigma_v)` 与 `(1-scale)*audio_x + (1+(scale-1)*sigma_a)*out`）
   - `_forward` 末尾移除 `time_shift_slope`，直接返回 `-audio_out`
   - 删除 `time_shift_slope` 函数定义
2. 重新应用 TE-Speed 补丁（`("block_loop", 0)` 钩子 + `_run_blocks(start, end)`），保留加速能力
3. 重启 ComfyUI 生效

备份：`comfy/ldm/minimax/model.py.bak_oldslope`（旧版），`model.py.te_speed.bak`（patch 前）

## 验证结果

修复后同等工作流（int8 pruned、无音频参考、5s）音频频谱：
- 400Hz 整数谐波伪影**消失**；峰值变为 219/440/495/992Hz 等分散和声（音乐内容特征）
- 动态范围扩大（RMS -26.8→-21.1 dBFS，Peak -16→-7.2 dBFS）
- 听感从"电流声"变为正常音乐内容

## 相关参考

- GitHub Issue: [Comfy-Org/ComfyUI#15283](https://github.com/Comfy-Org/ComfyUI/issues/15283)（AMD 环境爆音，另一问题，已由 PR #15243 修复）
- PR: [Comfy-Org/ComfyUI#15243](https://github.com/Comfy-Org/ComfyUI/pull/15243)（kijai，原生 AV 采样修复）
- [ComfyUI-MiniMaxH3DualClockSampler](https://github.com/shuaixn/ComfyUI-MiniMaxH3DualClockSampler)（双时钟采样器，4 步 turbo 场景）
