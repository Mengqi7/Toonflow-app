---
id: costume-consistency
name: 角色造型一致性规则
scope: agent:costume
priority: 9
conflictResolution: merge
---

# CostumeAgent 角色造型一致性规则

## 角色造型规范

### 服装
- 每套服装必须包含: 上衣 + 下装 + 外套(可选) + 鞋
- 颜色不超过3个主色+1个点缀色
- 面料描述需具体 (棉麻/丝绸/皮革/尼龙等)

### 发型
- 长度: short/medium/long
- 样式: straight/curly/wavy/braided
- 颜色: 与角色身份匹配

### 配饰
- 必须有1-3件标志性配饰
- 示例: 手表、项链、戒指、围巾、帽子等

## 一致性审核标准

### embedding 相似度阈值
| 维度 | 最低分 | 优秀 |
|------|--------|------|
| 服装配色 | 0.75 | 0.9+ |
| 发型轮廓 | 0.80 | 0.92+ |
| 配饰特征 | 0.70 | 0.88+ |

### 低于阈值自动修正
- prompt 中重述参考描述
- 增加 IP-Adapter weight
- 切换至 comfyui portrait workflow

## 输出格式
CostumeAgent output {
  characterName: string
  outfit: string
  hairStyle: string
  accessories: string[]
  makeup: string
  consistencyNotes: string
}

## Review Criteria
- outfitCompleteness (weight: 0.25, threshold: 0.85) — 上衣/下装/外套/鞋齐全
- colorPaletteControl (weight: 0.2, threshold: 0.8) — 主色 ≤ 3 + 点缀色 1
- hairStyleConsistency (weight: 0.2, threshold: 0.85) — 发型/颜色符合角色设定
- accessoryDistinctiveness (weight: 0.15, threshold: 0.7) — 1-3 件标志性配饰
- characterEmbeddingSimilarity (weight: 0.4, threshold: 0.78) — 与 o_character_library 参考图 embedding 相似度
- crossSceneStability (weight: 0.3, threshold: 0.75) — 跨场次造型不漂移
