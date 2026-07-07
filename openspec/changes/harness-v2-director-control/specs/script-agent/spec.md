# script-agent (二轮 delta)

> 来自一阶段。本 spec 是 delta 增量, 描述 ScreenwriterAgent 升级为"剧本工种"。

## 修改的需求 (MODIFIED Requirements)

### 需求: 编剧 Agent 由导演 Agent 调度, 不再由静态 DAG 调度

**替换** (来自一阶段): "Screenwriter 是 WorkflowRunner 调度链路上的第一个 agent 节点"

系统 SHALL 由 DirectorOrchestrator 调用 ScreenwriterAgent, 而非静态 DAG 节点。其 execute() 接收 `ctx.input.novel` 和 `ctx.input.stage`。

#### 场景: 导演 Agent 派活编剧
- **WHEN** DirectorOrchestrator LLM 决策下一步是编剧
- **THEN** 调用 `dispatchTask({ agentRole: "screenwriter", static: { stage: "generate" }, bindings: { novel: "<novel text>" } })`
- **AND** ScreenwriterAgent 产出剧本, CallbackBridge 写入 o_script

### 需求: 编剧输出必须是标准格式可解析

**增加** (来自一阶段): "Screenwriter 输出 字符串剧本"

系统 SHALL 要求 ScreenwriterAgent 的 `data.script` 可被 `ScriptParser.parseIntoScenes(text)` 解析为 N 个场景对象, 每个 `{ sceneNumber, location, characters[], dialogue[], action, durationSec }`。

#### 场景: 解析 8 场戏
- **WHEN** Screenwriter 返回 `data.script` 包含 8 场戏
- **THEN** ScriptParser 提取 8 个场景对象
- **AND** CallbackBridge 插入 8 行 o_script
- **AND** 解析失败时抛 `AgentExecutionError("script_parse_failed")`

### 需求: 编剧必须支持重写指定场次

**增加** (来自一阶段): "Screenwriter 一次性产出"

系统 SHALL 支持重新派活 ScreenwriterAgent 时, 通过 retryInstruction 仅重写指定场次, 不影响其他场。

#### 场景: 用户请求重写场 3
- **WHEN** 导演 Agent 收到用户消息"场 3 对白太啰嗦"
- **THEN** 重新派活 ScreenwriterAgent, retryInstruction.suggestions = ["场 3 对白缩短 30%"]
- **AND** 仅重写场 3, 其他场次不变
- **AND** 新场 3 通过 CallbackBridge 幂等 upsert 覆盖原行
