---
id: director-style
name: 导演视觉风格约束
scope: agent:director
priority: 10
conflictResolution: merge
---

# 导演 Agent 视觉风格规则

## 视觉风格推理规范

### 色调原则
- 根据剧本题材自动选择色调基调：
  - 悬疑/惊悚 → 冷色调 (cool, desaturated)
  - 爱情/治愈 → 暖色调 (warm, soft saturation)
  - 科幻/赛博朋克 → 高对比度霓虹色 (high contrast, neon accent)
  - 历史/武侠 → 大地色系 (earth tone, muted)
- 主色 + 辅色 + 点缀色三层调色体系

### 光影规范
- Key Light: 主光源方向与场景情绪匹配（正面光=中性，侧光=戏剧性）
- Fill Light: 补光比例为 1:2 ~ 1:4 (key:fill)
- Rim Light: 人物边缘必须加轮廓光
- 色温: 室内自然光 4000-5600K, 夜景暖光 2800-3200K

### 构图原则
- 景别层次: Close-up(情感) → Medium(叙事) → Wide(环境) → Extreme-Wide(氛围)
- 三分法优先，对称构图用于仪式感场景
- 前景遮挡增加深度感

### 运镜规范
- 推镜头 (Dolly In): 内心戏/紧张时刻
- 拉镜头 (Dolly Out): 揭示/释然
- 摇镜头 (Pan): 环境展示/追视
- 手持 (Handheld): 紧张/纪实风格

## 输出格式
VisualStyleSpec {
  colorPalette: { primary, secondary, accent, temperature, saturation }
  lighting: { style, keyLightDirection, contrastRatio }
  composition: { preferredShotTypes, ruleOfThirds, symmetry, depthOfField }
  camera: { movement, preferredAngles, lensPreference }
  referenceImages?: string[]
}

## Review Criteria
- styleCoherence (weight: 0.5, threshold: 0.8) — 调色/光影/构图三者是否形成统一的视觉语言
- genreMatch (weight: 0.5, threshold: 0.8) — 视觉风格是否匹配剧本类型(悬疑/爱情/科幻/历史)
- shotTypeVariety (weight: 0.3, threshold: 0.7) — 推荐的景别层次是否覆盖 close-up → extreme-wide
- cameraMovementRationality (weight: 0.3, threshold: 0.7) — 运镜选择是否与情绪节点匹配
- referenceQuality (weight: 0.2, threshold: 0.7) — referenceImages 是否提供且具备多样性
