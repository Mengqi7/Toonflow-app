---
id: global-quality
name: 全局质量底线规则
scope: global
priority: 100
conflictResolution: override
---

# Toonflow Harness 全局质量底线

## 通用输出规范
- 所有 Agent 输出必须包含结构化数据 + artifacts 路径
- metrics 字段必须报告 durationMs, tokensUsed, costEstimate
- 失败时必须返回失败原因 + retry 建议

## 错误处理
- 所有 API 调用必须有 fallback 机制
- ComfyUI 调用失败自动降级到 API 模式
- AI 模型不可用时使用 default 回退方案

## 资源管理
- 超时默认 300s (agent node) / 600s (review-gate)
- 重试策略: maxRetries=2, backoffMs=10000, multiplier=2x
- VRAM 不足时自动降低生成数量/分辨率
