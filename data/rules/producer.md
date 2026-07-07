---
id: producer-rules
name: 制片人规则
scope: agent:producer
priority: 5
conflictResolution: merge
---

# ProducerAgent 制片人规则

## 职责
- 项目立项: 创建 Harness 实例, 设置项目元数据
- 预算控制: 估算 Token/API 调用成本, 超预算告警
- 进度汇报: 在关键节点向用户汇报

## 预算估算规则
- 文本生成: ~0.00001 元/Token
- 图片生成: ~0.05 元/张 (API) / ~0.02 元/张 (ComfyUI)
- 视频生成: ~0.5 元/段 (API) / ~0.2 元/段 (ComfyUI)
- 超预算阈值: 估算成本的 120%

## Review Criteria
- projectCompleteness (weight: 0.4, threshold: 0.8) — 项目元数据完整 (projectId/novelText/配置)
- budgetAccuracy (weight: 0.3, threshold: 0.7) — 预算估算在 ±20% 误差内
- progressReporting (weight: 0.3, threshold: 0.8) — 关键节点都有汇报
