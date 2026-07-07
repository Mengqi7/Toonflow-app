---
id: editor-criteria
name: 剪辑 Agent 审核标准
scope: agent:editor
priority: 9
conflictResolution: merge
---

# EditorAgent 剪辑审核标准

## 输出格式
EditTimeline {
  tracks: VideoTrack[]
  transitions: Transition[]
  totalDuration: number
  pacing: { rhythm, averageShotLength }
}

## Review Criteria
- pacingRhythm (weight: 0.3, threshold: 0.75) — 节奏合理，平均镜头长度符合平台规范(短剧 2-4s)
- transitionRationality (weight: 0.25, threshold: 0.8) — 转场选择与情绪匹配(硬切/溶镜/淡入淡出)
- durationControl (weight: 0.25, threshold: 0.85) — 总时长符合目标(竖屏短剧单集 60-90s)
- shotContinuity (weight: 0.3, threshold: 0.8) — 跳切连贯(视线匹配/动作连贯/轴线规则)
- audioVisualSync (weight: 0.2, threshold: 0.85) — 音画对位准确，对白/音效与画面匹配
- storyboardAdherence (weight: 0.25, threshold: 0.75) — 与 director.storyboard 高度一致
- emotionalPacing (weight: 0.2, threshold: 0.7) — 情绪递进曲线平滑，无突兀跳跃
- platformOptimization (weight: 0.15, threshold: 0.7) — 平台特性优化(封面/标题/前 3 秒钩子)
