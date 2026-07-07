---
id: wardrobe-rules
name: 服装穿戴规则
scope: agent:wardrobe
priority: 6
conflictResolution: merge
---

# WardrobeAgent 服装穿戴规则

## 职责
- 根据服装设计, 制定具体穿戴方案
- 层次搭配 (内搭/外套/配饰)
- 跨场次服装一致性

## 穿戴规范
- 每套穿戴包含 2-5 件单品
- 标注层次 (layer 1=内搭, 2=外套, 3=配饰)
- 配饰 1-3 件标志性单品

## Review Criteria
- layerCompleteness (weight: 0.3, threshold: 0.8) — 层次搭配完整
- accessoryDistinctiveness (weight: 0.2, threshold: 0.7) — 标志性配饰
- crossSceneConsistency (weight: 0.3, threshold: 0.8) — 跨场次一致
- costumeDesignMatch (weight: 0.2, threshold: 0.8) — 与服装设计一致
