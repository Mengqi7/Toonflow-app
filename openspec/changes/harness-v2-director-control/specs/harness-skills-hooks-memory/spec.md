# harness-skills-hooks-memory — Skills / Hooks / Memory 规范

> 本 spec 定义 Harness 的 skills (提示词模板)、hooks (生命周期钩子)、memory (跨 Agent 共享记忆) 三大要素。

## ADDED Requirements

### Requirement: Skills 必须按工种分类存放在 data/skills/<role>/

系统 SHALL 把每个工种的提示词模板放在 `data/skills/<role>/*.md`, 由 SkillsRegistry 自动扫描加载。

#### Scenario: DP 工种的 skills 目录
- **WHEN** SkillsRegistry 扫描 `data/skills/dp/`
- **THEN** 加载以下文件:
  - `composition_prompt.md` (构图 prompt 生成模板)
  - `backend_selection.md` (后端选择规则)
  - `character_consistency.md` (角色一致性检查)
- **AND** 每个文件有 frontmatter (id/name/category/parameters)

#### Scenario: skill 注入到 Agent system prompt
- **WHEN** DPAgent.init() 被调用
- **THEN** `skillsRegistry.getToolsForAgent("dp")` 返回 ToolDefinition[]
- **AND** DPAgent.getSystemPrompt() 末尾追加 skills 内容

### Requirement: Skills 必须支持热加载

系统 SHALL 用 fs.watch 监听 `data/skills/` 目录变更, 自动重新加载。

#### Scenario: 修改 skill 文件后立即生效
- **WHEN** 开发者修改 `data/skills/dp/composition_prompt.md` 并保存
- **THEN** SkillsRegistry 的 watcher 触发 reload
- **AND** 下次 DPAgent.init() 使用新模板
- **AND** 不需要重启服务

### Requirement: Hooks 必须支持 5 个生命周期钩子

系统 SHALL 在 `src/core/harness/Hooks.ts` 提供 5 个钩子: beforeTask / afterTask / onReview / onReroute / onUserConfirm。

#### Scenario: beforeTask 钩子记录任务开始日志
- **WHEN** WorkflowRunner 准备执行一个任务
- **THEN** 调用 `hooks.beforeTask(taskNode, instance)`
- **AND** 钩子可修改 taskNode.input (如注入额外的 memory 上下文)

#### Scenario: onReview 钩子记录审核事件
- **WHEN** ReviewPipeline 完成 3 阶段审核
- **THEN** 调用 `hooks.onReview(agentId, output, score)`
- **AND** 钩子把审核事件写入 MemoryBus 供后续学习

#### Scenario: onReroute 钩子通知用户
- **WHEN** SupervisorAgent 决策 reroute
- **THEN** 调用 `hooks.onReroute(fromAgent, toAgent, retryInstruction)`
- **AND** 钩子发出 `review.reroute` HarnessEvent

#### Scenario: onUserConfirm 钩子暂停 Harness
- **WHEN** DirectorOrchestrator 发出 `director.user_input_required`
- **THEN** 调用 `hooks.onUserConfirm(prompt, options)`
- **AND** 钩子暂停 Harness 调度循环

### Requirement: Memory 必须支持多命名空间隔离

系统 SHALL 在 MemoryBus 支持多命名空间: system / project:<id> / agent:<id> / workflow:<id> / event:<instanceId>。

#### Scenario: 角色库记忆写入 agent:costume 命名空间
- **WHEN** CostumeAgent 产出服装方案
- **THEN** `memoryBus.set({ namespace: "agent:costume", key: "char_1:outfit", value: <spec>, type: "long-term" })`

#### Scenario: DP 读取跨命名空间上下文
- **WHEN** DPAgent 准备生成图片
- **THEN** `memoryBus.getAgentContext("dp", projectId)` 合并读取:
  - `system` 命名空间 (全局规则)
  - `project:<id>` 命名空间 (项目配置)
  - `agent:dp` 命名空间 (DP 专属记忆)
  - `agent:costume` 命名空间 (服装设定, 跨 Agent 共享)
- **AND** 返回拼接的上下文字符串, 注入到 system prompt

### Requirement: Memory 必须持久化到 o_memory 表

系统 SHALL 把所有 memory 写入持久化到 SQLite `o_memory` 表, 服务重启后可恢复。

#### Scenario: 长期记忆持久化
- **WHEN** `memoryBus.set({ type: "long-term", ... })` 被调用
- **THEN** 立即写入 `o_memory` 表 (id / namespace / key / value / type / timestamp)
- **AND** 服务重启后 `memoryBus.get()` 可读取

#### Scenario: 事件记忆用于 SSE 重放
- **WHEN** HarnessEventBus 发出事件
- **THEN** 异步写入 `o_memory` (namespace=`event:<instanceId>`, type=`event`)
- **AND** SSE 断线重连时用 `Last-Event-ID` 重放

### Requirement: Memory 必须支持 TTL 自动清理

系统 SHALL 允许 memory 条目设置 TTL (生存时间), 过期自动清理。

#### Scenario: 短期记忆 1 小时后清理
- **WHEN** `memoryBus.set({ type: "short-term", ttl: Date.now() + 3600000, ... })`
- **THEN** 1 小时后该条目被 `memoryBus.cleanup()` 删除
- **AND** 不影响 long-term 类型条目

### Requirement: Skills 必须可转换为 AI SDK Tool

系统 SHALL 让 SkillsRegistry 把 skill 定义转换为 AI SDK 的 ToolDefinition, 供 Agent 在 LLM 调用时使用。

#### Scenario: DP 的 composition_prompt skill 转为 tool
- **WHEN** DPAgent 调用 `skillsRegistry.getToolsForAgent("dp")`
- **THEN** 返回 `[{ type: "function", function: { name: "composition_prompt", description: "生成英文构图 prompt", parameters: {...} } }]`
- **AND** DPAgent 可在 LLM 调用中作为 tool 使用
