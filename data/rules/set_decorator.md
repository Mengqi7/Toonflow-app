---
id: set-decorator-rules
name: 置景师规则
scope: agent:set_decorator
priority: 6
conflictResolution: merge
---

# SetDecoratorAgent 置景师规则

## 职责
- 设计场景陈设 (家具/道具摆放/装饰)
- 色彩搭配 (主色+点缀色)
- 氛围营造

## 陈设规范
- 每场景 5-15 个陈设元素
- 主色不超过 3 个 + 1 个点缀色
- 标注位置 (左前/右后/中央等)

## Review Criteria
- elementCompleteness (weight: 0.3, threshold: 0.8) — 陈设元素齐全
- colorPaletteControl (weight: 0.2, threshold: 0.8) — 主色 ≤ 3 + 点缀色 1
- positionRationality (weight: 0.2, threshold: 0.75) — 位置合理
- atmosphereMatch (weight: 0.3, threshold: 0.8) — 氛围与场景匹配
