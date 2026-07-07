---
id: makeup-rules
name: 化妆师规则
scope: agent:makeup
priority: 6
conflictResolution: merge
---

# MakeupAgent 化妆师规则

## 职责
- 设计角色妆容 (底妆/眼妆/唇妆/修容)
- 特效妆 (伤效/年龄变化/奇幻效果)
- 跨场次妆容一致性

## 妆容规范
- 底妆: 自然/光泽/哑光
- 眼妆: 日常/烟熏/彩色
- 唇妆: 裸色/红唇/深色
- 特效: 伤痕/老化/精灵耳等

## Review Criteria
- makeupConsistency (weight: 0.4, threshold: 0.8) — 跨场次妆容一致
- characterMatch (weight: 0.3, threshold: 0.8) — 妆容符合角色设定
- effectQuality (weight: 0.3, threshold: 0.7) — 特效妆质量
