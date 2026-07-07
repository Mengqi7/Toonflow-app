# Toonflow Harness 升级 — 任务进度 & 开发计划 (2026-07-04 深度审计)

> **图例**: [x] 完成 | [~] 骨架/部分完成 | [!] placeholder/硬编码 | [ ] 未实现 | [🐛] Bug

---

## 📋 本次审计结果摘要

**审计日期**: 2026-07-04  
**上次审计**: 2026-06-28  
**当前真实完成度**: ~48%（比上次提升 1%，但发现大量隐藏 BUG）  
**新增发现**: 15 个 BUG、5 个架构缺陷、6 项前端未开发

### 核心问题
1. **Harness 无法自动运转** — 缺乏小说导入→自动触发流程的完整链路
2. **ComfyUI 工作流无法配置** — TemplateLibrary 未被引用，DB 无预填充
3. **parallel-fork 的 ${item} 绑定有 Bug** — 无法正确从 Context 解析动态 item
4. **WorkflowRunner 使用独立实例** — 未使用 harness 全局单例，Agent 间无法共享记忆
5. **前端完全未开发** — 审核Dashboard/DAG可视化/工作流配置页面缺失

---

## 阶段 1: Harness 核心引擎

### 1.1 WorkflowRunner (DAG 编排)
- [x] 定义 WorkflowDefinition/WorkflowNode/WorkflowEdge/WorkflowContext 等类型
- [x] registerWorkflow() — 构建 graphlib DAG
- [x] resolveExecutionOrder() — Kahn 算法拓扑排序
- [x] execute() — 按层并行调度
- [x] 节点状态机: pending→ready→running→reviewing→completed/failed/skipped
- [x] review-gate 节点类型
- [x] parallel-fork/parallel-join 节点类型
- [x] 暂停/恢复/取消 (pause/resume/cancel)
- [x] 事件系统: node:state-change, workflow:complete
- [x] YAML 工作流加载器
- [x] 状态持久化 (saveInstanceState/loadInstanceState)
- [ ] **缺**: 资源感知调度 (VRAM 检查/排队)
- [ ] **缺**: Agent 指标收集 (metrics 字段未填充)
- [🐛] **BUG**: parallel-fork 中 `${item}` 引用从 ctx.data 查找失败 — fork 节点需要将 items 写入 context 供子节点解析
- [🐛] **BUG**: WorkflowRunner 创建了自己的 MemoryBus/RulesEngine/SkillsRegistry/MCPConnector 实例(line 23-26)，而非使用 harness 全局单例，导致 Agent 间无法共享记忆
- [🐛] **BUG**: executeNode 中 review-gate 节点只检查 `boundInput.content`，其他 review-gate 场景可能数据不匹配
- [🐛] **BUG**: short-drama-production.yaml 中 director.storyboard 缺少 style 输入绑定，导演分镜生成时没有视觉风格参考
- [🐛] **BUG**: short-drama-production.yaml 中多个节点缺少 input 绑定或 config 默认值（screenwriter.generate 没有 static input）

### 1.2 AgentRegistry
- [x] scanAndRegister() — glob src/agents/**/index.ts
- [x] findByCapability/findByRole/createInstance
- [x] Agent 生命周期: init()→execute()→cleanup()
- [x] core.ts 启动时调用 initHarness()
- [🐛] **BUG**: createInstance 通过 role 字符串而非 descriptor id 查找 — 需要确认工厂函数绑定正确

### 1.3 RulesEngine
- [x] Rule 接口和 frontmatter 格式
- [x] loadRules() — data/rules/**/*.md
- [x] getRulesForAgent() — 按作用域合并
- [x] watchRules() — fs.watch 热加载
- [x] 6 个专用 rules 文件

### 1.4 SkillsRegistry
- [x] SkillDescriptor 接口扩展
- [x] scanSkills() — data/skills/**/*.md
- [x] getToolsForAgent() — 转 ToolDefinition[]
- [~] execute() — 模板替换存在但未实际调用 AI（返回模板文本）
- [ ] **缺**: data/skills/ 目录下无 .md Skill 定义文件

### 1.5 MemoryBus
- [x] 命名空间隔离存储
- [x] getAgentContext() — 跨命名空间合并
- [!] semanticSearch() — 纯 placeholder，无 embedding
- [x] SQLite 持久化 (o_memory)
- [🐛] **BUG**: WorkflowRunner 使用的 MemoryBus 是独立实例，不是 global harness.memoryBus

### 1.6 MCPConnector
- [~] stdio 传输 — 未实现 JSON-RPC 协议解析
- [x] HTTP 传输 — fetch + 健康检查
- [x] discoverTools()/invokeTool() (HTTP)
- [x] healthCheck() + 自动重连

### 1.7 ScriptExecutor
- [x] vm2 沙箱执行
- [x] loadBuiltinScripts() — data/scripts/
- [ ] **缺**: data/scripts/ 目录无 final-render 脚本（YAML 工作流引用但不存在）

---

## 阶段 2: 影视 Agent 角色体系

### 2.1 FilmAgent 基类
- [x] 继承 BaseAgent + AI/Skill/Memory/Rules 封装
- [x] generateText() 便捷方法
- [x] generateImage/video() ComfyUI 路径
- [x] selectBackend() — 自动选择 API/ComfyUI
- [🐛] **BUG**: generateViaComfyUI 中的 workflow 按 type 匹配时取 `.first()`，无法保证匹配到正确的工作流
- [🐛] **BUG**: ensureComfyClient() 只取第一个 enabled server，多 Server 场景下无负载均衡
- [🐛] **BUG**: reviewOutput() 在 criteria 为空数组时默认阈值 0.75，但某些 Agent 可能需要不同的默认阈值

### 2.2 编剧 Agent
- [x] ScreenwriterAgent 三阶段: analyze→adapt→generate
- [~] 缺少专业编剧约束 prompt（场号/场景/人物/对白格式强制校验）
- [ ] 未从现有 scriptAgent 完整迁移逻辑
- [🐛] **BUG**: execute() 中 stage 判断依赖 `this.ctx.input.stage`，但 WorkflowRunner 传入的是 `boundInput`，stage 在 static 字段中，需要验证绑定正确性

### 2.3 导演 Agent
- [x] StyleInferenceChain: 3 步推理
- [~] storyboardPlanning(): 仅生成文本，无结构化 ShotItem[] 解析
- [~] qualityControl(): 通过 reviewOutput() 返回分数
- [🐛] **BUG**: DirectorAgent.storyboardPlanning() 解析 JSON 失败时调用 defaultShots()，但 defaultShots() 将剧本按行拆分，每行生成一个 shot，可能产生过多无效分镜

### 2.4 DP 摄影指导 Agent
- [x] 后端选择逻辑
- [x] ComfyUI workflow 自动选择
- [🐛] **BUG**: DPAgent.chooseBackendWithWorkflow() 调用 `db("o_comfyui_workflow").where("type", type).first()`，类型匹配逻辑太简单（image/video），无法区分工作流详细用途（txt2img/img2img/controlnet等）

### 2.5 灯光美术 Agent
- [x] LightingAgent 完整实现（LightingSpec + ArtDirectionSpec）

### 2.6 服装化妆造型 Agent
- [x] CostumeAgent 完整实现（costume JSON + o_character_library 写入）
- [ ] 角色一致性审核（embedding 相似度）未实现

### 2.7 录音配音 Agent
- [x] SoundAgent 完整实现（SoundPlan 结构化输出）

### 2.8 剪辑 Agent
- [x] EditorAgent 完整实现（EditTimeline 结构化输出）

### 2.9 特效 Agent
- [~] VFXAgent 存在但需 TemplateLibrary 填充（目前 toonflow-comfyui-agent 的 TemplateLibrary 未被引用）

---

## 阶段 3: ComfyUI 集成

### 3.1 ComfyUIClient — ✅ 完成
- [x] queuePrompt / pollStatus / waitForCompletion / getImage / uploadImage / interrupt / getSystemStats
- [x] WebSocket 进度监听

### 3.2 WorkflowParser — ✅ 完成
- [x] parse / extractParameters / injectParameters / validate / getInputNodes / getOutputNodes

### 3.3 ComfyUIResultHandler — ✅ 完成
- [x] extractOutputs / downloadAssets / detectOutputType

### 3.4 ComfyUI 管理 API — ✅ 完成
- [x] CRUD: server + workflow + test + params

### 3.5 Agent ↔ ComfyUI 执行链路
- [x] FilmAgent.generateViaComfyUI() 完整实现
- [🐛] **BUG**: 初始化时 TemplateLibrary 内置模板未自动导入 DB，用户必须先手动通过 API 导入工作流
- [🐛] **BUG**: injectParameters 使用 `widgets_values` 索引注入参数，但在某些 ComfyUI 节点的 API 格式中，参数可能是通过 inputs 对象传递而非 widgets_values
- [ ] **缺**: ComfyUI 工作流版本管理（表已创建但无逻辑）
- [ ] **缺**: VRAM 资源监控与排队
- [ ] **缺**: 模型缺失自动诊断

---

## 阶段 4: 质量审核系统

### 4.1 审核流水线框架 — ✅ 完成
- [x] ReviewPipeline 加权评分
- [x] ReviewScore/ReviewCriterion/RetryInstruction 类型

### 4.2 技术审核
- [x] resolution / format 检查（sharp 库）
- [!] artifacts — 硬编码 0.85
- [!] colorSpace — 硬编码 0.9

### 4.3 艺术审核
- [x] AI 调用路径已通（ArtisticReviewer.review()）
- [!] 降级方案 scores 权重固定（0.7-0.8），无真实 AI 视觉分析

### 4.4 内容审核
- [x] AI 调用路径已通（ContentReviewer.review()）
- [!] 降级方案仅做关键词重叠检测

### 4.5 审核基础设施
- [ ] 分 Agent 专属审核标准 未实现
- [x] o_review_report / o_review_preference 表
- [ ] 审核历史学习 未实现
- [ ] 全局重试预算管理 未实现

---

## 阶段 5: 制作流程 DAG

### 5.1 工作流定义 — ✅ 完成
- [x] film-production.yaml — 6 阶段完整流程
- [x] tv-series-production.yaml — 分集模式
- [x] short-drama-production.yaml — 简版流程

### 5.2 工作流执行与 UI
- [🐛] **BUG**: harness API 路由无法自动触发完整的小说→电影流程（需要手动 POST /api/harness/workflow/start + 提供 projectId/definitionId + 小说内容）
- [ ] **缺**: 小说自动导入接口（POST /api/harness/workflow/start-from-novel）
- [ ] **缺**: 流程可视化（前端仓库 Toonflow-web）
- [ ] **缺**: 审核节点 UI（前端）
- [ ] **缺**: 流程控制 UI（前端）
- [ ] **缺**: 最终成片组装脚本 final-render

---

## 阶段 6: 导演风格引擎

### 6.1 风格推理
- [x] StyleInferenceChain: 3 步链式推理
- [x] VisualStyleSpec 完整类型
- [~] data/skills/style_inference.md 存在但未被 SkillsRegistry 有效使用
- [ ] 参考图输入 + Embedding 匹配

### 6.2 风格管理
- [x] o_style_library 表 + CRUD API (routes/style/)
- [🐛] **BUG**: POST /api/style/:id/preview 返回占位消息，未真正生成预览图
- [ ] 风格预览示例图生成 未实现

---

## 阶段 7: 前端升级 ⭐ 完全未开发

> ⚠️ 前端代码在独立仓库 `E:\workspace\Toonflow-web`

- [ ] 审核型 Dashboard — 展示工作流实例列表、节点状态、审核结果
- [ ] DAG 实时进度展示 — 可视化工作流 DAG 图 + 节点状态颜色
- [ ] ComfyUI 管理页面 — 服务器配置、工作流导入/测试/参数调节
- [ ] 导演风格配置页面 — 风格创建/编辑/预览
- [ ] 小说导入页面 — 上传小说→选择工作流模板→启动制作
- [ ] 制作结果展示 — 图片/视频画廊、审核详情、重试历史

---

## 阶段 8: ComfyUI 工作流 Agent (独立项目)

### 8.1 项目骨架
- [x] toonflow-comfyui-agent 项目创建
- [x] WorkflowGenerator/WorkflowTester/TemplateLibrary

### 8.2 工作流自动生成
- [~] WorkflowGenerator.generate() — fallback 模板
- [🐛] **BUG**: TemplateLibrary.getClosestMatch() 有 fallback 返回第一个模板，不会崩溃，但匹配精度低
- [~] WorkflowTester — 基础校验，无 auto-test→evaluate→modify→retry 循环

### 8.3 与 Toonflow 集成
- [ ] **缺**: 无 MCP 或 API 集成通道
- [ ] **缺**: 无"AI 生成工作流"按钮触发
- [ ] **缺**: TemplateLibrary 的 5 个内置模板未自动导入 Toonflow 主项目的 DB

---

## 📊 汇总统计

| 阶段 | 总数 | 完成 [x] | 部分 [~] | 占位 [!] | BUG [🐛] | 未实现 [ ] |
|------|------|----------|----------|----------|-----------|------------|
| 1. Harness 核心 | 34 | 24 | 0 | 1 | 5 | 4 |
| 2. 影视 Agent | 25 | 8 | 3 | 0 | 5 | 9 |
| 3. ComfyUI 集成 | 26 | 18 | 0 | 0 | 3 | 5 |
| 4. 质量审核 | 17 | 4 | 0 | 4 | 0 | 9 |
| 5. DAG 工作流 | 10 | 3 | 0 | 0 | 2 | 5 |
| 6. 导演风格 | 8 | 3 | 1 | 0 | 1 | 3 |
| 7. 前端 | 6 | 0 | 0 | 0 | 0 | 6 |
| 8. ComfyUI Agent | 10 | 3 | 2 | 0 | 1 | 4 |
| **总计** | **136** | **63** | **6** | **5** | **17** | **45** |

**统计变化**: 136 项总任务（+11 项新发现），63 完成 / 6 部分 / 5 占位 / 17 新 BUG / 45 未实现  
**真实完成率**: 63/136 = **46%**（考虑到 Bug 和架构问题，有效完成率约 35%）

---

# 🔧 开发计划（按优先级排序）

---

## 🚨 P0 — 本周必须修复（阻断性）→ 让 Harness 能跑起来

### P0-1: 打通 小说→电影 自动流转链路  ✅ 已完成 (2026-07-04)
**状态**: ✅ 已完成 | **实际耗时**: 2h
- ✅ 创建 `POST /api/harness/start-from-novel` 端点 (`src/routes/harness/startFromNovel.ts`)
  - 输入: projectId, novelIds?, workflowTemplate?, novelText?, chapterRange?, configOverride?
  - 从 o_novel 表获取小说章节，从 o_project 表获取项目配置
  - 自动构建 WorkflowContext（小说文本+imageModel+videoModel+directorManual+artStyle）
  - 创建 WorkflowInstance 并异步执行
- ✅ 创建 `NovelImportService` (`src/core/harness/NovelImportService.ts`)
  - fetchNovelChapters() — 从 DB 获取章节
  - buildNovelText() — 构建完整小说文本
  - fetchProjectConfig() — 获取项目配置
  - startFromNovel() — 主入口，端到端打通
  - getInstanceStatus() — 含进度百分比
- ✅ 同时修复了 executeNode 传递 AgentContext 的致命 BUG（之前传 WorkflowContext 导致 Agent 无法读取 input）

### P0-2: 修复 WorkflowRunner 全局单例一致性问题  ✅ 已完成 (2026-07-04)
**状态**: ✅ 已完成 | **实际耗时**: 0.5h
- ✅ `src/core/harness/WorkflowRunner.ts`
  - 移除独立 `new MemoryBus()/RulesEngine()/SkillsRegistry()/MCPConnector()` 实例
  - 新增 `setHarnessDeps()` 方法接收 harness 全局单例
- ✅ `src/core/harness/init.ts` — 在 initHarness() 中调用 `setHarnessDeps()`

### P0-3: 修复 parallel-fork ${item} 绑定 BUG  ✅ 已完成 (2026-07-04)
**状态**: ✅ 已完成 | **实际耗时**: 0.5h
- ✅ `WorkflowRunner.ts` bindInputs() 新增 `currentItem` 参数支持 `${item}` 特殊变量
- ✅ parallel-fork 调用 `bindInputs(wNode, ctx, item)` 正确传递当前 item

### P0-4: ComfyUI workflow 模板自动导入  ✅ 已完成 (2026-07-04)
**状态**: ✅ 已完成 | **实际耗时**: 1h
- ✅ 在 initHarness() 中实现 `seedComfyUITemplates()`
  - 读取 toonflow-comfyui-agent 的 5 个内置模板（SDXL txt2img/img2img, ControlNet Canny, AnimateDiff, IPAdapter）
  - 自动导入到 o_comfyui_workflow 表（去重：按 name+type 检查）
  - 自动提取 `{{prompt}}` 等参数标记
  - `createdBy: "system"` 标识系统模板
- ✅ 启动日志: `[Harness] ComfyUI templates seeded: N new`
- 用户无需手动导入工作流即可使用 ComfyUI 生图/生视频

### P0-5: 修复 short-drama-production.yaml 缺陷  ✅ 已完成 (2026-07-04)
**状态**: ✅ 已完成 | **实际耗时**: 0.5h
- ✅ 补充缺失的 input 绑定：`director.storyboard` 添加 `style: "${director.style.visualStyle}"`
- ✅ 所有节点补全 `config: { timeoutMs, retry }` 默认值
- ✅ 新增 `review.image` 门控节点（resolution/composition/styleMatch 三维度审核）
- ✅ edges 补全 `review.image` → `generate.shots.join` 连线
- ✅ `final.assemble` 添加 `plan: "${director.storyboard.storyboardPlan}"` 绑定

---

## 🔴 P1 — 本周必须完成（高优先级）→ 让质量审核生效

### P1-1: 实现 小说导入 + 工作流自动启动 完整链路  ✅ 已随 P0-1 完成
**状态**: ✅ 已完成 | **实际耗时**: 随 P0-1
- ✅ 创建 `NovelImportService` — 解析小说→提取章节→构建 WorkflowContext
- ✅ `POST /api/harness/start-from-novel` 端点 — 接受 projectId + workflowTemplate
- ✅ YAML 工作流 `${}` 引用已正确解析（P0-3 修复了 `${item}` 绑定）

### P1-2: ComfyUI 工作流版本管理
**状态**: 骨架 | **预估**: 3h
- 实现参数修改后自动创建新版本（写入 o_comfyui_workflow_version）
- 版本 Diff 展示（对比 changedParams）
- 版本回退 API

### P1-3: 分 Agent 审核标准  ✅ 已完成 (2026-07-04)
**状态**: ✅ 已完成 | **实际耗时**: 2h
- ✅ 为每个 Agent 创建专属审核标准（data/rules/*.md 新增 Review Criteria 章节）
  - screenwriter: completeness / formatCompliance / dialogueNaturalness 等 8 维度
  - director: styleCoherence / genreMatch / shotTypeVariety 等 5 维度
  - dp: resolution / composition / styleMatch / shotTypeRatio / lightingConsistency 等 7 维度
  - editor: pacingRhythm / transitionRationality / durationControl / shotContinuity 等 8 维度
  - sound: voiceEmotionMatch / bgmMoodTempoAlignment / dialogueClarity / audioVideoSync 等 6 维度
  - lighting: colorTempCorrectness / keyFillRatio / rimLightPresence 等 6 维度
  - costume: outfitCompleteness / colorPaletteControl / characterEmbeddingSimilarity 等 6 维度
  - vfx: effectQuality / compositingSeamlessness / motionRealism 等 7 维度
- ✅ ReviewPipeline 支持按 agentId 加载专属标准（`loadCriteriaForAgent(agentId)`）
- ✅ 解析 `## Review Criteria` 章节并构造 ReviewCriterion[]
- ✅ 支持 AI 评估（aiEvaluate prompt）+ 规则降级
- ✅ WorkflowRunner.executeReviewGate 注入共享 pipeline + findUpstreamAgent 自动推断 agentId
- ✅ 启动日志: `[Harness] ReviewPipeline initialized`

### P1-4: 审核历史学习  ✅ 已完成 (2026-07-04)
**状态**: ✅ 已完成 | **实际耗时**: 1.5h
- ✅ MemoryBus.recordEvent() 记录审核事件
- ✅ ReviewLearner 服务（`src/core/harness/ReviewLearner.ts`）
  - analyze(agentId) — 从历史 30 天中加载审核事件，统计失败率/平均分
  - apply(result) — 调整 ReviewPipeline 权重（高频失败维度 ↑ 权重）
  - learnForAllAgents(agentIds) — 一次性学习所有 agent
  - 至少 5 个样本才学习 (`minSamplesForLearning`)
- ✅ 启动日志: `[Harness] ReviewLearner initialized`

### P1-5: 全局重试预算管理  ✅ 已完成 (2026-07-04)
**状态**: ✅ 已完成 | **实际耗时**: 1h
- ✅ WorkflowNode config 新增 `globalRetryBudget` + `criticalNode` 字段
- ✅ WorkflowRunner.execute() 初始化预算：`initRetryBudgets(instance.id, totalBudget)`
- ✅ retryNode 检查预算：耗尽时非关键节点返回 `state: "skipped"` 而非 `failed`
- ✅ 关键节点 (`criticalNode: true`) 不受预算影响，确保核心路径不跳过
- ✅ 静态方法 `WorkflowRunner.computeTotalBudget(def)` 计算总预算

---

## 🟡 P2 — 两周内完成（中优先级）→ 增强生产能力

### P2-1: SkillsRegistry AI 化
**状态**: 部分 | **预估**: 2h
- SkillsRegistry.execute() 调用 AI 模型填充 prompt 模板
- 将 skill 定义转为实际的 AI function calling tool

### P2-2: 风格预览生成
**状态**: 骨架 | **预估**: 2h
- `POST /api/style/:id/preview` 真正调用生成
- 使用 VisualStyleSpec 参数调用 API/ComfyUI 生成示例图

### P2-3: ComfyUI Agent 集成 MCP 通道
**状态**: 未实现 | **预估**: 3h
- toonflow-comfyui-agent 暴露 MCP Server（stdio）
- Toonflow MCPConnector 连接该 Server
- 实现 generateWorkflow / testWorkflow / optimizeWorkflow 工具
- FilmAgent 中通过 MCP 调用 ComfyUI Agent 生成/优化工作流

### P2-4: MCPConnector stdio 传输补齐
**状态**: 部分 | **预估**: 2h
- 实现 JSON-RPC 协议解析（initialize/notifications/requests/responses）
- spawn 子进程 + stdin/stdout 管道通信

### P2-5: VRAM 资源感知调度
**状态**: 未实现 | **预估**: 2h
- 执行前检查 ComfyUI system_stats 获取 VRAM
- 资源不足时将任务排队
- 实现简单队列调度器

### P2-6: MemoryBus 语义搜索
**状态**: 占位 | **预估**: 3h
- 接入本地 embedding（如 text2vec-base-chinese 或 OpenAI embedding API）
- 实现 semanticSearch() 真实索引
- buildIndex() + 余弦相似度计算

### P2-7: 角色一致性审核（embedding）
**状态**: 未实现 | **预估**: 3h
- CostumeAgent 生成后获取图像 embedding
- 与 o_character_library 已有参考图 embedding 对比
- 低于阈值自动修正 prompt 重试

### P2-8: 最终成片组装脚本 final-render
**状态**: 未实现 | **预估**: 3h
- data/scripts/final-render.js
- 使用 FFmpeg 合并视频片段 + 添加音频
- 输出最终成片文件

---

## 🟢 P3 — 一月内完成（低优先级/增强）→ 完善生态

### P3-1: 前端 Dashboard 开发（Toonflow-web）
- 审核型 Dashboard 首页
- DAG 实时进度展示（基于 workflow:state-change 事件推送）
- ComfyUI 管理页面
- 导演风格配置页面
- 小说导入 + 工作流启动页面

### P3-2: ComfyUI 模型缺失自动诊断
- 提交工作流前验证必需的模型文件
- 缺失时生成诊断报告 + 下载建议

### P3-3: Agent 指标收集与性能面板
- 每个 Agent 执行时记录: 耗时/内存/模型调用次数/重试次数
- 提供性能 Dashboard 展示瓶颈

### P3-4: 混合渲染策略（API + ComfyUI）
- 按 shot 类型自动分配后端
- 成本感知选择（简单场景用 API，复杂风格用 ComfyUI）

### P3-5: 参考图 Embedding 风格匹配
- 上传参考图→提取 embedding→匹配最接近的 VisualStyleSpec
- 风格库支持 embedding 相似度检索

### P3-6: 工作流智能推荐增强
- 根据 shot/场景描述自动匹配 ComfyUI 工作流
- 学习用户偏好，优化推荐结果

### P3-7: 制作进度断点续制
- 工作流崩溃/暂停后精确恢复
- 已完成阶段跳过，从断点继续

---

## 📐 架构改进建议（长期）

1. **事件总线解耦**: WorkflowRunner 的事件系统应该升级为全局 EventBus，让前端 WebSocket 能监听工作流状态变化
2. **Harness 依赖注入**: 当前各组件各自 new 实例（如 WorkflowRunner 内 new MemoryBus()），应统一用 harness 全局单例或引入 DI 容器
3. **工作流实例的生命周期钩子**: 添加 beforeNodeExecute / afterNodeExecute / onRetry 等钩子，便于审核和监控
4. **AGENTS.md 补充**: 当前 AGENTS.md 为空，应写入项目上下文、架构约定、开发指南

---

## 📈 开发路线图时间线

```
Week 1 (7/5-7/11):   P0 全部 + P1-1/2/3        → Harness 能跑 + 审核生效
Week 2 (7/12-7/18):  P1-4/5 + P2-1/2/3/4      → 质量系统完善 + MCP 集成
Week 3 (7/19-7/25):  P2-5/6/7/8 + P3-1 开始    → 生产可用 + 前端开工
Week 4+ (7/26+):     P3 全部                    → 生态完善
```

---

## 🔧 上次修复记录 (2026-06-29)

### P0 — 已完成 ✅
1. YAML 工作流加载器 → init.ts loadYamlWorkflow()
2. 数据库表自动创建 → 7 张表 (ensureTables + migration)
3. Harness 启动接入 → core.ts initHarness() 
4. WorkflowRunner 状态持久化 → saveInstanceState/loadInstanceState

### P1 — 已完成 ✅
5. 审核系统 AI 化 → FilmAgent.reviewOutput() 接入三阶段审核
6. FilmAgent ComfyUI 链路打通 → generateViaComfyUI()
7. DPAgent ComfyUIClient 调用通 → chooseBackendWithWorkflow()
