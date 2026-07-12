## Why

当前 Harness UI 把 Agent、任务和审核状态放在一个控制室里，用户看见的是调度系统，而不是正在制作的剧本、场次、人物、道具、地点和分镜。下一阶段需要把 Harness 退到后台，重建一个由对话驱动的影视领域工作台，让 AI 能理解当前页面上下文，自动读取和填充业务对象，并把每次操作写回 Toonflow 的真实数据。

本 change 不复制 LaperAI 的源码或私有实现，而是实现其可观察的产品机制：项目上下文、右侧 AI 对话、阶段工作区、结构化工具调用、产物回写、版本历史和用户确认。

## What Changes

- **BREAKING** 将当前“未来工业中控室”降级为开发监控页；用户主工作台继续复用 Toonflow 现有小说、剧本 Agent、剧本管理、塑角造景和视频生产页面，并升级为 LaperAI 风格的对话驱动工作台。
- 新增统一的项目 / 剧集 / 场次 / 节拍 / 分镜 / 人物 / 道具 / 地点上下文模型。
- 将聊天窗口升级为真正的 AI Director 操作中枢，而不是普通消息组件。
- 新增强类型 Agent Tool Runtime，允许 AI 读取、创建、修改、生成、审核和确认业务对象。
- 新增领域事件和 UI Patch 协议，让 AI 操作可以实时反映到当前页面。
- 保留 Toonflow 现有剧本、分镜、角色、资产、视频和剪辑能力，并统一为可被工具调用的领域服务。
- 保留并升级 Harness 的 DirectorOrchestrator、TaskGraph、WorkflowRunner、ReviewPipeline、CallbackBridge、MemoryBus 和 EventBus。
- 新增统一 Artifact Graph，串联剧本、人物、场景、道具、分镜图、视频、音频和版本历史。
- 生成后端采用 Provider Adapter，第一阶段不在 UI 暴露 ComfyUI 控制面板。

## Capabilities

### New Capabilities
- `conversational-workbench`: 对话驱动的影视项目工作台和 AI Director 交互。
- `project-context-engine`: 项目上下文解析、当前页面状态和选中对象上下文。
- `agent-tool-runtime`: Agent 工具注册、参数校验、执行计划、审批、重试和事件回写。
- `artifact-domain-graph`: 影视领域对象、产物关系、版本和来源追踪。
- `film-workspace-ui`: 项目导航、剧本 / 节拍 / 场次 / 分镜 / 人物 / 道具 / 地点 / 资产工作区。
- `generation-provider-adapter`: 文本、图片、视频、音频生成服务的统一适配层。

### Modified Capabilities

本 change 通过新增能力重组现有 Harness 模块，不直接删除现有 Harness 内核能力；现有内核的行为调整由新能力的集成场景覆盖。

## Impact

- **前端**: 不在 `HarnessControlRoom.vue` 继续建设用户功能。在 `Toonflow-web/src/pages/workbench` 共享壳层嵌入常驻 AI Director，并让现有 `/novel`、`/scriptAgent`、`/script`、`/cornerScape`、`/production`、`/assets` 页面接入上下文、选择状态和实时刷新。
- **后端**: 在 `Toonflow-app/src/core/harness` 上增加 Context Engine、Tool Runtime、Command Executor 和 Domain Event 映射。
- **业务服务**: 将现有剧本、分镜、资产、角色、场景、道具和视频接口封装为可被 Agent 调用的领域工具。
- **数据层**: 统一实体 ID、项目关系、产物版本、操作记录和来源信息。
- **模型层**: 继续复用现有模型配置、Agent 部署、Prompt、Skills 和 Memory 设置。
- **范围**: 第一阶段不提供 ComfyUI 参数编辑、workflow 切换或直接服务器控制。
