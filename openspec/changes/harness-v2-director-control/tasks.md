# Harness V2 Director Control - 实施任务

> **当前状态**: 需求重定向与原型验证阶段  
> **重要决策**: 暂停旧 demo 继续开发；第一阶段移除主控台对 ComfyUI 的直接调用；原型确认后再重启正式开发。

## 0. 需求重定向与范围修订

- [x] 0.1 重新确认第一阶段目标：完成 Harness 工程基础闭环，而不是先做 ComfyUI 调用面板
- [x] 0.2 修订 proposal.md，明确 ComfyUI 延后到后续迭代
- [x] 0.3 修订 design.md，定义 AI影视智能工作台的信息架构与阶段边界
- [x] 0.4 修订 harness-control-room-ui spec，移除主控台 ComfyUI 直接调用场景
- [x] 0.5 从当前 change 中移除 harness-comfyui-engine 第一阶段 spec

## 1. 原型验证

- [x] 1.1 创建 Figma 原型文件
- [x] 1.2 在 Figma 中搭建主控台、审核门禁、Agent/设置、流程导览核心画面
- [ ] 1.3 为 Figma 画面补齐可点击原型连线
- [x] 1.4 重做本地 HTML 动态原型，支持场景切换和门禁决策演示
- [x] 1.5 本地原型关键词检查通过：无 ComfyUI 直接调用控件、参数面板、测试运行或 workflow 切换控件
- [x] 1.6 将原型升级为未来工业工厂中控风格，展示发光管线、细分 Agent 工位、右侧审核/监控面板和底部分镜轨道
- [x] 1.7 补充分镜专项详情：镜头时间轴、提示词全文、模型参数、参考素材、审核日志、多版本对比
- [x] 1.8 补充全过程透明工位详情：输入信息、工作过程、产物输出、审核闭环、打回重跑链路
- [ ] 1.9 与用户确认原型是否符合 AI影视智能工作台定位

## 2. 前端工作台重启开发

- [x] 2.1 基于新原型重构 `HarnessControlRoom.vue` 工厂中控式工作台布局
- [x] 2.2 移除当前前端中的 ComfyUI 参数快照、测试运行按钮和直接调用文案
- [x] 2.3 重做终审决策与事件流交互，支持 `director.user_input_required` / 用户决策 / 本地 demo fallback
- [x] 2.4 重做 Agent 任务图，展示调度类、执行类、审核类细分 Harness Agent 工位和子任务状态
- [x] 2.5 重做产物追溯视图，显示产物 ID、生成 Agent、审核 Agent、模型、提示词与版本链
- [x] 2.6 重做审核门禁面板，支持通过、打回、跨工种打回、人工修改后再审
- [x] 2.7 重做全局设置入口，跳转或打开 Toonflow 设置中心的模型、Agent、提示词、Skills、记忆配置
- [x] 2.8 重做流程导览视图，展示输入、规划、执行、内审、门禁、驳回、版本追溯闭环

## 3. 前端事件与接口对接

- [x] 3.1 复核 `useHarnessEventStream` 的 SSE 去重、重连和事件分发
- [x] 3.2 对接 `task.started`、`task.completed`、`callback.persisted`、`review.scored`、`review.reroute`、`version.created`
- [x] 3.3 对接 `POST /api/harness/control/:id/message`
- [x] 3.4 对接 `POST /api/harness/control/:id/user-input`
- [x] 3.5 对接暂停、恢复、取消 Harness 实例操作
- [x] 3.6 在 API 未完成时提供清晰的本地 demo fallback，不伪装为真实 ComfyUI 调用

## 4. 后端闭环能力补齐

- [x] 4.1 复核 DirectorOrchestrator 是否能从用户输入生成或更新 TaskGraph
- [x] 4.2 复核 WorkflowRunner 是否只承担单任务执行容器职责
- [x] 4.3 复核 CallbackBridge 是否能把核心产物写回 Toonflow 业务表
- [x] 4.4 复核 ReviewPipeline 与质量监制 Agent 是否能生成审核报告和 retryInstruction
- [x] 4.5 实现阶段终审门禁所需的 `director.user_input_required`
- [x] 4.6 实现跨工种打回事件 `review.reroute`
- [x] 4.7 实现版本记录读取与回滚的最小闭环

## 5. 验证

- [x] 5.1 `npm run build-only` 通过
- [x] 5.2 `npm run type-check` 执行；仍被既有 `generate copy.vue` 阻塞，记录为非本次变更问题
- [x] 5.3 浏览器打开 `http://127.0.0.1:50188/#/harness/control/demo`
- [x] 5.4 验证主控台不再出现 ComfyUI 参数面板和直接调用按钮
- [x] 5.5 验证 Agent 工位图、工位详情、分镜专项、审核门禁、设置入口、追溯链均可见
- [x] 5.6 验证用户终审决策能更新界面状态
- [x] 5.7 验证移动或窄屏下文字不重叠、不溢出

## 6. 文档与交付

- [x] 6.1 在最终说明中附上 Figma 原型链接
- [x] 6.2 在最终说明中附上本地 HTML 原型路径
- [x] 6.3 记录 Figma MCP Starter plan 限制导致的未完成交互连线
- [ ] 6.4 原型确认后，再继续正式开发任务

