"""分析指定 wav 频谱（简化版）"""
import sys, wave
import numpy as np

def analyze(path, label):
    with wave.open(path, 'rb') as w:
        n = w.getnframes(); sr = w.getframerate(); ch = w.getnchannels()
        raw = w.readframes(n)
    data = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    if ch > 1: data = data.reshape(-1, ch).mean(axis=1)
    dur = len(data) / sr
    rms = np.sqrt(np.mean(data**2))
    peak = np.max(np.abs(data))
    print(f"\n===== {label} =====")
    print(f"时长 {dur:.2f}s | RMS={rms:.4f} ({20*np.log10(rms+1e-12):.1f} dBFS) | Peak={peak:.4f} ({20*np.log10(peak+1e-12):.1f} dBFS)")

    win = np.hanning(min(len(data), sr*2))
    for start in [0, int(dur/2*sr)]:
        if start + len(win) > len(data): break
        segx = data[start:start+len(win)] * win
        spec = np.fft.rfft(segx); mag = np.abs(spec)
        freqs = np.fft.rfftfreq(len(win), 1/sr)
        total = np.sum(mag**2)
        print(f"频谱@{(start/sr):.1f}s:")
        for lo, hi, name in [(0,100,'0-100Hz'), (100,300,'100-300Hz'), (300,1000,'300-1k'), (1000,4000,'1k-4k'), (4000,8000,'4k-8k'), (8000,16000,'8k-16k')]:
            mask = (freqs >= lo) & (freqs < hi)
            e = np.sum(mag[mask]**2)
            print(f"  {name}: {100*e/total:5.1f}%")
        top = np.argsort(mag)[-8:][::-1]
        tops = [(round(freqs[i],1), round(mag[i],1)) for i in top if freqs[i] > 5]
        print(f"  顶部峰值: {tops}")

if __name__ == '__main__':
    for p in sys.argv[1:]:
        analyze(p, p.split('\\')[-1])
