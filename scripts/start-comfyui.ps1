# Start ComfyUI (background test) - ASCII only
$base = 'E:\ComfyUI\COMFYUI_dapaopao'
$py = Join-Path $base 'python_dapao312\python.exe'
$env:PYTHONHOME = ''
$env:PYTHONPATH = ''
$env:PYTHONEXECUTABLE = $py
$env:FFMPEG_PATH = Join-Path $base 'python_dapao312\ffmpeg\bin'
$env:TORCH_HOME = Join-Path $base 'cache'
$env:HF_ENDPOINT = 'https://hf-mirror.com'
$env:HF_HOME = Join-Path $base 'hf_download'
$env:CUDA_HOME = Join-Path $base 'python_dapao312\Library'
$env:EXTRA_MODEL_PATHS = Join-Path $base 'ComfyUI\extra_model_paths.yaml'
$env:PYTHONIOENCODING = 'utf-8'
$env:PYTHONUTF8 = '1'
$env:Path = (Join-Path $base 'python_dapao312') + ';' + (Join-Path $base 'python_dapao312\Scripts') + ';' + $env:FFMPEG_PATH + ';' + $env:Path

Set-Location $base
& $py -s 'ComfyUI\main.py' --port 8188 --disable-pinned-memory 2>&1
