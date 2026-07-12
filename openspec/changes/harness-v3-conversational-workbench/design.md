## Context

Toonflow 已有剧本、分镜、人物、道具、地点、资产和视频生产页面，也已有 Harness 的 Agent、任务图、工作流执行、审核、事件和产物回写基础。当前问题是这些能力彼此分散，聊天组件无法真正修改业务对象，主控台又把执行细节压成一张复杂的 Agent 仪表盘。

目标是实现一个“LaperAI 风格工作台 + Toonflow 影视领域能力 + Harness 内核”的架构。LaperAI 可借鉴的是交互机制，不是私有源码：左侧项目导航、中间领域画布、右侧上下文对话，以及聊天驱动的结构化数据变更。

## Goals / Non-Goals

**Goals:**

- 让用户通过自然语言创建和修改影视制作对象。
- 让 AI 自动读取当前项目、剧集、场次、选中对象和上游产物。
- 让 AI 通过强类型工具执行真实的数据修改和生成任务。
- 让所有变更可回溯、可审核、可撤销、可重新执行。
- 复用 Toonflow 现有领域页面、模型配置和生成服务。
- 让剧本到分镜、分镜到视频的工作流由 Harness 自动调度。

**Non-Goals:**

- 不复制 LaperAI 的源码、私有 API 或内部模型。
- 不把所有 Agent 细节展示在主界面。
- 第一阶段不提供 ComfyUI 参数面板和 workflow 编辑器。
- 不要求一次性重做所有现有业务页面。
- 不在第一阶段实现多人协同和复杂权限系统。

## Decisions

### 1. 产品壳层采用领域工作台，不再采用 Harness 控制室

```text
┌──────────────┬──────────────────────────────────────┬──────────────┐
│ 项目 / 剧集导航 │ 当前领域工作区                         │ 属性 / 版本    │
│ 剧本           │ 剧本、节拍、场次、分镜、角色卡片            │ 选中对象属性   │
│ 节拍           │ 画布、列表、时间线或编辑器                 │ 版本历史      │
│ 分镜           │                                      │ 生成状态      │
│ 场次           │                                      │              │
│ 人物           │                                      │ ┌──────────┐ │
│ 道具           │                                      │ │ AI 对话  │ │
│ 地点           │                                      │ │ Director │ │
│ 资产           │                                      │ └──────────┘ │
└──────────────┴──────────────────────────────────────┴──────────────┘
```

旧控制室保留为开发监控和调试入口，不再作为普通用户的主工作台。用户主流程复用现有 Toonflow 页面：小说管理、剧本 Agent、剧本管理、塑角造景、视频生产和资产中心。共享工作台壳层负责承载 AI Director，领域页面负责承载真实产物。

### 2. 对话采用“上下文 + 计划 + 工具调用 + 结果”四段式执行

用户输入不会直接交给某个 Agent，而是经过以下流程：

```text
用户指令
  -> ContextResolver 读取项目和页面状态
  -> DirectorPlanner 生成结构化计划
  -> ToolRuntime 校验并执行工具
  -> DomainEventBus 广播数据变更
  -> 当前工作区刷新
  -> AI 返回结果、影响范围和下一步建议
```

所有写操作必须产生 `ActionRun`，包含用户指令、计划、工具调用、输入快照、输出、版本和审核结果。

### 3. Agent 只能通过领域工具操作系统

Agent 不直接修改 DOM，不直接拼接 SQL。工具类别包括：

- `project.read_context`
- `script.read` / `script.create` / `script.update`
- `beat.list` / `beat.create` / `beat.update`
- `scene.read` / `scene.create` / `scene.update`
- `character.create` / `character.update` / `character.generate_reference`
- `prop.create` / `prop.update` / `prop.generate_reference`
- `location.create` / `location.update` / `location.generate_reference`
- `storyboard.generate_plan` / `storyboard.update_shot` / `storyboard.generate_image`
- `video.generate_clip` / `video.review_clip`
- `artifact.list_versions` / `artifact.rollback`
- `review.request` / `review.approve` / `review.reroute`

### 4. 使用统一领域对象和 Artifact Graph

核心关系为：

```text
Project
 └─ Episode
     ├─ Script
     ├─ Beat
     └─ Scene
         ├─ CharacterRef -> Character
         ├─ PropRef -> Prop
         ├─ LocationRef -> Location
         └─ Shot
             ├─ StoryboardImage
             ├─ VideoClip
             └─ AudioTrack
```

每个对象都要有 `id`、`projectId`、`source`、`createdBy`、`updatedAt`、`version` 和 `artifactLinks`。

### 5. 生成服务统一走 Provider Adapter

Agent 只请求抽象能力，例如 `image.generate` 或 `video.generate`。具体模型和供应商由 Provider Registry 决定。这样可以复用现有 Toonflow 模型配置，又能在后续接入 ComfyUI、云端模型或本地模型而不污染工作台。

### 6. 审核和用户确认是工具执行的一部分

低风险字段修改可自动执行；批量生成、删除、跨阶段修改和终审必须生成确认卡。审核失败时由 ReviewPipeline 生成结构化 `reroute` 或 `retryInstruction`，并把结果展示在聊天和当前工作区中。

## Risks / Trade-offs

- [Risk] 工具过多导致 Agent 选择错误 -> [Mitigation] 工具按领域和当前页面动态裁剪，并用 JSON Schema 约束参数。
- [Risk] 页面和数据库状态不一致 -> [Mitigation] 所有变更必须通过 DomainEventBus，并为每次 ActionRun 提供幂等键。
- [Risk] 自动生成成本不可控 -> [Mitigation] 对批量生成、重试和跨阶段操作设置预算、审批和取消机制。
- [Risk] 业务页面复用导致组件耦合 -> [Mitigation] 先抽取领域数据适配层，工作台只复用展示和编辑组件。
- [Risk] LLM 输出不稳定 -> [Mitigation] 使用结构化输出、工具 schema、确定性脚本和降级计划。

## Migration Plan

1. 冻结旧 Harness 主控室 UI 的新增功能。
2. 抽取 ContextResolver、ToolRegistry、ActionRun 和 DomainEventBus。
3. 将剧本、场次、人物、道具、地点、分镜现有接口封装为工具。
4. 升级现有工作台壳层并嵌入常驻 AI Director，先完成剧本 / 场次 / 分镜闭环。
5. 为现有人物、道具、地点和资产页面接入上下文与 UI Patch。
6. 为现有视频片段、音频和剪辑页面接入上下文与 UI Patch。
7. 将旧 Harness 控制室降级为开发监控页。

## Open Questions

- AI 对话窗口默认固定在右侧，还是允许用户拖动为浮层。
- 用户修改剧本后，是否自动标记下游分镜和视频为“需要复核”。
- 第一阶段的默认案例是短剧单集还是电影单场景。
- 需要支持的第一批生成 Provider 是哪些。
