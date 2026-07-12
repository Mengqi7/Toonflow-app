export const FIRST_WORKBENCH_ACCEPTANCE_CASE = {
  id: "single-episode-six-shots",
  title: "对话修改单个分镜并保留已锁定设定",
  fixture: {
    episodeCount: 1,
    shotCount: 6,
    selectedShotIndex: 2,
    lockedReferences: ["character.costume", "location.visual_identity"],
  },
  instruction: "把当前镜头改成中近景，保留人物服装和场景不变",
  expected: {
    contextIncludes: ["project", "episode", "selectedShot", "scene", "characters", "location", "promptVersions", "reviewReports"],
    planTool: "storyboard.update_shot",
    changedFields: ["shotSize"],
    preservedFields: ["characterRefs", "locationRef"],
    evidence: ["actionRun", "toolCall", "artifactVersion", "domainEvent", "uiPatch"],
    fullPageReload: false,
  },
} as const;
