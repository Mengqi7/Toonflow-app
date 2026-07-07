---
id: vfx-criteria
name: 视效 Agent 审核标准
scope: agent:vfx
priority: 8
conflictResolution: merge
---

# VFXAgent 视效审核标准

## 输出格式
VFXOutput {
  effects: Effect[]
  composites: CompositeLayer[]
  renderTime: number
  costEstimate: number
}

## Review Criteria
- effectQuality (weight: 0.3, threshold: 0.8) — 特效质量(粒子/物理/烟雾)
- compositingSeamlessness (weight: 0.3, threshold: 0.85) — 合成无缝，无明显接缝
- motionRealism (weight: 0.25, threshold: 0.75) — 运动真实，符合物理规律
- lightingConsistency (weight: 0.25, threshold: 0.8) — 特效光照与场景一致
- renderEfficiency (weight: 0.15, threshold: 0.7) — 渲染效率(单帧 < 30s)
- budgetControl (weight: 0.15, threshold: 0.7) — 成本控制，无过度计算
- platformCompatibility (weight: 0.1, threshold: 0.7) — 兼容目标平台(分辨率/编码)
