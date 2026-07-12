## Why

当前 Harness V2 demo 把多个阶段、Agent、产物和设置入口压在同一屏，用户看到的是工具堆叠，而不是一套可对话、可调度、可追溯的 AI 影视生产内核。我们需要重构成更清晰的产品骨架，让人通过对话发起任务，让 Agent 自动进入对应阶段，并把剧本、人物、场景、分镜、视频、审核结果沉淀为可版本化的产物链。

## What Changes

- 重做工作台信息架构为三层：对话中枢、阶段工作台、产物仓库。
- 移除第一阶段主控台对 ComfyUI 的直接调用、参数编辑、测试运行和 workflow 切换。
- 强化 Harness 内核边界：DirectorOrchestrator 负责调度，WorkflowRunner 负责单任务执行，ReviewPipeline 负责审核，CallbackBridge 负责回写。
- 为每个阶段建立独立产物承载位，覆盖剧本、人物、场景道具、分镜、视频、音轨和审核报告。
- 增加案例工程流程，作为用户理解 Harness 的默认入口。
- 借鉴 LaperAI 的阶段化组织、对话驱动和版本历史表达，但保留 Toonflow 自有流程和 Harness 内核实现。

## Capabilities

### New Capabilities
- `harness-artifact-warehouse`: 产物仓库、版本链、对比、回滚和阶段索引。
- `harness-chat-orchestration-ui`: 对话中枢、内联决策卡、自动调度反馈与用户确认。
- `harness-stage-workbench`: 剧本 / 人物 / 场景道具 / 分镜 / 视频 / 音频的阶段工位视图。

### Modified Capabilities
- `harness-architecture`: 调度分层、阶段流转、内核职责边界改为对话驱动的生产内核。
- `harness-department-agents`: Agent 从“角色列表”升级为“自动进场的阶段工位”。
- `harness-business-bridge`: 产物回写要覆盖阶段产物仓库和版本历史。
- `harness-review-with-history`: 审核与版本历史服务于阶段工作台和回滚链路。
- `harness-prompt-driven`: LLM 负责意图解析、调度、审核建议和重试指令生成。
- `harness-control-room-ui`: 主控台布局与交互结构全面重构。
- `harness-agent-orchestration`: WorkflowRunner / DirectorOrchestrator 的职责边界重新收口。
- `film-production-pipeline`: 从静态流程改为可回写、可审阅、可重跑的电影工业闭环。
- `script-agent`: 剧本阶段输出成为后续人物、场景、分镜的上游输入。
- `production-agent`: 拆分为多个阶段工位和可追溯产物链。

## Impact

- **前端**: 重构 `HarnessControlRoom` 的页面结构、导航和信息层级，新增对话区、阶段区、仓库区。
- **后端**: 保留 `HarnessEventBus`、`DirectorOrchestrator`、`WorkflowRunner`、`CallbackBridge`、`ReviewPipeline` 等核心模块，但重新定义职责。
- **数据**: 强化 `o_artifact_version`、`o_workflow_state`、`o_review_report`、`o_character_library`、`o_scene_library`、`o_prop_library` 的阶段化语义。
- **OpenSpec**: 本次 change 以 Harness V2 重构为主，不再把 ComfyUI 当作第一阶段核心能力。
