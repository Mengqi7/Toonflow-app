# harness-code-cleanup — 代码清理

> 本 spec 定义一阶段未提交代码的清理清单, 确保不保留垃圾代码。

## 新增需求 (ADDED Requirements)

### 需求: 必须删除一阶段未提交的 6 个无用文件

系统 SHALL 删除以下一阶段未提交文件 (逻辑合并到新模块):

#### 场景: 删除 NovelImportService
- **WHEN** 实施阶段开始
- **THEN** 删除 `src/core/harness/NovelImportService.ts`
- **AND** 其逻辑 (从小说触发 Harness) 合并到 `DirectorOrchestrator.startFromNovel()`

#### 场景: 删除 ReviewLearner
- **WHEN** 实施阶段开始
- **THEN** 删除 `src/core/harness/ReviewLearner.ts`
- **AND** 其逻辑 (审核历史学习) 合并到 `SupervisorAgent.learnFromHistory()`

#### 场景: 删除 migration
- **WHEN** 实施阶段开始
- **THEN** 删除 `src/core/harness/migration.ts`
- **AND** 其逻辑 (DB 迁移) 合并到 `init.ts` 的 `ensureTables()`

#### 场景: 删除 startFromNovel 路由
- **WHEN** 实施阶段开始
- **THEN** 删除 `src/routes/harness/startFromNovel.ts`
- **AND** 其端点合并到 `POST /api/harness/control/start`

#### 场景: 删除 routes/review 目录
- **WHEN** 实施阶段开始
- **THEN** 删除 `src/routes/review/` 整个目录
- **AND** 重写为 `/api/harness/control/:id/review/*`

#### 场景: 删除 routes/style 目录
- **WHEN** 实施阶段开始
- **THEN** 删除 `src/routes/style/` 整个目录
- **AND** 风格管理合并到导演 Agent

### 需求: 必须还原 15 个被一阶段修改的文件到 master 版本

系统 SHALL 把以下文件 `git checkout --` 还原到 master 版本, 然后按二轮设计重新实现:

- `src/agents/director/DirectorAgent.ts` (重写为 DirectorOrchestrator)
- `src/agents/dp/DPAgent.ts` (删除 mock, 接入 BackendSelector)
- `src/agents/screenwriter/ScreenwriterAgent.ts` (重写为工种)
- `src/agents/sound/SoundAgent.ts` (删除 default)
- `src/core/harness/MemoryBus.ts` (保留框架, 微调)
- `src/core/harness/WorkflowRunner.ts` (收缩为执行容器)
- `src/core/harness/index.ts` (更新导出)
- `src/core/harness/init.ts` (简化, 移除 seedComfyUITemplates)
- `src/core/harness/types.ts` (增加 TaskNode/HarnessEvent/AgentContract)
- `src/lib/fixDB.ts` (增加 o_artifact_version 表)
- `src/review/ReviewPipeline.ts` (增加 UserConfirmGate)
- `src/router.ts` (更新路由)
- `src/routes/harness/index.ts` (重写)
- `src/types/database.d.ts` (增加新表类型)
- `src/utils/ai.ts` (保留, 微调)

#### 场景: 还原 DPAgent
- **WHEN** 实施阶段开始
- **THEN** 执行 `git checkout -- src/agents/dp/DPAgent.ts`
- **AND** 文件回到 master 版本 (无 mock)
- **AND** 然后按二轮设计重新实现

### 需求: 必须保留一阶段可用的 13 个文件

系统 SHALL 保留以下一阶段文件不删除, 仅做微调:

- `src/core/harness/AgentRegistry.ts`
- `src/core/harness/RulesEngine.ts`
- `src/core/harness/SkillsRegistry.ts`
- `src/core/harness/MCPConnector.ts`
- `src/core/harness/ScriptExecutor.ts`
- `src/comfyui/ComfyUIClient.ts` (保留, 优化)
- `src/review/ArtisticReviewer.ts`
- `src/review/ContentReviewer.ts`
- `src/review/TechnicalReviewer.ts`
- `data/rules/*.md` (8 个, 扩展为 13 个)
- `data/skills/**`
- `data/workflows/*.yaml` (3 个, 保留为可选模板)
- `data/scripts/final-render.js`

#### 场景: 保留 AgentRegistry
- **WHEN** 实施阶段开始
- **THEN** `src/core/harness/AgentRegistry.ts` 不被还原
- **AND** 仅做微调 (支持 15 个 Agent 注册)

### 需求: 清理后必须跑一次完整流程验证

系统 SHALL 在清理完成后, 跑一次端到端流程验证, 确保未误删可用逻辑。

#### 场景: 清理后验证
- **WHEN** 所有清理操作完成
- **THEN** 启动服务, 创建一个测试项目
- **AND** 触发 Harness 流程 (小说→剧本→分镜→生图)
- **AND** 验证无报错, 产物正确落库
- **AND** 如有报错, 回滚清理操作并修复
