---
id: sound-design
name: 音效设计方案
scope: agent:sound
priority: 7
conflictResolution: merge
---

# SoundAgent 声音设计规则

## 声部规范

### Voice Actors (配音)
| gender | age | usage |
|--------|-----|-------|
| male/female | youth/middle/old | 按角色设定匹配 |

- BGM Mood → Tempo 映射:
  - suspense/tense → slow, minor key
  - joy/excitement → fast, major key
  - sadness/melancholy → slow, ambient
  - action/adventure → fast, rhythmic

### Sound Effects (音效)
| type | timing | layer |
|------|--------|-------|
| environment | continuous | background |
| action | on-point | foreground |
| transition | spot | mid |

## 音频时间轴规范
AudioTimeline {
  tracks: EditTrack[]        // 音轨(对白/音乐/音效)
  totalDuration: number      // 总时长
  bpm?: number              // BPM
}

## Review Criteria
- voiceEmotionMatch (weight: 0.3, threshold: 0.75) — 配音情绪与画面情绪一致
- bgmMoodTempoAlignment (weight: 0.25, threshold: 0.8) — BGM Mood → Tempo 映射正确
- dialogueClarity (weight: 0.25, threshold: 0.85) — 对白可懂度 + 音量平衡 (-6dB ~ -3dB)
- sfxTimingAccuracy (weight: 0.2, threshold: 0.75) — 音效在画面事件触发的瞬间
- audioVideoSync (weight: 0.25, threshold: 0.9) — 音视频同步精度 < 100ms
- trackLayering (weight: 0.15, threshold: 0.7) — 对白/音乐/音效分层不冲突
