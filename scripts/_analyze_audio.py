"""分析生成视频音频与参考音频的频谱特征"""
import sys, wave
import numpy as np

def load_wav(path):
    with wave.open(path, 'rb') as w:
        n = w.getnframes(); sr = w.getframerate(); ch = w.getnchannels()
        raw = w.readframes(n)
    data = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    if ch > 1: data = data.reshape(-1, ch).mean(axis=1)
    return data, sr

def analyze(path, label):
    x, sr = load_wav(path)
    n = len(x)
    dur = n / sr
    print(f"\n===== {label} =====")
    print(f"时长 {dur:.2f}s | 采样率 {sr} | 样本数 {n}")

    # 时域统计
    rms = np.sqrt(np.mean(x**2))
    peak = np.max(np.abs(x))
    dc = np.mean(x)
    print(f"RMS={rms:.4f} ({20*np.log10(rms+1e-12):.1f} dBFS) | Peak={peak:.4f} ({20*np.log10(peak+1e-12):.1f} dBFS) | DC={dc:.5f}")

    # 分段 RMS（看是否有间歇性噪声）
    seg = 0.5
    nseg = int(dur/seg)
    seg_rms = []
    for i in range(nseg):
        s = x[int(i*seg*sr):int((i+1)*seg*sr)]
        seg_rms.append(20*np.log10(np.sqrt(np.mean(s**2))+1e-12))
    print("分段RMS(dB):", " ".join(f"{v:5.1f}" for v in seg_rms))

    # 频谱分析：整体 FFT + 频段能量
    win = np.hanning(min(n, sr*2))
    for start in [0, int(dur/2*sr)]:
        segx = x[start:start+len(win)] if start+len(win) <= n else x[start:]
        if len(segx) < len(win): continue
        w = segx[:len(win)] * win
        spec = np.fft.rfft(w)
        mag = np.abs(spec)
        freqs = np.fft.rfftfreq(len(win), 1/sr)
        # 频段能量
        bands = [(0,50,'0-50Hz'), (50,100,'50-100Hz'), (100,300,'100-300Hz'), (300,1000,'300-1k'), (1000,4000,'1k-4k'), (4000,8000,'4k-8k'), (8000,16000,'8k-16k')]
        total = np.sum(mag**2)
        print(f"频谱@{(start/sr):.1f}s 频段能量占比:")
        for lo, hi, name in bands:
            mask = (freqs >= lo) & (freqs < hi)
            e = np.sum(mag[mask]**2)
            print(f"  {name}: {100*e/total:5.1f}%")
        # 顶部峰值频率
        top = np.argsort(mag)[-10:][::-1]
        tops = [(round(freqs[i],1), round(mag[i],1)) for i in top if freqs[i] > 5]
        print(f"  顶部峰值频率: {tops}")
    return x, sr

x_out, sr_out = analyze('E:/workspace/Toonflow-app/temp/h3_audio_out.wav', '生成视频音频 (Toonflow_H3_Ref2VA_00001_)')

# 参考音频
print("\n\n########## 参考音频分析 ##########")
import subprocess, os
ff = r'E:\ComfyUI\COMFYUI_dapaopao\python_dapao312\ffmpeg\bin\ffmpeg.exe'

def extract_ref(src, dst, start=0, dur=10):
    subprocess.run([ff, '-y', '-v', 'error', '-ss', str(start), '-t', str(dur), '-i', src, '-acodec', 'pcm_s16le', '-ar', '32000', dst], check=False)

# 参考音频 1: VX-paolaoshiAICG__00007_.flac（独立音频参考）
flac = r'E:\ComfyUI\COMFYUI_dapaopao\ComfyUI\input\VX-paolaoshiAICG__00007_.flac'
if os.path.exists(flac):
    extract_ref(flac, 'E:/workspace/Toonflow-app/temp/ref_flac.wav')
    analyze('E:/workspace/Toonflow-app/temp/ref_flac.wav', '参考音频 flac (VX-paolaoshiAICG__00007_)')

# 参考音频 2: 分镜2.mp4 音轨
mp4 = r'E:\ComfyUI\COMFYUI_dapaopao\ComfyUI\input\分镜2.mp4'
if os.path.exists(mp4):
    extract_ref(mp4, 'E:/workspace/Toonflow-app/temp/ref_mp4.wav')
    analyze('E:/workspace/Toonflow-app/temp/ref_mp4.wav', '参考视频音轨 (分镜2.mp4)')
