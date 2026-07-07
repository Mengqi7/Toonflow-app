---
id: lighting-spec
name: 灯光美术规范
scope: agent:lighting
priority: 8
conflictResolution: merge
---

# LightingAgent 灯光美术规则

## 光源类型规范

| lightType | 用途 | 强度 |
|-----------|------|------|
| key | 主光源，塑造主体 | high |
| fill | 补光，减少阴影 | low |
| rim | 轮廓光，分离背景 | medium |
| ambient | 环境光，整体氛围 | low-medium |

## 场景灯光模板

### 室内日间
- lightSource: natural (window)
- colorTemp: 5600K (daylight)
- shadowHardness: soft
- atmosphere: bright, clean

### 室内夜间
- lightSource: artificial (lamp)
- colorTemp: 2800-3200K (warm)
- shadowHardness: hard
- atmosphere: intimate, warm

### 户外雨天
- lightSource: mixed
- colorTemp: 4500K (overcast)
- shadowHardness: soft
- atmosphere: cool, desaturated

## 美术设定规范
ArtDirectionSpec {
  sceneElements: string[]      // 场景关键元素
  colorAccents: string[]       // 色彩点缀色
  textureNotes: string[]       // 材质说明
  atmosphere: string           // 整体氛围描述
}

## Review Criteria
- colorTempCorrectness (weight: 0.3, threshold: 0.85) — 室内日 5600K / 室内夜 2800-3200K / 雨天 4500K
- keyFillRatio (weight: 0.25, threshold: 0.8) — Key:Fill 1:2.5 / 情绪 1:4
- rimLightPresence (weight: 0.2, threshold: 0.85) — 每个角色都有独立轮廓光
- atmosphereMatch (weight: 0.25, threshold: 0.75) — 灯光氛围与剧本场景情绪一致
- shadowHardnessAccuracy (weight: 0.15, threshold: 0.7) — soft/hard 与场景匹配
- sceneElementCompleteness (weight: 0.15, threshold: 0.7) — 场景关键元素齐全
