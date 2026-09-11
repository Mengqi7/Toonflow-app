# ============================================================
# setup-comfyui-models.ps1
# MiniMax H3 / LTX2.5 / Flux2-Klein 模型 + 自定义节点 → ComfyUI 一键就位
#
# 用法:
#   .\scripts\setup-comfyui-models.ps1                       # 自动探测 ComfyUI 根目录
#   .\scripts\setup-comfyui-models.ps1 -ComfyUIRoot "D:\ComfyUI\COMFYUI_dapaoVIP\ComfyUI"   # 指定目录
#   .\scripts\setup-comfyui-models.ps1 -OnlyModels           # 只放置模型，不复制 custom_nodes
#   .\scripts\setup-comfyui-models.ps1 -NoAlias              # 不创建 pruned 别名（官方/导演台工作流将找不到模型）
#
# 说明:
#   - 同盘符优先使用 NTFS 硬链接（不占额外磁盘空间），否则复制
#   - pruned 别名: 官方工作流/导演台引用 *_pruned_* 名称，这里用完整未剪枝版
#     硬链接同名别名。⚠️ 完整版音质正常，pruned 版音频有 400Hz 电流声（见 docs）
#   - LLM GGUFs 放入 models/llm/（Goohai 导演台提示词优化节点读取目录）
# ============================================================
param(
  [string]$ComfyUIRoot = "",
  [switch]$OnlyModels,
  [switch]$NoAlias
)

$ErrorActionPreference = "Stop"
$Material = "D:\mengq\Documents"

function Get-AutoRoot {
  $candidates = @(
    "D:\ComfyUI\26年4月大炮ComfyUI满血整合包\02-VIP整合包【含VIP工作流和白嫖算力调用流】\COMFYUI_dapaoVIP\ComfyUI",
    "D:\ComfyUI\ComfyUI",
    "D:\ComfyUI\COMFYUI_dapaoVIP\ComfyUI",
    "D:\comfyui\ComfyUI"
  )
  foreach ($c in $candidates) {
    if (Test-Path (Join-Path $c "main.py")) { return $c }
  }
  # 模糊搜索 run_nvidia_gpu.bat
  $hit = Get-ChildItem "D:\" -Recurse -Depth 4 -Filter "run_nvidia_gpu.bat" -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match "ComfyUI" } | Select-Object -First 1
  if ($hit) { return $hit.DirectoryName }
  return $null
}

if (-not $ComfyUIRoot) {
  $auto = Get-AutoRoot
  if ($auto) { $ComfyUIRoot = $auto } else {
    Write-Host "未自动探测到 ComfyUI（main.py）。请先解压大炮整合包，再手动指定:" -ForegroundColor Yellow
    Write-Host "  .\scripts\setup-comfyui-models.ps1 -ComfyUIRoot <ComfyUI 根目录>" -ForegroundColor Yellow
    exit 1
  }
}
if (-not (Test-Path (Join-Path $ComfyUIRoot "main.py"))) {
  Write-Host "✗ $ComfyUIRoot 不是有效的 ComfyUI 根目录（缺少 main.py）" -ForegroundColor Red
  exit 1
}
Write-Host "✓ ComfyUI 根目录: $ComfyUIRoot" -ForegroundColor Green

$modelsRoot = Join-Path $ComfyUIRoot "models"
$dirs = @("diffusion_models", "text_encoders", "vae", "loras", "llm", "latent_upscale_models\LTX2.5", "model_patches", "checkpoints")
foreach ($d in $dirs) { New-Item -ItemType Directory -Force -Path (Join-Path $modelsRoot $d) | Out-Null }

function Place([string]$src, [string]$sub, [string]$name) {
  if (-not (Test-Path $src)) { Write-Host "  ✗ 源不存在: $src" -ForegroundColor Red; return }
  $dst = Join-Path $modelsRoot "$sub\$name"
  if (Test-Path $dst) { Write-Host "  = 已存在: $sub\$name" -ForegroundColor DarkGray; return }
  $srcVol = (Get-Item $src).PSDrive.Root
  $dstVol = (Get-Item $modelsRoot).PSDrive.Root
  if ($srcVol -eq $dstVol) {
    New-Item -ItemType HardLink -Path $dst -Target $src -Force | Out-Null
    Write-Host "  ✓ 硬链接: $sub\$name" -ForegroundColor Green
  } else {
    Copy-Item $src $dst -Force
    Write-Host "  ✓ 复制: $sub\$name" -ForegroundColor Green
  }
}

Write-Host "`n===== MiniMax H3 模型 =====" -ForegroundColor Cyan
$h3 = Join-Path $Material "MinimaxH3\models"
Place (Join-Path $h3 "diffusion_models\minimax_h3_fl2va_int8_convrot.safetensors") "diffusion_models" "minimax_h3_fl2va_int8_convrot.safetensors"
Place (Join-Path $h3 "diffusion_models\minimax_h3_ref2va_int8_convrot.safetensors") "diffusion_models" "minimax_h3_ref2va_int8_convrot.safetensors"
Place (Join-Path $h3 "text_encoders\qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors") "text_encoders" "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors"
Place (Join-Path $h3 "vae\minimax_h3_video_vae_fp16.safetensors") "vae" "minimax_h3_video_vae_fp16.safetensors"
Place (Join-Path $h3 "vae\minimax_h3_audio_vae_fp32.safetensors") "vae" "minimax_h3_audio_vae_fp32.safetensors"
Get-ChildItem (Join-Path $h3 "loras") -Filter "*.safetensors" -ErrorAction SilentlyContinue | ForEach-Object {
  Place $_.FullName "loras" $_.Name
}
Get-ChildItem (Join-Path $h3 "LLM") -Filter "*.gguf" -ErrorAction SilentlyContinue | ForEach-Object {
  Place $_.FullName "llm" $_.Name
}

if (-not $NoAlias) {
  Write-Host "`n===== pruned 别名（官方/导演台工作流兼容）=====" -ForegroundColor Cyan
  Write-Host "  ⚠️ 完整未剪枝版硬链接为 *_pruned_* 名称。完整版音质正常；若改用真 pruned 模型音频会有电流声" -ForegroundColor Yellow
  Place (Join-Path $modelsRoot "diffusion_models\minimax_h3_fl2va_int8_convrot.safetensors") "diffusion_models" "minimax_h3_fl2va_pruned_int8_convrot.safetensors"
  Place (Join-Path $modelsRoot "diffusion_models\minimax_h3_ref2va_int8_convrot.safetensors") "diffusion_models" "minimax_h3_ref2va_pruned_int8_convrot.safetensors"
}

Write-Host "`n===== LTX 2.5 模型 =====" -ForegroundColor Cyan
$ltx = Join-Path $Material "Toonflaw工作流和模型\models"
Place (Join-Path $ltx "Diffusion models\ltx-2.5-22b-distilled-transformer-bf16.safetensors") "diffusion_models" "ltx-2.5-22b-distilled-transformer-bf16.safetensors"
Place (Join-Path $ltx "Diffusion models\ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors") "diffusion_models" "ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors"
Place (Join-Path $ltx "textencoder\ltx2.5\gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors") "text_encoders" "gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors"
Place (Join-Path $ltx "textencoder\ltx2.5\gemma4_e2b_it_bf16.safetensors") "text_encoders" "gemma4_e2b_it_bf16.safetensors"
Place (Join-Path $ltx "vae\ltx-2.5-video-vae-bf16.safetensors") "vae" "ltx-2.5-video-vae-bf16.safetensors"
Place (Join-Path $ltx "vae\ltx-2.5-video-vae-conv-bf16.safetensors") "vae" "ltx-2.5-video-vae-conv-bf16.safetensors"
Place (Join-Path $ltx "vae\ltx-2.5-audio-vae-bf16.safetensors") "vae" "ltx-2.5-audio-vae-bf16.safetensors"
Place (Join-Path $ltx "latent_upscale_models\LTX2.5\ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors") "latent_upscale_models\LTX2.5" "ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors"
Place (Join-Path $ltx "latent_upscale_models\LTX2.5\ltx-2.5-latent-temporal-upscaler-x2-bf16-1.0.safetensors") "latent_upscale_models\LTX2.5" "ltx-2.5-latent-temporal-upscaler-x2-bf16-1.0.safetensors"
Place (Join-Path $ltx "model_patches\ltx-2.5-duration-head-bf16.safetensors") "model_patches" "ltx-2.5-duration-head-bf16.safetensors"

Write-Host "`n===== Flux2-Klein 模型 =====" -ForegroundColor Cyan
Place (Join-Path $ltx "diffusion_models\flux-2-klein-4b-fp8.safetensors") "diffusion_models" "flux-2-klein-4b-fp8.safetensors"
Place (Join-Path $ltx "diffusion_models\flux-2-klein-4b.safetensors") "diffusion_models" "flux-2-klein-4b.safetensors"
Place (Join-Path $ltx "diffusion_models\flux-2-klein-9b-fp8.safetensors") "diffusion_models" "flux-2-klein-9b-fp8.safetensors"
Place (Join-Path $ltx "diffusion_models\flux-2-klein-9b.safetensors") "diffusion_models" "flux-2-klein-9b.safetensors"
Place (Join-Path $ltx "text_encoders\qwen_3_8b_fp8mixed.safetensors") "text_encoders" "qwen_3_8b_fp8mixed.safetensors"
Place (Join-Path $ltx "text_encoders\gemma_3_12B_it_fpmixed.safetensors") "text_encoders" "gemma_3_12B_it_fpmixed.safetensors"
Place (Join-Path $ltx "vae\flux2-vae.safetensors") "vae" "flux2-vae.safetensors"

if (-not $OnlyModels) {
  Write-Host "`n===== custom_nodes =====" -ForegroundColor Cyan
  $cnRoot = Join-Path $ComfyUIRoot "custom_nodes"
  New-Item -ItemType Directory -Force -Path $cnRoot | Out-Null
  $cnSources = @(
    (Join-Path $Material "MinimaxH3\custom_nodes\Goohai-MiniMax-H3_Integration"),
    (Join-Path $Material "MinimaxH3\custom_nodes\Goohaitools-comfyui"),
    (Join-Path $Material "Toonflaw工作流和模型\custom_nodes\ComfyUI_LayerStyle_Advance"),
    (Join-Path $Material "Toonflaw工作流和模型\custom_nodes\ComfyUI_RyanOnTheInside"),
    (Join-Path $Material "Toonflaw工作流和模型\custom_nodes\ComfyUI_UltimateSDUpscale"),
    (Join-Path $Material "Toonflaw工作流和模型\custom_nodes\glm_prompt"),
    (Join-Path $Material "Toonflaw工作流和模型\custom_nodes\reservedvram"),
    (Join-Path $Material "Toonflaw工作流和模型\custom_nodes\robe-nodes")
  )
  foreach ($src in $cnSources) {
    if (-not (Test-Path $src)) { Write-Host "  ✗ 源不存在: $src" -ForegroundColor Red; continue }
    $name = Split-Path $src -Leaf
    $dst = Join-Path $cnRoot $name
    if (Test-Path $dst) { Write-Host "  = 已存在: custom_nodes\$name" -ForegroundColor DarkGray; continue }
    $srcVol = (Get-Item $src).PSDrive.Root
    $dstVol = (Get-Item $cnRoot).PSDrive.Root
    if ($srcVol -eq $dstVol) {
      cmd /c mklink /J "$dst" "$src" | Out-Null
      Write-Host "  ✓ 目录联接: custom_nodes\$name" -ForegroundColor Green
    } else {
      Copy-Item $src $dst -Recurse -Force
      Write-Host "  ✓ 复制: custom_nodes\$name" -ForegroundColor Green
    }
  }
}

Write-Host "`n✅ 完成。请启动 ComfyUI 验证节点与模型加载。" -ForegroundColor Green
Write-Host "Krea2 工作流（krea2_四图三角度）需要额外下载 krea2_turbo_fp8_scaled / qwen3vl_4b_fp8_scaled / qwen_image_vae / krea2_identity_edit_v1_2，本包未包含。" -ForegroundColor Yellow
