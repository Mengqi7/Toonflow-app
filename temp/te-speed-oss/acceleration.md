# 加速配置：SageAttention + TE-Speed + 音频质量

## 全栈加速链（实测组合）

```
UNETLoader → PatchSageAttentionKJ(auto) → TESpeedMiniMaxH3 → MiniMaxH3SigmaShift → 采样
```

| 组件 | 收益 | 要点 |
|---|---|---|
| SageAttention | ~11% | 装 1.0.6（PyPI 有）；2.2.0 与 H3 不兼容（CUDA crash 实测） |
| TE-Speed-MiniMaxH3 | ~40% | 闭源插件，块级缓存；插在 UNETLoader 后 |
| torch cu130 | **3-5×** | 见 [cu130-upgrade.md](cu130-upgrade.md)（最大收益） |

## SageAttention 安装

```bash
# 1.0.6（H3 实测稳定）
pip install sageattention==1.0.6

# KJNodes 的 PatchSageAttentionKJ 节点，sage_attention=auto
```

> ⚠️ SageAttention 2.2.0 的 kernel 与 H3 的非标准精度层冲突，实测导致 CUDA illegal memory access 崩溃。保持 1.0.6。

## TE-Speed-MiniMaxH3

- 社区闭源补丁（nodes.pyd + ComfyUI `comfy/ldm/minimax/model.py` 替换）
- 原理：给 DiT 块循环加 `block_loop` 钩子，按音频/视频段做块级缓存（相邻采样步输出相似则跳过计算）
- 参数（实测安全默认）：`processing_control_value=0.12, processing_percent_1=0.1, processing_percent_2=0.9, mcs=2`
- 回滚：`git checkout v0.30.1 -- comfy/ldm/minimax/model.py`
- 安装方式见原分享帖（本仓库不分发闭源组件）

## 采样参数（质量/速度平衡）

| 参数 | 值 | 依据 |
|---|---|---|
| steps | **20** | 12 步音频有 40 次爆音瞬态（实测）；20 步干净 |
| sampler | dpmpp_2m | 整流流少步数收敛好 |
| scheduler | beta（参考密集）/ simple | 官方建议 |
| shift | 12 / 3 | 官方默认，勿动 |

## 音频质量要点

- **20 步是底线**：12 步时音频 VAE 解码出爆音（样本跳变 >20k 达 40 次），20 步为 0
- 32kHz 立体声是 H3 模型固有采样率（正常）
- 对白：台词写进 SHOT 描述 + 说话方式（trembling whisper），音画同生
- 无音乐需求时明确写 `SFX ONLY, no music`

