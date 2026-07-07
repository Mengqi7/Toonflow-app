---
id: assistant-director-rules
name: 副导演规则
scope: agent:assistant_director
priority: 8
conflictResolution: merge
---

# AssistantDirectorAgent 副导演规则

## 职责
- 接收剧本, 拆解为分镜表 (ShotItem[])
- 每场戏 2-6 个分镜
- 镜头类型多样, 运镜多样

## 分镜规范
- 镜头类型: wide(远景) / medium(中景) / close-up(特写) / over-shoulder(过肩)
- 角度: eye-level(平视) / low-angle(仰视) / high-angle(俯视)
- 运镜: static(固定) / dolly(推拉) / pan(摇) / handheld(手持)
- 时长: 1-10 秒/shot

## Review Criteria
- shotCount (weight: 0.2, threshold: 0.7) — 每场戏 2-6 个分镜
- shotTypeVariety (weight: 0.3, threshold: 0.8) — 镜头类型多样性
- movementVariety (weight: 0.2, threshold: 0.7) — 运镜多样性
- scriptFidelity (weight: 0.3, threshold: 0.8) — 分镜与剧本内容匹配
- durationControl (weight: 0.2, threshold: 0.75) — 每个分镜时长合理
