## Why

Toonflow 当前的架构是"两 Agent 流水线 + 手动操作前端"的模式，用户在每一步都需要在前端界面操作（选模型、调参数、审核结果）。要达到"AI 全流程自动化影视制作"的目标，需要一次根本性的架构升级——引入 **Harness 多 Agent 协同调度引擎**，将电影工业的专业角色分工映射为 Agent 体系，实现从小说到成片的端到端自动化，人只在关键节点审核。

## What Changes

- **Harness Agent 协同引擎**：Workflow + Agent + Rules + Skills + Script + Memory + MCP 七要素紧密协作的新架构核心
- **影视制作全流程 Agent 角色**：编剧、导演、副导演、摄影指导(DP)、灯光美术、服装/化妆/造型、录音、演员、剪辑、特效等 10+ 专业化 Agent
- **ComfyUI 集成模块**：与现有模型服务同级的 ComfyUI 模块，支持导入工作流、参数调节、结果解析
- **ComfyUI 工作流 Agent**：Codex 辅助项目，能根据小说内容自动开发/调试/优化 ComfyUI 工作流
- **导演风格引擎**：导演 Agent 根据品味自动推理设计视觉风格，不再局限于内置风格模板
- **多级质量审核系统**：每个制作环节自动审核，质量不达标自动打回重做
- **人机交互模式升级**：用户从"操作软件"变为"审阅导演交付物"

## Capabilities

### New Capabilities
- `harness-agent-orchestration`: Harness 多 Agent 协同调度引擎，含 Workflow 编排、Agent 注册/发现、Rules 引擎、Skills 注册表、Memory 总线、MCP 连接器
- `film-production-pipeline`: 影视制作全流程流水线，包含编剧→分镜→拍摄→后期全环节 Agent 角色
- `comfyui-integration`: ComfyUI 模块集成，与模型 API 同级的服务提供者，支持工作流导入/参数调节/结果解析
- `quality-review-system`: 多级质量审核与自动打回重做系统
- `director-style-engine`: 导演风格推理引擎，根据剧本内容自动设计视觉风格方案
- `comfyui-workflow-agent`: 独立的 ComfyUI 工作流开发辅助项目，AI 自动创建/调试工作流

### Modified Capabilities
- `script-agent`: 编剧 Agent 从简单小说→剧本转换升级为多角色协作（编剧+导演联合创作）
- `production-agent`: 制作 Agent 从单一流水线升级为由导演/DP/灯光/美术/服装/剪辑等多 Agent 协同的摄制组模式

## Impact

- 核心架构：`src/core/Harness/` 新增 Harness 引擎
- Agent 体系：`src/agents/` 从 2 个扩展至 15+ 个
- 前端 UI：从操作型界面迁移为审核型 Dashboard
- 依赖新增：ComfyUI server 通信协议、MCP SDK
- 独立项目：`toonflow-comfyui-agent` ComfyUI 工作流开发助手

## 当前进度 (2026-06-28 审计)

**整体完成度: 47%** (59/125 项任务)

| 模块 | 完成度 | 关键缺口 |
|------|--------|----------|
| Harness 核心引擎 | 75% | YAML加载器、状态持久化、app.ts接入 |
| 影视 Agent 体系 | 40% | 5个Agent空壳、ComfyUI链路断开 |
| ComfyUI 集成 | 55% | API层完成、执行链路placeholder |
| 质量审核系统 | 25% | 评分全硬编码、表未创建 |
| 制作流程 DAG | 60% | YAML无法加载 |
| 导演风格引擎 | 50% | 管理API缺失 |
| 前端升级 | 0% | 在独立仓库 |
| ComfyUI Agent | 20% | 模板库为空 |

详见 `tasks.md` 完整任务清单和 `design.md` 实现状态审计。
