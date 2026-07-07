# Harness V2 — 详细设计文档（中文版）

> 本文档是 `harness-v2-director-control` 的技术设计。前置阅读: `proposal.md`。  
> 范围: 整体架构 / 流转流程 / 13 工种契约 / ComfyUI 重写 / 多级审核与历史版本 / 代码清理清单 / UI 原型说明。

---

## 目录

1. 上下文
2. Harness 工程规范遵循
3. 整体架构
4. 详细流转流程
5. 13 工种 Agent 完整定义
6. ComfyUI 模块完全重写设计
7. 多级审核与历史版本
8. 业务集成方案
9. 代码清理清单
10. 主控台 UI 升级
11. 风险与权衡
12. 迁移计划
13. 开放问题

---

## 1. 上下文

### 1.1 当前状态

- **后端 Agent**: `src/agents/{screenwriter,director,dp,lighting,costume,sound,editor,vfx}` 8 个 Agent，但 5 个默认走 fallback（mock 占位图、default 风格/分镜/声场）
- **Harness 引擎**: `src/core/harness/{WorkflowRunner,AgentRegistry,RulesEngine,SkillsRegistry,MemoryBus,MCPConnector,ScriptExecutor}.ts` 框架存在但只跑空转
- **ComfyUI**: `src/comfyui/*` 客户端代码存在但前端配置页面完全不可用；`o_comfyui_workflow` 表有数据但参数无法注入
- **审核**: `src/review/ReviewPipeline.ts` 三阶段审核已通，但 `data/rules/*.md` 8 个标准未真正应用，onReject=skip
- **未提交代码**: 15 个文件（`NovelImportService` / `ReviewLearner` / `migration` / `routes/review` / `routes/style` 等）大量为重试代码或空壳

### 1.2 约束

- 必须复用 `utils/ai.ts` 的 AI 调用层
- 必须复用现有业务表（`o_script` / `o_storyboard` / `o_assets` / `o_character_library` / `o_scene_library` / `o_prop_library` / `o_comfyui_server` / `o_comfyui_workflow`）
- 必须复用 6 个业务前端页面作为 Harness 产物查看入口
- 必须遵循标准 Harness 工程规范（agents/skills/hooks/workflow/scripts/memory）
- **spec 文档必须用中文编写**

---

## 2. Harness 工程规范遵循

### 2.1 六要素对照表

| Harness 规范要素 | 本项目实现 | 说明 |
|------------------|-----------|------|
| **agents** | `src/agents/<role>/` 目录，每个 Agent 导出 `descriptor` | 13 工种 + 导演调度者 |
| **skills** | `data/skills/<role>/` 目录，Markdown + frontmatter | 每个工种的提示词模板与工具调用 |
| **hooks** | `src/core/harness/Hooks.ts` | beforeTask / afterTask / onReview / onReroute / onUserConfirm 5 个钩子 |
| **workflow** | `data/workflows/*.yaml` + DirectorOrchestrator 动态任务图 | YAML 作为可选模板，实际调度由 LLM 决策 |
| **scripts** | `data/scripts/*.js` | 确定性逻辑（FFmpeg 合并、数据转换） |
| **memory** | `src/core/harness/MemoryBus.ts` + `o_memory` 表 | 多命名空间（system/project/agent/workflow/event） |

### 2.2 多 Agent 协作契约

每个 Agent 必须声明：

```typescript
interface AgentContract {
  // 1. 角色定义
  role: string;                    // 如 "screenwriter"
  name: string;                    // 中文名 "编剧"
  description: string;             // 一句话职责描述
  
  // 2. 上场时机（由导演 Agent 决策）
  triggerConditions: string[];     // 如 ["剧本阶段开始", "场 X 需要重写"]
  
  // 3. 输入契约
  inputs: {
    name: string;
    type: string;
    required: boolean;
    description: string;
    source: "user" | "director" | "upstream:<agentId>" | "memory";
  }[];
  
  // 4. 输出契约
  outputs: {
    name: string;
    type: string;
    description: string;
    targetTable?: string;          // 写入的业务表
    targetColumn?: string;
  }[];
  
  // 5. 相互关系
  dependsOn: string[];             // 依赖哪些 Agent 的输出
  canBeReroutedFrom: string[];     // 哪些 Agent 的审核失败可以打回给本 Agent
  canRerouteTo: string[];          // 本 Agent 失败时可以打回给哪些 Agent
  
  // 6. 失败兜底
  onFailure: "throw" | "fallback" | "ask_user";
  maxRetries: number;
}
```

---

## 3. 整体架构

### 3.1 架构图（ASCII）

```
┌────────────────────────────────────────────────────────────────────────────┐
│                          用户 (浏览器 / Electron)                          │
└─────────────────────────────────────────┬──────────────────────────────────┘
                                  │ HTTP + SSE
                                  ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                         Express 路由层 (src/routes/)                       │
│  /api/harness/control/*  /api/harness/events/stream  /api/comfyui/*        │
└─────────────────────────────────┬──────────────────────────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                      🎬 导演 Agent (DirectorOrchestrator)                  │
│                   提示词驱动 + LLM 决策 + 任务图生成                       │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  - 接收用户对话 / 小说输入                                          │  │
│  │  - LLM 决策下一步派哪个工种                                        │  │
│  │  - 生成 TaskNode[] 任务图                                          │  │
│  │  - 调用 WorkflowRunner.enqueueTask()                               │  │
│  │  - 监听 task.* 事件, 决定继续/暂停/驳回/完成                       │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────┬──────────────────────────────────────────┘
                                  │ 派发任务
                                  ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                  ⚙️ WorkflowRunner (单任务执行容器)                       │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  - bindInputs (从上游产物读取)                                     │  │
│  │  - createInstance (从 AgentRegistry)                               │  │
│  │  - agent.init() → agent.execute() → agent.cleanup()                │  │
│  │  - 应用 review-gate (调用 ReviewPipeline)                          │  │
│  │  - 重试预算管理                                                    │  │
│  │  - 发出 task.started/progress/completed/failed 事件                │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────┬──────────────────────────────────────────┘
                                  │ 调用
                                  ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                    🎭 13 工种 Agent (src/agents/)                          │
│  ┌─────────┬─────────┬─────────┬─────────┬─────────┬─────────┬─────────┐  │
│  │制片人   │导演     │副导演   │监制     │场记     │编剧     │DP       │  │
│  │Producer │Director │AD       │Supervis │ScriptSup│Screenwri│DP       │  │
│  ├─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┤  │
│  │灯光     │服装     │化妆     │置景     │录音     │声音设计 │剪辑     │  │
│  │Lighting │Costume  │Makeup   │SetDecor │Sound    │SoundDes │Editor   │  │
│  └─────────┴─────────┴─────────┴─────────┴─────────┴─────────┴─────────┘  │
│                              + 视效 (VFX)                                  │
│  每个 Agent:                                                                │
│  - 继承 FilmAgent 基类                                                     │
│  - 注入 system prompt (data/rules/<role>.md + skills/<role>/*.md)          │
│  - 真实调用 AI / API / ComfyUI (无 mock)                                   │
│  - 产物通过 CallbackBridge 回写业务表                                      │
└──────┬───────────────────────────────────────────────┬────────────────────┘
       │                                               │
       ▼                                               ▼
┌──────────────────────────────┐         ┌──────────────────────────────────┐
│  💾 CallbackBridge           │         │  📡 HarnessEventBus (SSE)        │
│  产物回写业务表:             │         │  事件流推送到前端:               │
│  - o_script (剧本)           │         │  - task.started/progress/complete│
│  - o_storyboard (分镜)       │         │  - review.scored/reroute         │
│  - o_assets (图片/视频/音频) │         │  - director.message/user_input   │
│  - o_character_library       │         │  - callback.persisted/failed     │
│  - o_scene_library           │         └──────────────────────────────────┘
│  - o_prop_library            │
│  - o_artifact_version (新)   │  ← 多版本保存
└──────────────────────────────┘
       │
       ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                    🤖 ReviewPipeline (多级审核)                            │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  1. 技术 (TechnicalReviewer) - 分辨率/格式/AI瑕疵 (规则+程序)       │  │
│  │  2. 艺术 (ArtisticReviewer) - 构图/风格/光影 (AI 视觉模型)          │  │
│  │  3. 内容 (ContentReviewer) - 与剧本/分镜一致性 (AI 文本-图像对比)   │  │
│  │  4. 监制 (SupervisorAgent) - 综合判断通过/打回/升级用户             │  │
│  │  5. 用户确认 (UserConfirmGate) - 关键节点弹窗让用户确认             │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌────────────────────────────────────────────────────────────────────────────┐
│              🎨 ComfyUI 模块 (完全重写 src/comfyui/)                       │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  - ComfyUIServerManager: 服务管理 (多 server, 健康检查, 负载均衡)   │  │
│  │  - WorkflowLibrary: 工作流 CRUD + 版本管理 + 缩略图                 │  │
│  │  - ParameterEditor: 参数提取 + 可视化编辑 + 类型校验                │  │
│  │  - WorkflowExecutor: 提交执行 + WS 进度 + 结果下载                  │  │
│  │  - BackendSelector: 根据 shot 类型自动选 API / ComfyUI              │  │
│  │  - AssetProcessor: 下载产物 + 写入 o_assets + 缩略图生成            │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 调度权分层

```
用户 (输入/确认) 
  ↓
导演 Agent (LLM 决策调度)          ← 真正的"调度者"
  ↓
WorkflowRunner (单任务执行容器)     ← 不再是顶层调度者
  ↓
工种 Agent (实际干活)              ← 13 个工种
  ↓
CallbackBridge (产物落库) + EventBus (事件推送)
  ↓
ReviewPipeline (多级审核) → 监制 Agent (LLM 决策打回)
  ↓
用户确认 (关键节点)
```

---

## 4. 详细流转流程

### 4.1 端到端流程（从小说到成片）

```
[步骤 0: 用户启动]
  用户在主控台输入: "开始制作《退婚后...》"
  ↓
[步骤 1: 制片人 Agent 上场]
  ProducerAgent.handleStart()
    - 创建 Harness 实例
    - 写入 o_project 配置
    - 通知导演 Agent "项目已立项"
  ↓
[步骤 2: 导演 Agent LLM 决策]
  DirectorOrchestrator.planNextStep(state)
    LLM 输入: 用户意图 + 项目配置 + 已完成任务
    LLM 输出: { action: "dispatch", nextTask: { agentRole: "screenwriter", ... } }
  ↓
[步骤 3: 编剧 Agent 上场]
  WorkflowRunner.enqueueTask({ agentRole: "screenwriter", input: { novel, stage: "generate" } })
    ↓
  ScreenwriterAgent.execute()
    - 调用 LLM 生成 8 场标准剧本
    - 返回 { script: "场 1 ... 场 8 ..." }
    ↓
  CallbackBridge.persist("screenwriter", output)
    - 解析场号, 写入 8 行 o_script
    - source="harness", instanceId=abc123
    ↓
  HarnessEventBus.emit("task.completed", { agentRole: "screenwriter", artifacts: [...] })
    ↓
  前端 SSE 收到事件 → StageScriptEditor 立即显示 8 场剧本
  ↓
[步骤 4: 监制 Agent 审核剧本]
  ReviewPipeline.review("screenwriter", output, reference)
    - 技术审核: 格式合规性 ✓
    - 艺术审核: 对白自然度 ✓
    - 内容审核: 与小说核心情节匹配 ✓
    ↓
  SupervisorAgent.decide(score)
    LLM 输入: 评分 + 失败维度 + 历史驳回记录
    LLM 输出: { action: "approve" } 或 { action: "reroute", toAgent: "screenwriter" }
    ↓
  approved → 导演 Agent 继续
  rejected → 重新派活给编剧 (带 retryInstruction)
  ↓
[步骤 5: 用户确认剧本]
  SupervisorAgent 判断 "剧本涉及核心情节, 需用户确认"
    ↓
  发出 director.user_input_required 事件
    前端弹出确认窗口: "剧本已生成, 是否进入下一阶段?"
    选项: ["通过, 进入分镜", "需要修改 (在对话中输入)"]
    ↓
  用户点击 "通过" → 导演 Agent 继续下一步
  用户输入修改 → 导演 Agent 重新派活编剧
  ↓
[步骤 6: 副导演 Agent 拆解分镜]
  DirectorOrchestrator.planNextStep() → dispatchTask({ agentRole: "assistant_director", ... })
  AssistantDirectorAgent.execute()
    - 调用 LLM 拆解 24 个分镜
    - 返回 { storyboardPlan: { shots: [...] } }
  CallbackBridge.persist() → 写入 o_storyboard
  ↓
[步骤 7: 美术部并行上场]
  导演 Agent LLM 决策: "分镜已完成, 美术部三工种可并行"
  并行派发 3 个任务:
    - CostumeAgent (服装)
    - MakeupAgent (化妆)
    - SetDecoratorAgent (置景)
  3 个 Agent 并行执行, 各自产物落库
  ↓
[步骤 8: DP 摄影指导生图]
  导演 Agent 决策: "美术完成, 派 DP 按 24 个 shot 并行生图 (parallelDegree=4)"
  DPAgent.execute()
    - BackendSelector.chooseBackend(shot, style)
      → 根据风格强度选 API 或 ComfyUI
    - 调用 ai.Image() 或 ComfyUIExecutor.run()
    - 返回 { images: [{ shotId, imageUrl, compositionPrompt }] }
  CallbackBridge.persist() → 写入 o_assets + 更新 o_storyboard.imageUrl
  ↓
[步骤 9: 每张图触发审核]
  ReviewPipeline.review("dp", image, reference)
    - 技术: 分辨率/AI瑕疵
    - 艺术: 构图/风格/光影
    - 内容: 与分镜描述一致性
  ↓
  SupervisorAgent.decide()
    - approved → 该 shot 通过
    - rejected → 决策打回给谁:
        A) 构图问题 → 打回给 DP (重写 prompt)
        B) 内容不符 → 打回给编剧 (重写场 X)
        C) 角色不一致 → 打回给服装/化妆
  ↓
  打回时保存历史版本到 o_artifact_version (新表)
  ↓
[步骤 10: 视效 Agent 生视频]
  所有 shot 通过后, 导演 Agent 决策: "派 VFX 生视频"
  VFXAgent.execute()
    - 调用视频生成 API 或 ComfyUI 视频工作流 (Wan2.1 / SVD / AnimateDiff)
    - 返回 { videoUrl }
  CallbackBridge.persist() → 写入 o_assets (type=video)
  ↓
[步骤 11: 剪辑 + 录音 并行]
  导演 Agent 决策: "视频完成, 剪辑与录音并行"
  EditorAgent + SoundDesignerAgent + SoundAgent 并行
  ↓
[步骤 12: 监制 Agent 终审]
  ReviewPipeline.review("final", allArtifacts, reference)
  SupervisorAgent.decide() → approve / reroute
  ↓
[步骤 13: 用户确认成片]
  发出 director.user_input_required: "成片已完成, 是否导出?"
  选项: ["导出", "需要调整"]
  ↓
[步骤 14: 制片人 Agent 汇报]
  ProducerAgent.handleComplete()
    - 汇总所有产物
    - 计算总成本
    - 通知用户
  ↓
[完成]
```

### 4.2 打回决策矩阵

| 失败维度 | 可能原因 | 打回给谁 | 用户介入？ |
|----------|----------|----------|------------|
| 构图评分低 | DP prompt 不好 | DP | 否（自动重写） |
| 风格不匹配 | DP 没遵守 VisualStyleSpec | DP | 否 |
| 角色不一致 | 服装/化妆设定有误 | 服装/化妆 | 否 |
| 场景描述不符 | 剧本描述太模糊 | 编剧 | 是（涉及剧本） |
| 内容匹配度低 | 分镜描述偏差 | 副导演 | 是 |
| 视频卡顿 | 视频生成模型不行 | 视效 | 是（换模型） |
| 对白不自然 | 编剧创作问题 | 编剧 | 是 |
| 时长超限 | 剪辑节奏不对 | 剪辑 | 否 |

### 4.3 用户介入点（关键节点）

1. **剧本生成后**: 用户确认剧本是否进入分镜阶段
2. **角色/场景设计后**: 用户确认角色形象是否符合预期
3. **生图阶段每 8 张**: 监制 Agent 报告，用户可批量确认或选择部分重做
4. **生视频阶段每 4 段**: 监制 Agent 报告，用户确认
5. **终审**: 用户确认成片是否导出

---

## 5. 13 工种 Agent 完整定义

### 5.1 工种总览表

| # | Agent ID | 中文名 | 上场时机 | 主要产物 | 落库表 | 失败打回给 |
|---|----------|--------|----------|----------|--------|------------|
| 1 | `producer` | 制片人 | 项目启动/结束 | 项目元数据/成本 | o_project | - |
| 2 | `director` | 导演 | 全程（调度者） | LLM 决策/任务图 | (事件) | - |
| 3 | `assistant_director` | 副导演 | 剧本通过后 | 分镜表 shots[] | o_storyboard | 编剧 |
| 4 | `supervisor` | 监制 | 每个 Agent 完成后 | 审核评分/驳回决策 | o_review_report | 任何工种 |
| 5 | `script_supervisor` | 场记 | 分镜生成后 | 连续性问题列表 | (事件) | 编剧/副导演 |
| 6 | `screenwriter` | 编剧 | 项目启动 | 标准剧本 | o_script | - |
| 7 | `dp` | 摄影指导 | 分镜/美术完成后 | 镜头图片 | o_assets | 服装/化妆 |
| 8 | `lighting` | 灯光师 | 美术阶段 | 灯光方案 | o_scene_library | 美术 |
| 9 | `costume` | 服装师 | 美术阶段 | 角色服装设定 | o_character_library | 化妆 |
| 10 | `makeup` | 化妆师 | 美术阶段 | 角色妆容设定 | o_character_library | 服装 |
| 11 | `set_decorator` | 置景师 | 美术阶段 | 场景陈设方案 | o_prop_library | - |
| 12 | `sound` | 录音/配音 | 视频生成后 | 配音音频 | o_assets | - |
| 13 | `sound_designer` | 声音设计师 | 视频生成后 | BGM/SFX 方案 | o_assets | 录音 |
| 14 | `editor` | 剪辑师 | 视频生成后 | 时间轴 | o_assets | 视效 |
| 15 | `vfx` | 视效师 | 图片通过后 | 视频片段 | o_assets | DP |

### 5.2 各 Agent 详细契约

#### 5.2.1 制片人 Agent (producer)

- **角色**: 制片人
- **职责**: 项目立项、预算控制、进度汇报、与用户对话
- **上场时机**: 用户启动 Harness 实例 / Harness 完成（汇报）/ 预算超限（告警）
- **输入**: `projectId` (number, user) / `novelText` (string, user) / `budgetLimit` (number, user)
- **输出**: `projectMeta` (object → o_project) / `costReport` (object)
- **失败兜底**: ask_user
- **System Prompt 要点**: 你是制片人。接收用户启动请求, 创建 Harness 实例, 监控整体进度, 在关键节点向用户汇报, 管理预算。

#### 5.2.2 导演 Agent (director)

- **角色**: 导演（调度者）
- **职责**: 接收用户意图, LLM 决策下一步派哪个工种, 监听 task 事件, 决定继续/暂停/驳回/完成
- **上场时机**: 全程
- **输入**: `userMessage` (string, user) / `taskGraph` (object, memory) / `completedTasks` (array, memory) / `novelText` (string, user)
- **输出**: `decision` (object: { action, nextTask, userPrompt, message })
- **失败兜底**: fallback（用 YAML 模板的下一个节点）
- **System Prompt 要点**: 你是导演 Agent, 是整个 Harness 的调度者。决策必须输出结构化 JSON: `{ action: "dispatch"|"wait"|"ask_user"|"reroute"|"complete", nextTask, userPrompt, message }`。决策原则: 剧本通过→派副导演；分镜通过→美术部三工种并行；美术通过→DP 按 shot 并行生图；图片全通过→视效生视频；视频全通过→剪辑+录音并行；涉及剧本/角色的驳回→ask_user；涉及 prompt/workflow 的驳回→自动 reroute。

#### 5.2.3 副导演 Agent (assistant_director)

- **角色**: 副导演 (AD)
- **职责**: 接收剧本, 拆解为分镜表 (ShotItem[])
- **上场时机**: 剧本通过 review-gate 后
- **输入**: `script` (string, upstream:screenwriter) / `visualStyle` (object, upstream:director)
- **输出**: `storyboardPlan` (object → o_storyboard, schema: shots[{id, scene, shotType, angle, movement, duration, description, characters}])
- **失败兜底**: throw
- **依赖**: screenwriter
- **可被打回给**: screenwriter（剧本描述不清时）
- **System Prompt 要点**: 你是副导演。每场戏 2-6 个分镜, 镜头类型多样, 必须参考 VisualStyleSpec。

#### 5.2.4 监制 Agent (supervisor)

- **角色**: 监制
- **职责**: 审核所有工种产出, 决定通过/打回/升级用户
- **上场时机**: 每个 Agent 完成后
- **输入**: `agentId` (string, director) / `agentOutput` (any, upstream) / `reference` (any, memory) / `reviewScore` (object, ReviewPipeline)
- **输出**: `decision` (object: { action: approve|reroute|ask_user, targetAgent, retryInstruction, userInputRequired })
- **失败兜底**: ask_user
- **System Prompt 要点**: 你是监制。决策必须输出 JSON: `{ action, targetAgent, retryInstruction, userPrompt, userOptions }`。决策原则: 技术问题→自动 reroute；艺术问题→reroute 给原工种；内容问题→ask_user（涉及剧本修改）；角色不一致→reroute 给服装/化妆；视频质量差→ask_user（换模型需用户决策）。

#### 5.2.5 场记 Agent (script_supervisor)

- **角色**: 场记 / 剧本监督
- **职责**: 审核剧本/分镜的连续性（时间线/角色动机/道具位置）
- **上场时机**: 分镜生成后, 终审前
- **输入**: `script` (string, upstream:screenwriter) / `storyboardPlan` (object, upstream:assistant_director)
- **输出**: `continuityIssues` (array: [{scene, issue, severity, suggestion}])
- **失败兜底**: 返回空数组
- **System Prompt 要点**: 你是场记。检查时间线一致性、角色动机连贯、道具位置不矛盾、跨场次对白衔接。

#### 5.2.6 编剧 Agent (screenwriter)

- **角色**: 编剧
- **职责**: 接收小说, 输出标准格式剧本
- **上场时机**: 项目启动, 或剧本被监制打回
- **输入**: `novel` (string, user|memory) / `stage` (string, default "generate": analyze|adapt|generate|revise) / `retryInstruction` (object, supervisor)
- **输出**: `script` (string → o_script, format: "场号|场景|人物|对白|动作|时长")
- **失败兜底**: throw
- **依赖**: 无（源头）
- **System Prompt 要点**: 你是编剧。每场戏 30 秒-3 分钟, 保留核心情节和人物弧光, 将内心独白转化为动作/对白, 接收 retryInstruction 时仅重写指定场次。

#### 5.2.7 DP 摄影指导 Agent (dp)

- **角色**: 摄影指导 (DP)
- **职责**: 接收 ShotItem + VisualStyleSpec + 角色库, 生成镜头画面
- **上场时机**: 分镜+美术完成后, 按 shot 并行
- **输入**: `shot` (object, upstream:assistant_director) / `style` (object, upstream:director) / `characterRefs` (array, memory: o_character_library) / `retryInstruction` (object, supervisor)
- **输出**: `images` (array → o_assets type=image + o_storyboard.imageUrl, schema: [{shotId, imageUrl, compositionPrompt, backend, workflowId}])
- **失败兜底**: throw（强制真实生图）
- **依赖**: assistant_director, costume, makeup, lighting
- **可被打回给**: costume（角色不一致）/ makeup（妆容问题）/ screenwriter（内容不符）
- **System Prompt 要点**: 你是 DP。工作流: 根据 shot.shotType 和 style 选择后端（BackendSelector）→ 生成英文构图 prompt → 调用 ai.Image() 或 ComfyUIExecutor.run() → 返回 URL。后端选择原则: 风格化强→ComfyUI; close-up 特写→ComfyUI (IP-Adapter); 标准场景→API; 用户指定 workflow→ComfyUI。禁止 mock, 失败时抛 AgentExecutionError。

#### 5.2.8 灯光师 Agent (lighting)

- **角色**: 灯光师
- **职责**: 分析场景, 输出灯光方案和美术设定
- **上场时机**: 美术阶段（与服装/化妆/置景并行）
- **输入**: `scene` (object, upstream:assistant_director) / `style` (object, upstream:director)
- **输出**: `lightingSpec` (object → o_scene_library) / `artDirectionSpec` (object → o_scene_library)
- **失败兜底**: throw
- **依赖**: assistant_director
- **可被打回给**: set_decorator（场景设定冲突）

#### 5.2.9 服装师 Agent (costume)

- **角色**: 服装师
- **职责**: 设计角色服装, 写入角色库
- **上场时机**: 美术阶段
- **输入**: `character` (object, upstream:screenwriter) / `style` (object, upstream:director)
- **输出**: `costume` (object → o_character_library, schema: {characterName, outfit, hairStyle, accessories, makeup, referenceImage})
- **失败兜底**: throw
- **依赖**: screenwriter
- **可被打回给**: screenwriter（角色描述不清）

#### 5.2.10 化妆师 Agent (makeup)

- **角色**: 化妆师
- **职责**: 设计角色妆容
- **上场时机**: 美术阶段（与服装并行）
- **输入**: `character` (object, upstream:costume) / `style` (object, upstream:director)
- **输出**: `makeup` (object → o_character_library.makeup)
- **失败兜底**: throw
- **依赖**: costume

#### 5.2.11 置景师 Agent (set_decorator)

- **角色**: 置景师
- **职责**: 设计场景陈设
- **上场时机**: 美术阶段
- **输入**: `scene` (object, upstream:assistant_director) / `style` (object, upstream:director)
- **输出**: `setDecor` (object → o_prop_library type=prop)
- **失败兜底**: throw
- **依赖**: assistant_director

#### 5.2.12 录音/配音 Agent (sound)

- **角色**: 录音 / 配音
- **职责**: 调用 TTS 生成对白音频
- **上场时机**: 视频生成后
- **输入**: `script` (string, upstream:screenwriter) / `timeline` (object, upstream:editor)
- **输出**: `audioUrl` (string → o_assets type=audio)
- **失败兜底**: throw
- **依赖**: editor

#### 5.2.13 声音设计师 Agent (sound_designer)

- **角色**: 声音设计师
- **职责**: 分析剧本情绪, 生成 BGM/SFX 方案
- **上场时机**: 视频生成后（与录音并行）
- **输入**: `script` (string, upstream:screenwriter) / `timeline` (object, upstream:editor)
- **输出**: `soundPlan` (object → o_assets type=audio, schema: {bgm[], sfx[], audioTimeline[]})
- **失败兜底**: throw
- **依赖**: editor

#### 5.2.14 剪辑师 Agent (editor)

- **角色**: 剪辑师
- **职责**: 根据分镜和视频素材, 输出时间轴
- **上场时机**: 视频生成后
- **输入**: `shots` (array, upstream:vfx) / `storyboardPlan` (object, upstream:assistant_director)
- **输出**: `editTimeline` (object → o_assets type=timeline, schema: {tracks[], totalDuration, bpm})
- **失败兜底**: throw
- **依赖**: vfx
- **可被打回给**: vfx（视频卡顿）

#### 5.2.15 视效师 Agent (vfx)

- **角色**: 视效师
- **职责**: 接收 EditClip, 调用视频生成 API 或 ComfyUI 视频工作流
- **上场时机**: 图片通过后, 按 clip 并行
- **输入**: `clip` (object, upstream:editor) / `style` (object, upstream:director) / `previousFrame` (string, upstream:dp 首帧图)
- **输出**: `videoUrl` (string → o_assets type=video)
- **失败兜底**: throw
- **依赖**: dp, editor
- **可被打回给**: dp（首帧图问题）

### 5.3 Agent 协作矩阵（打回路径）

```
                ┌─────────────────────────────────┐
                │         监制 Agent               │
                │  (审核所有产出, 决策打回)        │
                └─────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
   ┌─────────┐          ┌─────────┐          ┌─────────┐
   │ 编剧    │ ◄─────── │ 副导演  │ ──────►  │ DP      │
   └─────────┘          └─────────┘          └─────────┘
        │                     │                     │
        ▼                     ▼                     ▼
   ┌─────────┐          ┌─────────┐          ┌─────────┐
   │ 服装    │ ◄─────── │ 化妆    │ ──────►  │ 灯光    │
   └─────────┘          └─────────┘          └─────────┘
        │                     │                     │
        └──────────┬──────────┘                     │
                   ▼                                ▼
              ┌─────────┐                      ┌─────────┐
              │ 置景    │ ◄────────────────── │ 视效    │
              └─────────┘                      └─────────┘
                                                   │
                                                   ▼
                                              ┌─────────┐
                                              │ 剪辑    │
                                              └─────────┘
                                                   │
                                                   ▼
                                              ┌─────────┐
                                              │ 录音    │
                                              └─────────┘
```

---

## 6. ComfyUI 模块完全重写设计

### 6.1 一阶段问题

- `o_comfyui_workflow` 表有数据但前端无法配置参数
- `WorkflowParser.injectParameters` 使用 `widgets_values` 索引注入, 但 ComfyUI API 格式有时是 `inputs` 对象
- 没有 ComfyUI 服务健康检查
- 没有工作流测试功能
- 没有 BackendSelector 智能选择
- 与 Harness 流程完全脱节

### 6.2 新模块结构

```
src/comfyui/
├── ComfyUIServerManager.ts      # 服务管理 (多 server, 健康检查, 负载均衡)
├── WorkflowLibrary.ts           # 工作流 CRUD + 版本管理 + 缩略图
├── ParameterEditor.ts           # 参数提取 + 可视化编辑 + 类型校验
├── WorkflowExecutor.ts          # 提交执行 + WS 进度 + 结果下载
├── BackendSelector.ts           # 根据 shot 类型自动选 API / ComfyUI
├── AssetProcessor.ts            # 下载产物 + 写入 o_assets + 缩略图生成
├── ComfyUIClient.ts             # HTTP/WS 通信 (保留一阶段, 优化)
├── WorkflowParser.ts            # JSON 解析 (重写, 兼容 widgets_values 和 inputs)
└── index.ts                     # 模块入口
```

### 6.3 ComfyUIServerManager

```typescript
class ComfyUIServerManager {
  // 多 server 管理, 健康检查, 负载均衡
  async addServer(config: { name, baseUrl, wsUrl }): Promise<number>;
  async removeServer(id: number): Promise<void>;
  async listServers(): Promise<Server[]>;
  async healthCheck(id: number): Promise<{ healthy: boolean; vram?: number; queue?: number }>;
  async selectServer(strategy?: "round-robin" | "least-load" | "most-vram"): Promise<Server>;
  // 自动重连
  async ensureConnected(id: number): Promise<void>;
}
```

### 6.4 WorkflowLibrary

```typescript
class WorkflowLibrary {
  // 工作流 CRUD + 版本管理
  async importWorkflow(json: string, name: string, type: "image" | "video" | "both"): Promise<number>;
  async listWorkflows(filter?: { type?, createdBy? }): Promise<Workflow[]>;
  async getWorkflow(id: number): Promise<Workflow>;
  async updateWorkflow(id: number, json: string): Promise<number>;  // 创建新版本
  async deleteWorkflow(id: number): Promise<void>;
  async listVersions(id: number): Promise<WorkflowVersion[]>;
  async rollbackToVersion(id: number, versionId: number): Promise<void>;
  
  // 缩略图
  async generateThumbnail(id: number): Promise<string>;
}
```

### 6.5 ParameterEditor（核心：解决参数配置不可用）

```typescript
interface WorkflowParameter {
  id: string;                    // 参数唯一标识
  name: string;                  // 中文名
  nodeId: number;                // ComfyUI 节点 ID
  widgetName: string;            // widget 名称或 inputs key
  type: "string" | "number" | "boolean" | "select" | "image" | "model";
  defaultValue: any;
  options?: string[];            // select 类型的选项
  min?: number; max?: number; step?: number;
  description?: string;
  injectVia: "widgets_values" | "inputs";  // 注入方式 (关键!)
}

class ParameterEditor {
  // 自动提取参数 (兼容两种 API 格式)
  async extractParameters(workflowJson: string): Promise<WorkflowParameter[]>;
  
  // 注入参数 (根据 injectVia 字段决定注入方式)
  async injectParameters(workflowJson: string, params: Record<string, any>): Promise<string>;
  
  // 参数校验
  validateParams(params: Record<string, any>, schema: WorkflowParameter[]): ValidationResult;
  
  // 可视化编辑器数据 (供前端渲染表单)
  toFormSchema(parameters: WorkflowParameter[]): FormSchema;
}
```

### 6.6 WorkflowExecutor

```typescript
class WorkflowExecutor {
  // 提交执行 + WS 进度
  async execute(
    workflowId: number,
    params: Record<string, any>,
    onProgress?: (nodeId: string, progress: number, max: number) => void
  ): Promise<ExecutionResult>;
  
  // 中断
  async interrupt(promptId: string): Promise<void>;
  
  // 查询队列
  async getQueue(): Promise<QueueItem[]>;
}

interface ExecutionResult {
  promptId: string;
  outputs: GeneratedAsset[];   // 生成的图片/视频
  executionTime: number;
  vramUsed: number;
}
```

### 6.7 BackendSelector（API 与 ComfyUI 双后端）

```typescript
class BackendSelector {
  async chooseBackend(
    shot: ShotItem,
    style: VisualStyleSpec,
    userPreference?: "api" | "comfyui" | "auto"
  ): Promise<{
    backend: "api" | "comfyui";
    workflowId?: number;
    apiModel?: string;             // backend=api 时
    reason: string;
  }>;
  
  // 选择逻辑:
  // 1. userPreference 优先
  // 2. 风格化强 (saturation=desaturated) → ComfyUI
  // 3. close-up 特写 → ComfyUI (IP-Adapter)
  // 4. 用户上传了参考图 → ComfyUI (ControlNet)
  // 5. ComfyUI 不可用 → API
  // 6. 默认 → API (速度快)
}
```

### 6.8 与 Harness 集成

DPAgent 调用 ComfyUI 的完整流程：

1. 选择后端: `BackendSelector.chooseBackend(shot, style)` 返回 `{ backend, workflowId, apiModel }`
2. 生成构图 prompt: `generateText("生成英文构图 prompt...")`
3. 调用后端:
   - ComfyUI: `WorkflowExecutor.execute(workflowId, { prompt, characterRef, styleSpec }, onProgress)` → 返回图片路径
   - API: `ai.Image(apiModel).run({ prompt, size: "1K" })` → 返回图片对象 → 保存到 `production/<projectId>/<uuid>.png`
4. 返回 `{ images: [{ shotId, imageUrl, compositionPrompt, backend, workflowId }] }`

### 6.9 ComfyUI 管理前端页面

- `#/comfyui/server` 服务管理（列表/添加/健康检查）
- `#/comfyui/workflow` 工作流库（列表/导入/编辑/删除）
- `#/comfyui/workflow/:id` 工作流详情（参数编辑器/测试/版本历史）

参数编辑器 UI 按节点分组, 每个参数根据类型渲染为：string→文本框, number→数字框/滑块, select→下拉, image→上传按钮, boolean→开关。所有参数标注"注入方式: widgets_values[N] | inputs.<key>"。

---

## 7. 多级审核与历史版本

### 7.1 审核流水线

```
Agent 输出
  ↓
[1. 技术审核] TechnicalReviewer (规则+程序, ~100ms)
  - 分辨率/格式/色彩空间/AI瑕疵检测
  - fail → 自动打回 (附技术建议)
  ↓
[2. 艺术审核] ArtisticReviewer (AI 视觉模型)
  - 构图/风格匹配/光影合理性
  - fail → 监制 Agent 决策
  ↓
[3. 内容审核] ContentReviewer (AI 文本-图像对比)
  - 与剧本/分镜描述的一致性
  - fail → 监制 Agent 决策
  ↓
[4. 监制 Agent] SupervisorAgent (LLM 决策)
  - 综合判断通过/打回/升级用户
  - pass → 进入用户确认环节
  - reroute → 打回给对应工种 (保存历史版本)
  - ask_user → 发出 director.user_input_required
  ↓
[5. 用户确认] UserConfirmGate (关键节点)
  - 弹窗让用户确认
  - 通过 → 进入下一阶段
  - 修改 → 重新派活
```

### 7.2 历史版本保存

新增表 `o_artifact_version`:

```sql
CREATE TABLE o_artifact_version (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artifactType TEXT NOT NULL,       -- "script" | "image" | "video" | "audio"
  artifactKey TEXT NOT NULL,        -- 如 "shot_3" 或 "scene_3"
  projectId INTEGER NOT NULL,
  instanceId TEXT NOT NULL,
  version INTEGER NOT NULL,         -- 版本号 (1, 2, 3...)
  content TEXT,                     -- 文本类产物
  filePath TEXT,                    -- 文件类产物
  reviewScore TEXT,                 -- 审核评分 JSON
  reviewFeedback TEXT,              -- 审核反馈
  source TEXT DEFAULT 'harness',    -- harness | manual
  createdAt INTEGER NOT NULL,
  UNIQUE(artifactType, artifactKey, projectId, version)
);
CREATE INDEX idx_artifact_version_key ON o_artifact_version(artifactType, artifactKey, projectId);
```

### 7.3 版本管理流程

1. 首次生成 → `o_artifact_version` (version=1, content/path)
2. 审核失败 → 保存当前版本到历史, 生成新版本 (version=2, 含 reviewScore/reviewFeedback)
3. 再次失败 → version=3, ...
4. 用户查看 → 列出所有版本, 可对比/回滚。UI 显示版本列表 + 缩略图 + 评分 + 反馈。回滚: 把指定版本设为当前, 后续操作基于该版本。

### 7.4 用户确认窗口设计

弹出窗口包含：
- 监制 Agent 报告标题
- 生成产物缩略图（图片/视频/剧本预览）
- 评分详情（技术/艺术/内容三维度, 各项分数 + 通过/警告标识）
- 历史版本列表（版本号 + 评分 + 通过/失败状态）
- 操作按钮: [✓ 通过, 进入下一张] [✗ 打回重做] [查看大图] [对比版本] [手动修改 prompt]

---

## 8. 业务集成方案

### 8.1 Harness 与业务表对照

| Harness 阶段 | 业务表 | 业务前端页面 | 集成方式 |
|--------------|--------|--------------|----------|
| 编剧 | `o_script` | `#/script` | CallbackBridge 写入 |
| 副导演 | `o_storyboard` | `#/storyboard` | CallbackBridge 写入 |
| 服装/化妆 | `o_character_library` | `#/assets` (角色 tab) | CallbackBridge 写入 |
| 置景 | `o_prop_library` | `#/assets` (道具 tab) | CallbackBridge 写入 |
| 灯光 | `o_scene_library` | `#/assets` (场景 tab) | CallbackBridge 写入 |
| DP 生图 | `o_assets` (type=image) + `o_storyboard.imageUrl` | `#/cornerScape` | CallbackBridge 写入 |
| 视效生视频 | `o_assets` (type=video) | `#/workbench` | CallbackBridge 写入 |
| 录音 | `o_assets` (type=audio) | `#/workbench` | CallbackBridge 写入 |
| 剪辑 | `o_assets` (type=timeline) | `#/workbench` | CallbackBridge 写入 |

### 8.2 双向同步

Harness 主控台（左侧对话 + 右侧步骤）与业务页面（#/script, #/cornerScape 等）共享业务表。CallbackBridge 写入后, HarnessEventBus 发出事件, SSE 推送到所有打开的页面, 业务页面也监听 harness 事件实时刷新。

### 8.3 source 字段区分来源

所有业务表新增 `source` 字段: `source = "harness"` (Harness 生成) / `source = "manual"` (用户手工) / `source = "agent"` (单独 Agent)。业务页面默认显示全部, 可过滤查看特定来源。

---

## 9. 代码清理清单

### 9.1 需要删除的文件（一阶段未提交）

| 文件 | 原因 |
|------|------|
| `src/core/harness/NovelImportService.ts` | 逻辑合并到 DirectorOrchestrator |
| `src/core/harness/ReviewLearner.ts` | 逻辑合并到 SupervisorAgent |
| `src/core/harness/migration.ts` | 迁移逻辑合并到 init.ts |
| `src/routes/harness/startFromNovel.ts` | 端点合并到 `/api/harness/control/start` |
| `src/routes/review/` (整个目录) | 重写为 `/api/harness/control/:id/review/*` |
| `src/routes/style/` (整个目录) | 风格管理合并到导演 Agent |

### 9.2 需要还原（git checkout）的文件

以下文件被一阶段修改但需要还原到 master 版本, 然后重新设计:

| 文件 | 原因 |
|------|------|
| `src/agents/director/DirectorAgent.ts` | 重写为 DirectorOrchestrator |
| `src/agents/dp/DPAgent.ts` | 删除 mock, 接入 BackendSelector |
| `src/agents/screenwriter/ScreenwriterAgent.ts` | 重写为工种 |
| `src/agents/sound/SoundAgent.ts` | 删除 default |
| `src/core/harness/MemoryBus.ts` | 保留框架, 微调 |
| `src/core/harness/WorkflowRunner.ts` | 收缩为执行容器 |
| `src/core/harness/index.ts` | 更新导出 |
| `src/core/harness/init.ts` | 简化, 移除 seedComfyUITemplates |
| `src/core/harness/types.ts` | 增加 TaskNode/HarnessEvent/AgentContract |
| `src/lib/fixDB.ts` | 增加 o_artifact_version 表 |
| `src/review/ReviewPipeline.ts` | 增加 UserConfirmGate |
| `src/router.ts` | 更新路由 |
| `src/routes/harness/index.ts` | 重写 |
| `src/types/database.d.ts` | 增加新表类型 |
| `src/utils/ai.ts` | 保留, 微调 |

### 9.3 需要保留的文件（一阶段可用）

| 文件 | 状态 |
|------|------|
| `src/core/harness/AgentRegistry.ts` | 保留, 微调 |
| `src/core/harness/RulesEngine.ts` | 保留 |
| `src/core/harness/SkillsRegistry.ts` | 保留 |
| `src/core/harness/MCPConnector.ts` | 保留 |
| `src/core/harness/ScriptExecutor.ts` | 保留 |
| `src/comfyui/ComfyUIClient.ts` | 保留, 优化 |
| `src/review/ArtisticReviewer.ts` | 保留 |
| `src/review/ContentReviewer.ts` | 保留 |
| `src/review/TechnicalReviewer.ts` | 保留 |
| `data/rules/*.md` (8 个) | 保留, 扩展为 13 个 |
| `data/skills/**` | 保留 |
| `data/workflows/*.yaml` (3 个) | 保留为可选模板 |
| `data/scripts/final-render.js` | 保留 |

### 9.4 清理操作命令

```bash
# 删除未提交文件
git clean -fd src/core/harness/NovelImportService.ts
git clean -fd src/core/harness/ReviewLearner.ts
git clean -fd src/core/harness/migration.ts
git clean -fd src/routes/harness/startFromNovel.ts
git clean -fd src/routes/review/
git clean -fd src/routes/style/

# 还原已修改文件到 master 版本
git checkout -- src/agents/director/DirectorAgent.ts
git checkout -- src/agents/dp/DPAgent.ts
git checkout -- src/agents/screenwriter/ScreenwriterAgent.ts
git checkout -- src/agents/sound/SoundAgent.ts
git checkout -- src/core/harness/MemoryBus.ts
git checkout -- src/core/harness/WorkflowRunner.ts
git checkout -- src/core/harness/index.ts
git checkout -- src/core/harness/init.ts
git checkout -- src/core/harness/types.ts
git checkout -- src/lib/fixDB.ts
git checkout -- src/review/ReviewPipeline.ts
git checkout -- src/router.ts
git checkout -- src/routes/harness/index.ts
git checkout -- src/types/database.d.ts
git checkout -- src/utils/ai.ts
```

---

## 10. 主控台 UI 升级

### 10.1 多场景支持

原型 HTML 支持以下场景切换:

1. **场景 1: 启动** - 用户输入小说, 制片人 Agent 创建实例
2. **场景 2: 剧本生成** - 编剧 Agent 工作, 用户确认
3. **场景 3: 分镜生成** - 副导演 Agent 工作
4. **场景 4: 美术部** - 服装/化妆/置景并行
5. **场景 5: 生图** - DP 生图, 监制审核, 驳回弹窗
6. **场景 6: 生视频** - 视效 Agent 工作
7. **场景 7: 终审** - 监制综合审核, 用户确认成片
8. **场景 8: ComfyUI 配置** - 工作流参数编辑器
9. **场景 9: 版本历史** - 多版本对比与回滚

### 10.2 用户确认弹窗

每个关键节点都会弹出确认窗口, 包含:
- 监制 Agent 报告标题
- 生成产物预览
- 评分详情
- 操作按钮（通过/打回/查看大图/对比版本）

### 10.3 流程导览

原型新增"流程导览"模式, 用动画展示完整流转: [小说] → [剧本] → [分镜] → [美术] → [生图] → [生视频] → [后期] → [成片], 每个节点显示状态（✓ 已完成 / 🔄 进行中 / ○ 等待）。

---

## 11. 风险与权衡

- **[R1 高] LLM 调用耗时导致 UI 卡顿** → 每个 task 在派发时立即显示"加载占位", 通过 SSE 推送 progress 事件; 导演 Agent 的决策用便宜的"调度专用 LLM"（如 gpt-4o-mini）降低延迟
- **[R2 高] 真实生图/视频可能失败（API 限流、模型缺失）** → 失败时监制 Agent 自动 retry 一次（换模型）, 仍失败则 director.user_input_required 让用户选"换模型/换 workflow/降级到 720p"
- **[R3 中] 7 个步骤执行子组件复用现有页面代码** → 抽离 `src/components/{script,storyboard,cornerScape,workbench}/` 为共享组件, 主控台和业务页面都用同一组件
- **[R4 中] 13 工种的 system prompt 编写工作量大** → 模板化（每个工种的 system prompt 由"角色定义 + 输入数据 schema + 输出 schema + ReviewCriteria 引用"4 段拼装）, LLM 生成草稿后人工调整
- **[R5 中] SSE 在 Express 上需要 keep-alive 心跳** → 每 15s 发送 `:heartbeat` comment, Express 不缓存响应
- **[R6 低] Harness 产物与手工操作产物的数据冲突** → CallbackBridge 写入时检查 `source="harness"` 字段, 手工操作的产物 `source=null`, UI 标识来源
- **[R7 低] 导演 Agent 的 LLM 决策不稳定** → 用结构化输出（JSON Schema）约束决策结果, 决策失败时降级为"YAML 模板的下一个节点"
- **[R8 低] 代码清理误删可用逻辑** → 严格按第 9 节清单操作, 清理后跑一次完整流程验证

---

## 12. 迁移计划

### 阶段 0（本轮）— 仅设计文档

- 产出 proposal.md / design.md / specs/*.md / tasks.md
- **不写任何代码**

### 阶段 1（确认后）— 代码清理 + 基础设施

1. 按第 9 节清理一阶段未提交代码
2. 新增 `HarnessEventBus` + SSE 端点
3. 新增 `CallbackBridge` + 业务表回写
4. 新增 `TaskGraph` 数据结构
5. 新增 `o_artifact_version` 表
6. 删除所有 mock / fallback 分支
7. DirectorOrchestrator 骨架

### 阶段 2 — 13 工种

1. 新增 8 个 Agent 类（producer/supervisor/assistant_director/script_supervisor/makeup/wardrobe/set_decorator/sound_designer）
2. 现有 8 个 Agent 类重写为真实业务逻辑
3. 各 Agent 专属 system prompt + ReviewCriteria 文件
4. AgentRegistry 注册全部 15 个 Agent

### 阶段 3 — ComfyUI 模块重写

1. ComfyUIServerManager / WorkflowLibrary / ParameterEditor / WorkflowExecutor / BackendSelector / AssetProcessor
2. 前端 ComfyUI 管理页面
3. 与 DPAgent / VFXAgent 集成

### 阶段 4 — 主控台 UI

1. HarnessControlRoom.vue + 7 个步骤子组件
2. 用户确认弹窗
3. 多版本对比 UI

### 阶段 5 — 跨工种驳回

1. SupervisorAgent + Reroute 协议
2. director.user_input_required 事件 + 用户选项
3. 版本回滚

### 阶段 6 — DirectorOrchestrator LLM Planner

1. DirectorLLMPlanner 完整实现
2. 端到端验证

### 回滚策略

- 旧 Dashboard (`#/harness`) 保留为只读历史
- 一阶段 6 个业务页面保留所有手动功能
- Harness 主控台 (`#/harness/control`) 是新增, 不影响旧路径

---

## 13. 开放问题

1. **OQ1**: 导演 Agent 的 LLM 决策是否使用单独的"调度专用模型"（如 gpt-4o-mini）以降低成本？或与生成共用？建议先用 gpt-4o-mini
2. **OQ2**: `wardrobe` 和 `costume` 真的需要拆成两个吗？还是合并？电影工业是两个部门, 但 Harness 中可能过度拆分
3. **OQ3**: 主控台是否需要"回放模式"（用户事后查看某次 Harness 跑的全过程）？建议后续 P3
4. **OQ4**: 跨工种驳回时, 导演 Agent 是否能自动决定"换 ComfyUI workflow"？还是必须用户确认？建议涉及成本/时间时用户确认
5. **OQ5**: Harness 实例的"暂停/恢复"在主控台如何呈现？建议: 顶部右上角"暂停"按钮 + 导演 Agent 主动询问"是否暂停？"
6. **OQ6**: 13 工种 vs 8 工种: 用户期望"导演/副导演/编剧/化妆/灯光等等"是核心, 工种过细会增加 system prompt 维护成本。建议先实现 10 个核心工种, 其他 3 个作为"升级选项"在 P2 阶段补齐

---

## 附录 A — 关键文件结构

```
src/
├── agents/
│   ├── FilmAgent.ts                    # 扩展 emitProgress/requestInput/requestReroute
│   ├── director/
│   │   ├── DirectorAgent.ts            # 重写: 升级为 DirectorOrchestrator
│   │   ├── DirectorOrchestrator.ts     # 新增
│   │   ├── ProducerAgent.ts            # 新增
│   │   ├── SupervisorAgent.ts          # 新增
│   │   ├── AssistantDirectorAgent.ts   # 新增
│   │   ├── ScriptSupervisorAgent.ts    # 新增
│   │   ├── MakeupAgent.ts              # 新增
│   │   ├── WardrobeAgent.ts            # 新增
│   │   ├── SetDecoratorAgent.ts        # 新增
│   │   └── SoundDesignerAgent.ts       # 新增
│   ├── dp/DPAgent.ts                   # 删除 mock
│   ├── lighting/LightingAgent.ts       # 删除 default
│   ├── costume/CostumeAgent.ts         # 完善 referenceImage
│   ├── sound/SoundAgent.ts             # 删除 defaultSoundPlan
│   ├── editor/EditorAgent.ts           # 重写
│   ├── vfx/VFXAgent.ts                 # 重写: 与视频生成合并
│   └── screenwriter/ScreenwriterAgent.ts # 重写: 与 o_script 强绑定
├── core/harness/
│   ├── DirectorOrchestrator.ts         # 新增
│   ├── TaskGraph.ts                    # 新增
│   ├── HarnessEventBus.ts              # 新增
│   ├── CallbackBridge.ts               # 新增
│   ├── DirectorLLMPlanner.ts           # 新增
│   ├── Hooks.ts                        # 新增 (beforeTask/afterTask/onReview/onReroute/onUserConfirm)
│   ├── WorkflowRunner.ts               # 保留: 收缩为执行容器
│   ├── AgentRegistry.ts                # 保留: 增加 13 工种注册
│   ├── RulesEngine.ts                  # 保留
│   ├── SkillsRegistry.ts               # 保留
│   ├── MemoryBus.ts                    # 保留
│   ├── MCPConnector.ts                 # 保留
│   ├── ScriptExecutor.ts               # 保留
│   ├── init.ts                         # 增加 DirectorOrchestrator 启动
│   └── types.ts                        # 增加 TaskNode / HarnessEvent / AgentContract 类型
├── comfyui/
│   ├── ComfyUIServerManager.ts         # 新增
│   ├── WorkflowLibrary.ts              # 新增
│   ├── ParameterEditor.ts              # 新增
│   ├── WorkflowExecutor.ts             # 新增
│   ├── BackendSelector.ts              # 新增
│   ├── AssetProcessor.ts               # 新增
│   ├── ComfyUIClient.ts                # 保留, 优化
│   ├── WorkflowParser.ts               # 重写
│   └── index.ts                        # 模块入口
├── review/
│   ├── ReviewPipeline.ts               # 保留: 增加 UserConfirmGate
│   ├── ArtisticReviewer.ts             # 保留
│   ├── ContentReviewer.ts              # 保留
│   ├── TechnicalReviewer.ts            # 保留
│   └── UserConfirmGate.ts              # 新增
└── routes/harness/
    ├── index.ts                        # 扩展
    ├── director.ts                     # 新增: 导演对话
    ├── events.ts                       # 新增: SSE
    ├── artifacts.ts                    # 新增: 产物查询
    ├── reroute.ts                      # 新增: 跨工种驳回
    └── versions.ts                     # 新增: 版本管理

data/
├── rules/                              # 扩展为 13 工种 (新增 5 个 *.md)
├── workflows/                          # 保留为可选模板
├── skills/                             # 扩展 (按工种分类)
└── scripts/                            # 保留

src/views/                              # 前端 (Toonflow-web 仓库)
├── HarnessControlRoom.vue              # 新增
└── HarnessControlRoom/
    ├── StageScriptEditor.vue
    ├── StageArtDepartmentLibrary.vue
    ├── StageStoryboard.vue
    ├── StageShotImageGrid.vue
    ├── StageVideoGrid.vue
    ├── StageReviewReport.vue
    ├── StageVersionHistory.vue         # 新增: 版本对比
    └── UserConfirmDialog.vue           # 新增: 用户确认弹窗
```

---

## 附录 B — 关键 API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/harness/control/start` | POST | 启动 Harness 主控台实例 |
| `/api/harness/control/:id/message` | POST | 用户在对话中发送消息 |
| `/api/harness/control/:id/messages` | GET | 拉取对话历史 |
| `/api/harness/control/:id/status` | GET | 当前任务图状态 |
| `/api/harness/control/:id/task-graph` | GET | 动态任务图 |
| `/api/harness/control/:id/artifacts` | GET | 当前所有产物 |
| `/api/harness/control/:id/user-input` | POST | 用户对 user_input_required 的回复 |
| `/api/harness/control/:id/pause` | POST | 暂停 Harness |
| `/api/harness/control/:id/resume` | POST | 恢复 Harness |
| `/api/harness/control/:id/cancel` | POST | 取消 Harness |
| `/api/harness/control/:id/versions/:type/:key` | GET | 查询产物历史版本 |
| `/api/harness/control/:id/versions/:type/:key/rollback` | POST | 回滚到指定版本 |
| `/api/harness/events/stream` | GET (SSE) | 订阅 Harness 事件流 |
| `/api/harness/reroute` | POST | 跨工种驳回（导演 Agent 调用） |
| `/api/comfyui/server` | GET/POST/DELETE | ComfyUI 服务管理 |
| `/api/comfyui/server/:id/health` | GET | 服务健康检查 |
| `/api/comfyui/workflow` | GET/POST | 工作流列表/导入 |
| `/api/comfyui/workflow/:id` | GET/PUT/DELETE | 工作流详情/更新/删除 |
| `/api/comfyui/workflow/:id/params` | GET | 工作流参数 schema |
| `/api/comfyui/workflow/:id/test` | POST | 测试运行工作流 |
| `/api/comfyui/workflow/:id/versions` | GET | 工作流版本历史 |
| `/api/comfyui/workflow/:id/rollback` | POST | 回滚工作流版本 |

---

> 文档结束。所有细节等待用户二次确认后开始实施。
