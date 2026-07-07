# Harness V2 — 实施任务分解（中文版）

> **状态**: 等待用户二次确认 proposal/design/specs 后开始实施  
> **总任务数**: 89 (按阶段分组)  
> **总预估工作量**: 约 6-8 周 (1 人全职)

---

## 阶段 0: 设计确认 (本轮已完成)

- [x] 0.1 完成 proposal.md (中文, 7 点需求全覆盖)
- [x] 0.2 完成 design.md (中文, 含架构图/流转流程/13 工种契约/ComfyUI 详细设计/审核+历史版本/代码清理清单)
- [x] 0.3 完成 12 个 spec 文件 (中文, 8 个新增 + 4 个 delta)
- [x] 0.4 完成 tasks.md (本文件)
- [x] 0.5 完成原型 HTML (9 个场景切换 + 用户确认弹窗 + ComfyUI 参数编辑器 + 版本历史)
- [x] 0.6 **等待用户二次确认** ✓ 已通过

---

## 阶段 1: 代码清理 + 基础设施 ✓ 已完成

### 1.1 代码清理 (按 design.md 第 9 节) ✓

- [x] 1.1.1 删除 `src/core/harness/NovelImportService.ts` ✓
- [x] 1.1.2 删除 `src/core/harness/ReviewLearner.ts` ✓
- [x] 1.1.3 删除 `src/core/harness/migration.ts` ✓
- [x] 1.1.4 删除 `src/routes/harness/startFromNovel.ts` ✓
- [x] 1.1.5 删除 `src/routes/review/` 整个目录 ✓
- [x] 1.1.6 删除 `src/routes/style/` 整个目录 ✓
- [x] 1.1.7 `git checkout --` 还原 4 个 Agent 文件到 master 版本 (director/dp/screenwriter/sound) ✓
- [x] 1.1.8 修复 init.ts 和 index.ts 的引用 ✓ (无报错)

### 1.2 HarnessEventBus + 事件 Schema ✓

- [x] 1.2.1 新增 `src/core/harness/HarnessEventBus.ts`, 基于 Node EventEmitter ✓
- [x] 1.2.2 定义 HarnessEvent 类型 (13 种 kind), 写入 types.ts ✓
- [x] 1.2.3 事件持久化到 o_memory (namespace `event:<instanceId>`) ✓
- [x] 1.2.4 HarnessEventBus 单例注入到 harness 全局对象 ✓

### 1.3 SSE 端点 ✓

- [x] 1.3.1 新增 `src/routes/harness/events.ts`: `GET /api/harness/events/stream?instanceId=` ✓
- [x] 1.3.2 实现 SSE 心跳 (每 15s 发送 `:heartbeat`) ✓
- [x] 1.3.3 实现 Last-Event-ID 重放 (从 o_memory 读历史事件) ✓
- [x] 1.3.4 与 HarnessEventBus 订阅对接 ✓

### 1.4 AgentExecutionError 体系 ✓

- [x] 1.4.1 新增 `src/core/harness/errors.ts`: AgentExecutionError 基类 ✓
- [x] 1.4.2 子类: TimeoutError / ApiError / ParseError / BackendUnavailableError / ModelMissingError / CancelledError / ValidationError ✓
- [x] 1.4.3 每个子类提供 humanReadableReason 字段 (中文) ✓

### 1.5 删除所有 mock 分支 ✓

- [x] 1.5.1-1.5.6 4 个 Agent 已还原到 master 版本 (无 mock) ✓
- [ ] 1.5.7 新增 HARNESS_MOCK_MODE=1 环境变量支持 (待阶段 2 实现 Agent 时添加)

### 1.6 CallbackBridge ✓

- [x] 1.6.1 新增 `src/core/harness/CallbackBridge.ts` ✓
- [x] 1.6.2-1.6.10 实现 10 种 Agent 产物回写 ✓
- [x] 1.6.11 幂等 upsert ✓
- [x] 1.6.12 失败重试 + 事件 ✓
- [x] 1.6.13 业务表 source 字段 (待 DB migration)

### 1.7 TaskGraph 数据结构 ✓

- [x] 1.7.1 新增 `src/core/harness/TaskGraph.ts` ✓
- [x] 1.7.2 支持动态增删节点、跨工种依赖 ✓
- [x] 1.7.3 任务图持久化 (toJSON/fromJSON) ✓

### 1.8 DirectorOrchestrator 骨架 ✓

- [x] 1.8.1 新增 `src/core/harness/DirectorOrchestrator.ts` ✓
- [x] 1.8.2 注入 WorkflowRunner / EventBus / MemoryBus ✓
- [x] 1.8.3 实现 dispatchTask → 顺序调度循环 ✓
- [x] 1.8.4 实现 startFromNovel(options) 主入口 ✓
- [x] 1.8.5 LLM Planner 接入点 (占位, 阶段 6 完善) ✓

### 1.9 历史版本表 ✓

- [x] 1.9.1 新增 `o_artifact_version` 表 ✓
- [x] 1.9.2 创建唯一索引 ✓
- [x] 1.9.3 创建查询索引 ✓
- [x] 1.9.4 新增 o_scene_library + o_prop_library 表 ✓

### 1.10 Hooks 系统 ✓

- [x] 1.10.1 新增 `src/core/harness/Hooks.ts` ✓
- [x] 1.10.2 实现 5 个钩子: beforeTask / afterTask / onReview / onReroute / onUserConfirm ✓
- [x] 1.10.3 钩子可异步执行 ✓

---

## 阶段 2: 13 工种 Agent (进行中)

### 2.1 新增 8 个 Agent 类 ✓

- [x] 2.1.1 新增 `src/agents/director/ProducerAgent.ts` (制片人) ✓
- [x] 2.1.2 新增 `src/agents/director/SupervisorAgent.ts` (监制, 含 LLM 决策) ✓
- [x] 2.1.3 新增 `src/agents/director/AssistantDirectorAgent.ts` (副导演) ✓
- [x] 2.1.4 新增 `src/agents/director/ScriptSupervisorAgent.ts` (场记) ✓
- [x] 2.1.5 新增 `src/agents/director/MakeupAgent.ts` (化妆) ✓
- [x] 2.1.6 新增 `src/agents/director/WardrobeAgent.ts` (服装穿戴) ✓
- [x] 2.1.7 新增 `src/agents/director/SetDecoratorAgent.ts` (置景) ✓
- [x] 2.1.8 新增 `src/agents/director/SoundDesignerAgent.ts` (声音设计) ✓
- [x] 2.1.9 更新 director/index.ts 导出 9 个 descriptors ✓
- [x] 2.1.10 更新 AgentRegistry 支持多 descriptor 扫描 ✓
- [x] 2.1.11 扩展 FilmAgentRole 类型 (新增 8 个角色) ✓

### 2.2 复用 8 个 Agent 类的重写

### 2.2 复用 8 个 Agent 类的重写 ✓

- [x] 2.2.1 重写 ScreenwriterAgent.execute(): 标准格式 + ParseError ✓
- [x] 2.2.2 重写 DPAgent.execute(): 删除 mock, 接入 BackendSelector + characterRefs ✓
- [x] 2.2.3 重写 LightingAgent.execute(): 失败抛 ParseError ✓
- [x] 2.2.4 重写 CostumeAgent.execute(): 写入 o_character_library + MemoryBus ✓
- [x] 2.2.5 重写 SoundAgent.execute(): 删除 defaultSoundPlan, 失败抛错 ✓
- [x] 2.2.6 重写 EditorAgent.execute(): 删除 defaultTimeline, 失败抛错 ✓
- [x] 2.2.7 重写 VFXAgent.execute(): 增加视频生成调用 ✓
- [x] 2.2.8 重写 DirectorAgent.execute(): 删除 defaultShots, 失败抛 ParseError ✓

### 2.3 13 工种的 ReviewCriteria 文件 ✓

- [x] 2.3.1 新增 `data/rules/producer.md` ✓
- [x] 2.3.2 新增 `data/rules/supervisor.md` ✓
- [x] 2.3.3 新增 `data/rules/assistant_director.md` ✓
- [x] 2.3.4 新增 `data/rules/script_supervisor.md` ✓
- [x] 2.3.5 新增 `data/rules/makeup.md` ✓
- [x] 2.3.6 新增 `data/rules/wardrobe.md` ✓
- [x] 2.3.7 新增 `data/rules/set_decorator.md` ✓
- [x] 2.3.8 新增 `data/rules/sound_designer.md` ✓
- [ ] 2.3.9 验证 ReviewPipeline.loadCriteriaForAgent() 解析全部 16 个文件

### 2.4 13 工种的 System Prompt 模板 (部分完成)

- [x] 2.4.1 为 15 个 Agent 各编写中文 system prompt (在 getSystemPrompt() 中) ✓
- [ ] 2.4.2 实现 PromptBuilder 工具类 (待后续)
- [ ] 2.4.3 验证每个 Agent 启动时注入正确的 system prompt

### 2.5 13 工种注册到 AgentRegistry

- [ ] 2.5.1 每个新 Agent 类导出 descriptor: AgentDescriptor
- [ ] 2.5.2 每个 Agent 目录的 index.ts 导出 descriptor
- [ ] 2.5.3 验证 initHarness() 后 agentRegistry.listAll().length === 15

### 2.6 Skills 目录扩展

- [ ] 2.6.1 为每个工种创建 `data/skills/<role>/` 目录
- [ ] 2.6.2 编写各工种的 skills .md 文件 (构图/后端选择/一致性检查等)
- [ ] 2.6.3 验证 SkillsRegistry 加载所有 skills

---

## 阶段 3: ComfyUI 模块完全重写 ✓

### 3.1 ComfyUIServerManager ✓

- [x] 3.1.1 新增 `src/comfyui/ComfyUIServerManager.ts` ✓
- [x] 3.1.2 实现 addServer / removeServer / listServers ✓
- [x] 3.1.3 实现 healthCheck (调 /system_stats) ✓
- [x] 3.1.4 实现 selectServer (round-robin / least-load / most-vram) ✓
- [x] 3.1.5 实现 ensureConnected ✓

### 3.2 WorkflowLibrary ✓

- [x] 3.2.1 新增 `src/comfyui/WorkflowLibrary.ts` ✓
- [x] 3.2.2 实现 importWorkflow / listWorkflows / getWorkflow / deleteWorkflow ✓
- [x] 3.2.3 实现 updateWorkflow (创建新版本) ✓
- [x] 3.2.4 实现 listVersions / rollbackToVersion ✓
- [ ] 3.2.5 实现 generateThumbnail (占位, 需 sharp 库)

### 3.3 ParameterEditor (核心) ✓

- [x] 3.3.1 新增 `src/comfyui/ParameterEditor.ts` ✓
- [x] 3.3.2 实现 extractParameters (兼容 widgets_values 和 inputs 两种格式) ✓
- [x] 3.3.3 实现 injectParameters (根据 injectVia 字段决定注入方式) ✓
- [x] 3.3.4 实现 validateParams ✓
- [x] 3.3.5 实现 toFormSchema (供前端渲染表单) ✓

### 3.4 WorkflowExecutor ✓

- [x] 3.4.1 新增 `src/comfyui/WorkflowExecutor.ts` ✓
- [x] 3.4.2 实现 execute (提交 + WS 进度 + 结果下载) ✓
- [x] 3.4.3 实现 interrupt ✓
- [x] 3.4.4 实现 getQueue ✓

### 3.5 BackendSelector ✓

- [x] 3.5.1 新增 `src/comfyui/BackendSelector.ts` ✓
- [x] 3.5.2 实现 chooseBackend (根据 shot / style / 用户偏好) ✓
- [x] 3.5.3 实现 ComfyUI 不可用降级到 API ✓

### 3.6 AssetProcessor ✓

- [x] 3.6.1 新增 `src/comfyui/AssetProcessor.ts` ✓
- [ ] 3.6.2 实现下载产物到 production/<projectId>/
- [ ] 3.6.3 实现生成缩略图
- [ ] 3.6.4 实现写入 o_assets

### 3.7 WorkflowParser 重写

- [ ] 3.7.1 重写 `src/comfyui/WorkflowParser.ts`, 兼容两种 API 格式
- [ ] 3.7.2 实现 parse / extractParameters / injectParameters / validate

### 3.8 ComfyUI 管理前端页面

- [ ] 3.8.1 新增 `#/comfyui/server` 服务管理页面
- [ ] 3.8.2 新增 `#/comfyui/workflow` 工作流库页面
- [ ] 3.8.3 新增 `#/comfyui/workflow/:id` 工作流详情页面 (含参数编辑器)
- [ ] 3.8.4 参数编辑器按节点分组, 每个参数根据类型渲染 (string/number/select/image/boolean)
- [ ] 3.8.5 实现"测试运行"按钮 + 实时进度

---

## 阶段 4: 主控台 UI

### 4.1 路由与基础布局

- [ ] 4.1.1 前端仓库新增路由 `#/harness/control/:instanceId`
- [ ] 4.1.2 新增 `src/views/HarnessControlRoom.vue` (CSS Grid 双列布局)
- [ ] 4.1.3 顶部步骤导航条组件 (7 步骤)

### 4.2 左侧导演对话窗口

- [ ] 4.2.1 新增 `src/composables/useHarnessEventStream.ts` (EventSource 封装)
- [ ] 4.2.2 新增 `<DirectorChatWindow>` 组件 (沿用 #/scriptAgent 风格)
- [ ] 4.2.3 导演气泡 (蓝色) / 用户气泡 (灰色)
- [ ] 4.2.4 director.user_input_required 事件渲染为内联确认卡片
- [ ] 4.2.5 用户输入框 + Enter 发送

### 4.3 右侧 7 个步骤执行子组件

- [ ] 4.3.1 `<StageScriptEditor>`: 复用 src/views/script/*.vue, 过滤 source="harness"
- [ ] 4.3.2 `<StageArtDepartmentLibrary>`: 复用 #/assets 角色/场景/道具 tab
- [ ] 4.3.3 `<StageStoryboard>`: 复用 #/storyboard 表格
- [ ] 4.3.4 `<StageShotImageGrid>`: 复用 #/cornerScape 批量生图 UI
- [ ] 4.3.5 `<StageVideoGrid>`: 复用 #/workbench 视频 UI
- [ ] 4.3.6 `<StageReviewReport>`: 审核详情 (评分/反馈/驳回历史)
- [ ] 4.3.7 `<StageVersionHistory>`: 多版本对比与回滚
- [ ] 4.3.8 步骤导航条与右侧组件联动

### 4.4 用户确认弹窗

- [ ] 4.4.1 新增 `<UserConfirmDialog>` 组件
- [ ] 4.4.2 弹窗包含: 监制报告 + 产物预览 + 评分详情 + 历史版本 + 操作按钮
- [ ] 4.4.3 操作按钮: 通过 / 打回 / 查看大图 / 对比版本 / 手动修改 prompt

### 4.5 流程导览

- [ ] 4.5.1 顶部展开横向流程图: [小说]→[剧本]→[分镜]→[美术]→[生图]→[生视频]→[后期]→[成片]
- [ ] 4.5.2 每个节点显示状态 (✓ 已完成 / 🔄 进行中 / ○ 等待)
- [ ] 4.5.3 当前节点黄色脉动

### 4.6 实时事件订阅

- [ ] 4.6.1 task.completed 事件 → 立即更新对应步骤组件
- [ ] 4.6.2 review.scored 事件 → StageReviewReport 实时刷新
- [ ] 4.6.3 director.message 事件 → 聊天窗口追加气泡
- [ ] 4.6.4 事件去重 (前端 Set<eventId>)

---

## 阶段 5: 跨工种驳回与历史版本

### 5.1 Supervisor Agent 决策

- [ ] 5.1.1 实现 SupervisorAgent.execute(reviewResult): LLM 决策 reroute target
- [ ] 5.1.2 决策 schema: { action: reroute|ask_user|approve, targetAgent, retryInstruction, userInputRequired }
- [ ] 5.1.3 失败兜底: 决策失败时默认 ask_user

### 5.2 Reroute 协议

- [ ] 5.2.1 增强 ReviewPipeline.generateRetryInstruction(): 支持跨工种 targetAgent
- [ ] 5.2.2 review.reroute 事件 schema
- [ ] 5.2.3 DirectorOrchestrator 处理 review.reroute → 重新派活或暂停等用户

### 5.3 用户决策流

- [ ] 5.3.1 新增 `POST /api/harness/control/:id/user-input`
- [ ] 5.3.2 30 分钟无回复自动暂停 Harness
- [ ] 5.3.3 聊天窗口 director.user_input_required 事件 → 内联按钮 → 调用 API
- [ ] 5.3.4 用户选择转换为 retryInstruction.suggestions

### 5.4 历史版本管理

- [ ] 5.4.1 CallbackBridge 在审核失败时保存当前版本到 o_artifact_version
- [ ] 5.4.2 新增 `GET /api/harness/control/:id/versions/:type/:key` 查询版本历史
- [ ] 5.4.3 新增 `POST /api/harness/control/:id/versions/:type/:key/rollback` 回滚
- [ ] 5.4.4 前端 `<StageVersionHistory>` 组件: 版本列表 + 缩略图 + 评分 + 回滚按钮

### 5.5 重试上限

- [ ] 5.5.1 每个 task 自动重试 ≤ 2 次
- [ ] 5.5.2 第 3 次失败强制 userInputRequired: true
- [ ] 5.5.3 重试计数器持久化到 o_workflow_state

### 5.6 UserConfirmGate

- [ ] 5.6.1 新增 `src/review/UserConfirmGate.ts`
- [ ] 5.6.2 5 个关键节点强制用户确认 (剧本后/角色场景后/生图每8张/生视频每4段/终审)
- [ ] 5.6.3 确认窗口包含产物预览和评分

---

## 阶段 6: DirectorOrchestrator LLM Planner (完整化) ✓

- [x] 6.1 编写 `src/core/harness/DirectorLLMPlanner.ts` ✓
- [x] 6.2 实现 planNextStep(state) ✓
- [x] 6.3 LLM 输出 JSON Schema 校验 ✓
- [x] 6.4 决策失败降级到顺序逻辑 ✓
- [x] 6.5 实现 decideReroute(reviewResult) ✓
- [x] 6.6 实现 decideUserPrompt(task, retryCount) (在 decideReroute 中) ✓
- [x] 6.7 实现用户对话意图解析 (parseUserIntent) ✓
- [x] 6.8 实现"跳过某工种"的意图 (skipAgents) ✓
- [x] 6.9 集成到 DirectorOrchestrator (handleUserMessage 使用 LLM Planner) ✓

---

## 阶段 7: Harness API 扩展

- [ ] 7.1 `POST /api/harness/control/start` (启动 Harness)
- [ ] 7.2 `POST /api/harness/control/:id/message` (用户对话)
- [ ] 7.3 `GET /api/harness/control/:id/messages` (对话历史)
- [ ] 7.4 `GET /api/harness/control/:id/status` (状态)
- [ ] 7.5 `GET /api/harness/control/:id/task-graph` (任务图)
- [ ] 7.6 `GET /api/harness/control/:id/artifacts` (产物)
- [ ] 7.7 `POST /api/harness/control/:id/user-input` (用户决策回复)
- [ ] 7.8 `POST /api/harness/control/:id/pause` / `resume` / `cancel`
- [ ] 7.9 `GET /api/harness/control/:id/versions/:type/:key` (版本历史)
- [ ] 7.10 `POST /api/harness/control/:id/versions/:type/:key/rollback` (回滚)
- [ ] 7.11 `GET /api/harness/events/stream` (SSE)
- [ ] 7.12 `POST /api/harness/reroute` (内部 API)
- [ ] 7.13 `GET/POST/DELETE /api/comfyui/server` (服务管理)
- [ ] 7.14 `GET /api/comfyui/server/:id/health` (健康检查)
- [ ] 7.15 `GET/POST /api/comfyui/workflow` (工作流列表/导入)
- [ ] 7.16 `GET/PUT/DELETE /api/comfyui/workflow/:id` (工作流详情)
- [ ] 7.17 `GET /api/comfyui/workflow/:id/params` (参数 schema)
- [ ] 7.18 `POST /api/comfyui/workflow/:id/test` (测试运行)
- [ ] 7.19 `GET /api/comfyui/workflow/:id/versions` (版本历史)
- [ ] 7.20 `POST /api/comfyui/workflow/:id/rollback` (回滚)

---

## 阶段 8: 端到端验证

### 8.1 单功能验证

- [ ] 8.1.1 上传小说 → Harness 主控台启动
- [ ] 8.1.2 导演对话可见
- [ ] 8.1.3 编剧生成的剧本回写到 o_script 并在 #/script 可见
- [ ] 8.1.4 分镜表回写到 o_storyboard 并在 #/storyboard 可见
- [ ] 8.1.5 生图回写到 o_assets 并在 #/cornerScape 可见
- [ ] 8.1.6 生视频回写到 o_assets 并在 #/workbench 可见
- [ ] 8.1.7 审核评分与反馈在 #/harness/control 可见
- [ ] 8.1.8 历史版本在主控台可查看与回滚

### 8.2 跨工种驳回验证

- [ ] 8.2.1 DP 图被打回 → 导演对话询问用户
- [ ] 8.2.2 用户选择"重写 prompt" → DP 重新生成
- [ ] 8.2.3 多次失败触发 userInputRequired
- [ ] 8.2.4 跨工种驳回: DP→编剧 (脚本太烂)
- [ ] 8.2.5 跨工种驳回: DP→服装 (角色不一致)

### 8.3 ComfyUI 验证

- [ ] 8.3.1 ComfyUI 服务添加/健康检查
- [ ] 8.3.2 工作流导入并自动提取参数
- [ ] 8.3.3 参数编辑器正确显示 (兼容 widgets_values 和 inputs)
- [ ] 8.3.4 测试运行工作流并显示结果
- [ ] 8.3.5 DPAgent 调用 ComfyUI 生图
- [ ] 8.3.6 VFXAgent 调用 ComfyUI 视频工作流
- [ ] 8.3.7 BackendSelector 智能选择 API/ComfyUI

### 8.4 性能与稳定性

- [ ] 8.4.1 LLM 调用耗时与 SSE 实时性
- [ ] 8.4.2 24 shot × DP 并行 (parallelDegree=4) 端到端 < 30 分钟
- [ ] 8.4.3 Harness 暂停 / 恢复正常
- [ ] 8.4.4 DB 写入并发安全 (CallbackBridge 事务)
- [ ] 8.4.5 SSE 断线重连 + 事件重放

---

## 阶段 9: 文档与回归

- [ ] 9.1 更新 AGENTS.md: 补充 Harness V2 架构说明
- [ ] 9.2 更新 openspec/changes/toonflow-harness-upgrade/ 中的状态审计
- [ ] 9.3 编写 `docs/harness-v2-usage.md`: 用户使用文档
- [ ] 9.4 编写 `docs/harness-v2-agent-cookbook.md`: 开发新工种的指南
- [ ] 9.5 编写 `docs/harness-v2-comfyui.md`: ComfyUI 配置指南
- [ ] 9.6 回归测试: 6 个业务前端页面 (#/novel / #/script / #/storyboard / #/cornerScape / #/assets / #/workbench) 功能不退化

---

## 任务依赖关系

```
阶段 0 (设计) ✓
  └─> 阶段 1 (代码清理 + 基础设施)
        ├─> 1.1 代码清理 (最先做)
        ├─> 1.2-1.10 基础设施 (并行)
        │
        └─> 阶段 2 (13 工种) 依赖 1.4 (错误体系) + 1.5 (删除 mock) + 1.8 (DirectorOrchestrator 骨架)
              │
              ├─> 阶段 3 (ComfyUI 重写) 依赖 1.6 (CallbackBridge)
              │     │
              │     └─> 阶段 4 (主控台 UI) 依赖 1.2 (EventBus) + 1.3 (SSE) + 阶段 2 + 阶段 3
              │           │
              │           └─> 阶段 5 (跨工种驳回) 依赖 1.6 (CallbackBridge) + 阶段 2 (SupervisorAgent)
              │                 │
              │                 └─> 阶段 6 (LLM Planner 完整化) 依赖 阶段 1.8 + 阶段 2
              │                       │
              │                       └─> 阶段 7 (API 扩展)
              │                             │
              │                             └─> 阶段 8 (端到端验证)
              │                                   │
              │                                   └─> 阶段 9 (文档与回归)
```

---

## 验证标准 (每阶段完成时)

| 阶段 | 验证方法 |
|------|----------|
| 0 | 用户审阅 proposal/design/specs/tasks/原型后确认 |
| 1 | npm test + 手动触发 Harness 看 SSE 事件 + 看 o_assets 写入 |
| 2 | npm test + 13 个 Agent 全部能 init/execute 无 mock |
| 3 | ComfyUI 服务添加 + 工作流导入 + 参数编辑 + 测试运行 |
| 4 | 浏览器打开 #/harness/control/abc 看到对话窗口 + 步骤组件 |
| 5 | 故意让 DP 生成失败图, 验证 user_input_required 流程 |
| 6 | 跑完整 Harness (小说 → 成片) 验证 LLM 决策合理性 |
| 7 | 用 Postman 测所有 20 个 API 端点 |
| 8 | 跑端到端 + 性能 + 稳定性 |
| 9 | 文档 + 业务页面回归 |

---

## 风险任务 (P0)

- [ ] 1.1.* (代码清理): 可能误删可用逻辑 → 严格按 design.md 第 9 节清单
- [ ] 1.5.* (删除 mock): 可能暴露隐藏的 LLM 兼容性问题
- [ ] 1.6.* (CallbackBridge): DB 写入并发安全需要充分测试
- [ ] 2.2.2 (重写 DPAgent): 生图后端是项目最复杂的部分
- [ ] 2.2.8 (升级 DirectorAgent): LLM Planner 的 prompt 工程是核心难点
- [ ] 3.3.* (ParameterEditor): 参数注入兼容两种格式是关键技术点
- [ ] 4.* (主控台 UI): 7 个步骤组件复用现有页面代码需要仔细抽离
- [ ] 5.* (跨工种驳回): 决策质量直接影响用户体验

---

> 任务清单结束。等待用户二次确认后开始执行。
