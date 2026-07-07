# Harness V2 — 导演 Agent 主导的全自动影视流水线（中文版）

> **状态**: 设计阶段（待用户二次确认）  
> **范围**: 完全重写第一阶段 `toonflow-harness-upgrade` 的设计；旧未提交代码大量清理  
> **核心理念**: 严格按 Harness 工程规范（agents / skills / hooks / workflow / scripts / memory）+ 多 Agent 协作契约 + 提示词驱动 + LLM 自主调度

---

## 1. 为什么（Why）

第一阶段 `toonflow-harness-upgrade` 在 6 个月内完成了约 47% 的骨架（WorkflowRunner / AgentRegistry / ReviewPipeline / RulesEngine / MemoryBus / ComfyUI 集成），但**实现形态与用户期望完全错位**：

| # | 痛点 | 根因 |
|---|------|------|
| 1 | 启动后是"执行黑洞"，只看到进度数字 | 所有 Agent 默认走 mock（`DP_FAST_MODE=1`、`mockImagePath`、`defaultVisualStyle`、`defaultShots`、`defaultSoundPlan`），无真实产物 |
| 2 | 没有视频生成节点 | `generate.video.unit` 仍走 `dp` Agent 用 imageModel，没接视频后端 |
| 3 | 角色太弱、调度太粗 | 仅 8 个 Agent；无制片人/监制/副导演/化妆师/服装师/置景师/声音设计师；无"调度者" |
| 4 | 没和业务打通 | DPAgent 输出不写回 o_assets/o_storyboard；用户还得去 `#/cornerScape` 手工生图 |
| 5 | 没有对话控制台 | `#/harness` 只显示 KPI 数字；无 AI 导演对话窗口 |
| 6 | ComfyUI 设置完全不可用 | `o_comfyui_workflow` 表有数据但前端无法配置参数；与 Harness 流程脱节 |
| 7 | 审核机制无效 | review-gate 的 onReject=skip；无人工确认环节；无历史版本 |
| 8 | 代码垃圾多 | 一阶段有 15 个文件未提交（`NovelImportService` / `ReviewLearner` / `migration` 等空壳/重试代码） |

**根本原因**: 一阶段只设计了"引擎如何调度 Agent"，没有设计"导演 Agent 如何调用业务模块、把产物写回数据库、让用户看见过程"。

---

## 2. 改什么（What Changes）

> 本轮**仅产出设计文档与原型图**，不写代码。用户确认后再进入实施。

### 2.1 新增能力（New Capabilities）

- **`harness-architecture`**: Harness V2 整体架构，严格遵循标准 Harness 规范（agents/skills/hooks/workflow/scripts/memory 六要素 + 多 Agent 协作契约）。架构图、详细流转流程、入口设计。
- **`harness-department-agents`**: 13 个工种 Agent 的完整定义（角色/职责/上场时机/输入输出契约/相互关系/打回路径）。
- **`harness-business-bridge`**: Harness 工程与现有项目业务（剧本管理/角色管理/场景管理/分镜管理/资产/工作台）的紧密集成方案。
- **`harness-comfyui-engine`**: ComfyUI 模块**完全重写**：服务管理/工作流导入/参数配置/测试/版本管理/API & ComfyUI 双后端选择，全部适配 Harness 调度。
- **`harness-review-with-history`**: 多级审核系统：监制 Agent 自动审核 → 用户确认 → 自动打回重做；每张图/视频/剧本支持**多版本保存**，历史版本可对比与回滚。
- **`harness-control-room-ui`**: 主控台 UI（左侧 AI 导演对话 + 右侧动态步骤画面 + 多场景切换 + 用户确认弹窗）。
- **`harness-prompt-driven`**: 全流程提示词驱动机制；除 pipeline 代码外，调度、审核、驳回决策全部由 LLM + 提示词完成。

### 2.2 修改的能力（Modified Capabilities）

- **`harness-agent-orchestration`**（一阶段已有）: WorkflowRunner 收缩为"单任务执行容器"，调度权上移给导演 Agent。
- **`script-agent`**（一阶段已有）: 编剧 Agent 改为"剧本工种"，由导演 Agent 调度，产物直接落 `o_script`。
- **`production-agent`**（一阶段已有）: 单 Agent 流水线拆为 8 个工种协作。
- **`film-production-pipeline`**（一阶段已有）: DAG 从静态 YAML 改为导演 Agent 动态生成的任务图。

### 2.3 不在范围（Non-Goals）

- 不重写底层 AI 调用层（`src/utils/ai.ts` 保持不变）
- 不重写 `MemoryBus` / `RulesEngine` / `SkillsRegistry` 框架（保留一阶段版本）
- 不动 `toonflow-comfyui-agent` 独立项目（保留为可选 ComfyUI workflow 生成器）
- 不支持多人协同

---

## 3. 能力清单（Capabilities）

### 新增能力

- `harness-architecture`: Harness V2 整体架构与流转流程
- `harness-department-agents`: 13 工种 Agent 完整定义与协作契约
- `harness-business-bridge`: Harness 与现有业务的集成（剧本/角色/场景/分镜/资产）
- `harness-comfyui-engine`: ComfyUI 模块完全重写 + API 双后端
- `harness-review-with-history`: 多级审核 + 历史版本
- `harness-control-room-ui`: 主控台 UI
- `harness-prompt-driven`: 提示词驱动的 LLM 调度机制

### 修改的能力

- `harness-agent-orchestration`: WorkflowRunner 职责收缩
- `script-agent`: 编剧改为工种
- `production-agent`: 拆分为多工种
- `film-production-pipeline`: DAG 动态化

---

## 4. 影响（Impact）

### 4.1 受影响模块

| 模块 | 现状 | 二轮改造 |
|------|------|----------|
| `src/agents/director/DirectorAgent.ts` | 23 行 mock | 重写为导演 Agent + LLM 调度器 |
| `src/agents/screenwriter/ScreenwriterAgent.ts` | 50 行 fallback | 重写为剧本工种，产物落 `o_script` |
| `src/agents/dp/DPAgent.ts` | mock 优先 | 删 mock，支持 API + ComfyUI 双后端 |
| `src/agents/lighting/LightingAgent.ts` | default 兜底 | 删 default，产物落 `o_scene_library` |
| `src/agents/costume/CostumeAgent.ts` | 写库无图 | 完善 referenceImage，落 `o_character_library` |
| `src/agents/sound/SoundAgent.ts` | default plan | 删 default，调真实 TTS |
| `src/agents/editor/EditorAgent.ts` | 待确认 | 生成时间轴 JSON |
| `src/agents/vfx/VFXAgent.ts` | 待确认 | 合并视频生成 |
| `src/comfyui/*` | 不可用 | 完全重写：服务/工作流/参数/测试/版本 |
| `src/core/harness/WorkflowRunner.ts` | 顶层调度 | 收缩为执行容器 |
| `src/core/harness/init.ts` | 启动入口 | 增加导演 Agent 注册 |
| `src/routes/harness/index.ts` | 8 端点 | 扩展为 30+ 端点 |
| `src/routes/review/*` | 一阶段未提交 | 删除后重写 |
| `src/routes/style/*` | 一阶段未提交 | 删除后重写 |
| `src/core/harness/NovelImportService.ts` | 未提交 | 删除，逻辑合并到 DirectorOrchestrator |
| `src/core/harness/ReviewLearner.ts` | 未提交 | 删除，逻辑合并到 SupervisorAgent |
| `src/core/harness/migration.ts` | 未提交 | 删除，迁移逻辑合并到 init.ts |

### 4.2 新增模块

详见 `design.md` 第 8 节"文件结构"。

### 4.3 风险

- **R1（高）**: LLM 调用耗时长 → 主控台需做好"加载中"与"取消"状态机
- **R2（高）**: 真实生图/视频可能失败 → 监制 Agent 自主重试 + 用户决策兜底
- **R3（中）**: ComfyUI 工作流参数注入复杂 → 需要可视化参数编辑器
- **R4（中）**: 13 工种 system prompt 编写工作量大 → 模板化拼装 + LLM 生成草稿
- **R5（中）**: 上版本代码清理可能误删可用逻辑 → 在 design.md 中列出**完整清理清单**与**保留清单**

---

## 5. 验证标准（本轮不做，确认后才实施）

1. **架构规范性**: 严格遵循 Harness 工程规范，包含 agents/skills/hooks/workflow/scripts/memory 六要素
2. **角色完整性**: 13 个工种全部有独立 Agent 类 + 中文 system prompt + 输入输出契约
3. **业务集成度**: Harness 跑完后，`#/script`、`#/cornerScape`、`#/assets`、`#/storyboard` 都能直接看到 Harness 产物
4. **ComfyUI 可用性**: 工作流导入/参数配置/测试/版本管理全部可用，与 Harness 生图生视频流程打通
5. **审核机制**: 监制 Agent 自动审核 + 用户确认 + 多版本保存 + 历史回滚
6. **可见性**: 每步执行都有独立事件 + 进度展示，不是聚合百分比
7. **驳回流程**: 监制 Agent 自主决定打回给哪个工种，用户可在关键节点确认
8. **会话性**: 用户能在对话窗口随时打断导演 Agent，并把对话内容转化为工种任务
9. **代码质量**: 删除所有未使用的代码，不保留垃圾

---

## 6. 后续流程

- ✅ **本轮产出**: 全中文 `proposal.md` / `design.md` / `specs/*.md` / `tasks.md` + 升级版原型 HTML
- ⏸ **等待用户二次确认**:
  - 整体架构是否符合 Harness 工程规范
  - 13 工种角色定义是否完整
  - 业务集成方案是否合理
  - ComfyUI 模块设计是否可用
  - 审核与历史版本机制是否符合期望
  - 主控台 UI 原型是否到位
- ⏭ **用户确认后**: 进入实施阶段
