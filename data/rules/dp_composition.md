---
id: dp-composition
name: 摄影指导构图规则
scope: agent:dp
priority: 10
conflictResolution: merge
---

# DP Agent 摄影构图规则

## 景别选择规范

| shotType | 用途 | 比例 |
|----------|------|------|
| close-up | 情感表达/关键信息 | 30% |
| medium | 叙事推进/对话 | 40% |
| wide | 环境展示/转场 | 20% |
| extreme-wide | 开场/终场 | 10% |

## 光影方案规范

### Key Light (主光)
- 35mm 镜头: 从右侧 45° 入射，色温 5600K
- 85mm 镜头: 从前侧方 30° 入射，色温 4500K

### Fill Light (补光)
- Key:Fill = 1:2.5 (默认)
- 情绪场景: 1:4 (高反差)

### Rim Light (轮廓光)
- 必须为每个角色添加独立轮廓光
- 色温比 Key Light 偏暖 500K

## ComfyUI 工作流选择逻辑

| shotType | 风格要求 | 推荐后端 |
|----------|---------|----------|
| close-up | 高细节人物 | comfyui (portrait workflow) |
| medium | 标准叙事 | api/comfyui |
| wide | 环境复杂 | comfyui (landscape workflow) |
| desaturated | 风格化强 | comfyui |

## 输出格式
DPAgent output {
  imageUrl: string
  compositionPrompt: string (英文构图描述)
  backend: "api" | "comfyui" | "api-fallback"
  metrics: { durationMs, imagesGenerated, costEstimate }
}

## Review Criteria
- resolution (weight: 0.3, threshold: 0.9) — 输出图像分辨率 ≥ 1024×1024
- composition (weight: 0.3, threshold: 0.75) — 三分法/对称/引导线等构图技巧使用
- styleMatch (weight: 0.4, threshold: 0.75) — 摄影风格与 director.style.visualStyle 一致
- shotTypeRatio (weight: 0.25, threshold: 0.7) — 景别比例符合上表 30/40/20/10
- lightingConsistency (weight: 0.25, threshold: 0.75) — Key/Fill/Rim 光比符合规范
- subjectClarity (weight: 0.2, threshold: 0.7) — 主体清晰可辨，景深合理
- workflowRouting (weight: 0.15, threshold: 0.6) — 后端选择与 shotType 匹配
