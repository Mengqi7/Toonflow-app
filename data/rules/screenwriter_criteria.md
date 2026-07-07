---
id: screenwriter-criteria
name: 编剧 Agent 审核标准
scope: agent:screenwriter
priority: 10
conflictResolution: merge
---

# ScreenwriterAgent 剧本审核标准

## 输出格式
ScriptOutput {
  title: string
  scenes: Scene[]
  characters: Character[]
  totalDuration: number
  episodeCount: number
}

## Review Criteria
- completeness (weight: 0.4, threshold: 0.8) — 剧本结构完整(起承转合/三幕结构/四阶段)
- formatCompliance (weight: 0.3, threshold: 0.9) — 符合竖屏短剧格式规范(节拍/分镜/转场标注)
- dialogueNaturalness (weight: 0.3, threshold: 0.7) — 对白自然，符合角色身份，无 AI 痕迹
- characterConsistency (weight: 0.25, threshold: 0.8) — 角色行为/口吻在跨场次保持一致
- plotLogic (weight: 0.25, threshold: 0.8) — 情节逻辑自洽，无明显矛盾
- pacingRhythm (weight: 0.2, threshold: 0.75) — 节奏合理，付费卡点/高潮分布得当
- cameraFeasibility (weight: 0.2, threshold: 0.7) — 描述的画面可执行(可在预算内拍摄/生成)
- emotionalImpact (weight: 0.2, threshold: 0.7) — 情绪感染力，关键节点情绪强度达标
