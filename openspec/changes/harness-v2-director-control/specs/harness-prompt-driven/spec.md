# harness-prompt-driven — 提示词驱动机制

> 本 spec 定义全流程由 LLM + 提示词驱动的机制: 调度决策、审核决策、驳回决策全部交给 LLM。

## 新增需求 (ADDED Requirements)

### 需求: 调度决策必须由导演 Agent 的 LLM 生成

系统 SHALL 由 DirectorOrchestrator 调用 LLM 决策"下一步派哪个工种", 而非静态 DAG 顺序。

#### 场景: 编剧完成, LLM 决策派副导演
- **WHEN** ScreenwriterAgent 的 task.completed 事件到达
- **THEN** DirectorOrchestrator 构造 prompt: 当前任务图 + 已完成任务 + 用户意图
- **AND** 调用 LLM (gpt-4o-mini 或同类)
- **AND** LLM 输出 JSON `{ action: "dispatch", nextTask: { agentRole: "assistant_director", input: {...} }, message: "剧本已完成, 即将派副导演拆解分镜" }`

#### 场景: LLM 决策失败降级到 YAML 模板
- **WHEN** LLM 返回的 JSON 无法解析或 action 无效
- **THEN** DirectorOrchestrator 降级到 YAML 模板的下一个 pending 节点
- **AND** 不崩溃 Harness

### 需求: 审核决策必须由监制 Agent 的 LLM 生成

系统 SHALL 由 SupervisorAgent 调用 LLM 决策"通过/打回/升级用户"。

#### 场景: DP 图片评分通过, LLM 决策 approve
- **WHEN** ReviewPipeline 完成 3 阶段评分, overall=0.85
- **THEN** SupervisorAgent 构造 prompt: 评分 + 失败维度 + 历史驳回记录
- **AND** LLM 输出 `{ action: "approve" }`

#### 场景: 评分失败, LLM 决策 reroute
- **WHEN** overall=0.58, composition 维度失败
- **THEN** LLM 输出 `{ action: "reroute", targetAgent: "dp", retryInstruction: { suggestions: ["..."] } }`

### 需求: 驳回建议必须由 LLM 生成中文人可读文本

系统 SHALL 由 LLM 生成中文修改建议, 不使用硬编码模板。

#### 场景: 构图失败的建议
- **WHEN** SupervisorAgent 决策 reroute, 需要生成 suggestions
- **THEN** LLM 输出 3-5 条中文建议, 如: "1. 主体位于画面右侧 1/3; 2. 增加前景书桌虚化做纵深; 3. 主光源左前方 45°"
- **AND** 这些建议作为 retryInstruction.suggestions 传给目标 Agent

### 需求: 用户对话意图必须由 LLM 解析为任务

系统 SHALL 由导演 Agent 的 LLM 把用户自然语言输入解析为可执行任务。

#### 场景: 用户说"把场 3 对白改短一些"
- **WHEN** 用户在对话窗口输入"把场 3 对白改短一些"
- **THEN** DirectorOrchestrator 调用 LLM 解析意图
- **AND** LLM 输出 `{ action: "dispatch", nextTask: { agentRole: "screenwriter", input: { stage: "revise", scene: 3, retryInstruction: { suggestions: ["场 3 对白缩短 30%"] } } } }`

#### 场景: 用户说"跳过服装环节直接生图"
- **WHEN** 用户输入"跳过服装环节直接生图"
- **THEN** LLM 输出 `{ action: "reroute", skipAgents: ["costume", "makeup"], nextTask: { agentRole: "dp", ... } }`

### 需求: 提示词模板必须从 data/skills/ 加载

系统 SHALL 把所有提示词模板放在 `data/skills/<role>/*.md`, 由 SkillsRegistry 加载并注入 Agent system prompt。

#### 场景: DP Agent 加载构图提示词模板
- **WHEN** DPAgent.init() 被调用
- **THEN** SkillsRegistry 加载 `data/skills/dp/composition_prompt.md`
- **AND** 注入到 DPAgent 的 system prompt 末尾

#### 场景: 提示词模板热加载
- **WHEN** 开发者修改 `data/skills/dp/composition_prompt.md`
- **THEN** SkillsRegistry 的 fs.watch 触发热加载
- **AND** 下次 DPAgent.init() 使用新模板

### 需求: LLM 输出必须用 JSON Schema 约束

系统 SHALL 用 JSON Schema 约束 LLM 的决策输出, 避免格式错误。

#### 场景: 导演决策的 JSON Schema
- **WHEN** DirectorOrchestrator 调用 LLM
- **THEN** 使用 response_format JSON Schema:
  ```json
  {
    "type": "object",
    "properties": {
      "action": { "enum": ["dispatch", "wait", "ask_user", "reroute", "complete"] },
      "nextTask": { "type": "object" },
      "userPrompt": { "type": "string" },
      "message": { "type": "string" }
    },
    "required": ["action", "message"]
  }
  ```
- **AND** LLM 输出符合 schema, 无需正则解析

### 需求: 确定性逻辑必须用代码 (scripts) 而非 LLM

系统 SHALL 把确定性逻辑 (FFmpeg 合并、数据转换、参数注入、文件操作) 放在 `data/scripts/*.js`, 不交给 LLM。

#### 场景: 最终成片合并用 FFmpeg
- **WHEN** EditorAgent 完成时间轴, 需要合并视频+音频
- **THEN** 调用 `scriptExecutor.execute("final-render", { timeline, videos, audio })`
- **AND** final-render.js 用 FFmpeg 合并, 不调用 LLM
