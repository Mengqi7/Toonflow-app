# Harness V2 Director Control - AI影视智能工作台

> **状态**: 需求重定向与原型验证阶段  
> **决策日期**: 2026-07-08  
> **核心决策**: 暂停当前 demo 版本开发，先重做产品逻辑与原型；第一阶段移除主控台对 ComfyUI 的直接调用，ComfyUI 延后到后续迭代作为可插拔生成后端接入。

## Why

当前 `#/harness/control/:instanceId` demo 偏向普通仪表盘和生图参数面板，未体现 Harness 工程的核心价值：多角色 Agent 自主调度、产物回写、自动审核、人工终审与驳回重试闭环。

本轮需要重新对齐 Toonflow 已有能力与 Harness 闭环思想，先验证“AI影视智能工作台”的产品逻辑，再继续正式开发，避免 ComfyUI 参数配置提前占据主控台重点。

## What Changes

- **暂停现有主控台 demo 的继续开发**，将当前前端半成品视为原型失败稿，仅保留可复用的路由、SSE、对话窗口和基础组件经验。
- **移除第一阶段 ComfyUI 直接调用能力**：主控台不展示 ComfyUI 参数快照、测试运行、workflow 切换或直接执行按钮；后续只通过生成后端抽象预留扩展点。
- **重做工作台定位**：主控台是 Harness 智能制片系统的可视化管控中心，不是单一生图工具页。
- **聚焦 Harness 工业流水线闭环**：总导演调度 Agent 负责全局调度，剧本改编、台词打磨、角色设定、服化道、场景概念、衍生图合成、分镜脚本、分镜提示词、分镜生图、视频生成、一致性校验、配音、配乐、剪辑合成等执行 Agent 负责生产，专项审核 Agent 与总监制 Agent 负责节点内审、阶段复核与跨工种打回。
- **强化全过程透明与责任追溯**：每个工位都展示输入来源、调用模型、提示词全文、参考素材、输出产物、版本号、审核意见、打回原因和重跑目标，避免 Agent 生产黑盒。
- **强化多级审核机制**：节点内审自动打回，阶段终审由用户确认，最终成片由用户验收。
- **复用 Toonflow 资产**：沿用可编排工作流、剧本 Agent、提示词/模型体系、全局设置中心、Skills 管理与业务产物表。
- **先产出 Figma/HTML 动态原型**：原型必须展示未来工业中控视觉、流水线工位、Agent 分工、分镜专项详情、审核门禁、人工介入、版本追溯和全局设置入口；原型确认后再进入正式开发。

## Capabilities

### New Capabilities

- `harness-architecture`: Harness 工程闭环架构、运行边界、ComfyUI 延后策略。
- `harness-department-agents`: Harness 下的核心工种 Agent 定义、在线编辑和协作契约。
- `harness-business-bridge`: Harness 产物与 Toonflow 现有剧本、资产、分镜、工作台能力的回写与查看入口。
- `harness-review-with-history`: 自动内审、人工终审、驳回重试、版本记录与回滚。
- `harness-control-room-ui`: AI影视智能工作台主控台原型与正式 UI 规范。
- `harness-prompt-driven`: 提示词驱动的导演调度、监制审核与 retryInstruction 生成。

### Modified Capabilities

- `harness-agent-orchestration`: WorkflowRunner 收缩为单任务执行容器，顶层调度由 DirectorOrchestrator 承担。
- `film-production-pipeline`: 从静态线性流程升级为导演 Agent 动态任务图。
- `script-agent`: 剧本能力作为工种 Agent 被 Harness 调度，并将产物写回现有业务。
- `production-agent`: 单一生产 Agent 拆分为多工种协作闭环。

## Impact

- **前端**: 重做 `HarnessControlRoom` 产品结构；移除 ComfyUI 参数面板与直接测试调用；新增导演中枢、任务图、审核门禁、设置入口、版本历史视图。
- **后端**: 保留 HarnessEventBus、TaskGraph、CallbackBridge、ReviewPipeline、DirectorOrchestrator 等核心闭环；第一阶段不得依赖 ComfyUI 服务可用性。
- **设置中心**: 将 Toonflow 的模型、Agent、提示词、Skills、记忆配置作为 Harness 主控台全局设置入口。
- **OpenSpec**: 将原 `harness-comfyui-engine` 从第一阶段实施范围移除，后续另立变更或二期任务接入。
- **验证方式**: 先通过 Figma 与本地 HTML 原型确认交互，再继续正式开发和端到端验证。
