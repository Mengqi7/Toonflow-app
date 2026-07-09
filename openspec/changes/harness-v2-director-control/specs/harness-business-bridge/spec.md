# harness-business-bridge — Harness 与业务集成

> 本 spec 定义 Harness 产物回写到现有业务表 (o_script / o_storyboard / o_assets / o_character_library / o_scene_library / o_prop_library) 的契约与并发安全。

## ADDED Requirements

### Requirement: CallbackBridge 必须把 Agent 产物回写到对应业务表

系统 SHALL 提供 CallbackBridge 模块, 在每个 task.completed 事件后, 把 Agent 的结构化输出写入对应业务表。

#### Scenario: 编剧产物写入 o_script
- **WHEN** ScreenwriterAgent 发出 task.completed, `data.script` 包含 8 场戏
- **THEN** CallbackBridge 解析场号, 插入 8 行 `o_script`
- **AND** 每行包含 `projectId` / `sceneNumber` / `content` / `source="harness"` / `instanceId`

#### Scenario: DP 产物写入 o_assets 和 o_storyboard
- **WHEN** DPAgent 发出 task.completed, `data.images` 包含 4 张图
- **THEN** CallbackBridge 插入 4 行 `o_assets` (type=image)
- **AND** 更新 4 行 `o_storyboard.imageUrl`

#### Scenario: 服装产物写入 o_character_library
- **WHEN** CostumeAgent 发出 task.completed
- **THEN** CallbackBridge upsert `o_character_library`, 字段包含 characterName / outfit / hairStyle / accessories / makeup / referenceImage

### Requirement: CallbackBridge 写入必须幂等

系统 SHALL 使用确定性唯一键做幂等 upsert, 避免重试时产生重复行。

#### Scenario: 重试的 DP 任务不产生重复 o_assets 行
- **WHEN** DPAgent 因审核失败被重新派活, 生成同一 shotId 的新图
- **THEN** CallbackBridge 使用 upsert 键 `(projectId, source="harness", shotId)`
- **AND** 更新已有行而非插入新行

### Requirement: 业务表必须有 source 字段区分来源

系统 SHALL 在所有业务表新增 `source` 字段, 取值 "harness" / "manual" / "agent"。

#### Scenario: 业务页面过滤 Harness 产物
- **WHEN** 用户在 `#/script` 页面选择"仅显示 Harness 生成"
- **THEN** 前端查询 `WHERE source = "harness"`
- **AND** 仅显示 Harness 生成的剧本

### Requirement: Harness 事件必须推送到业务页面

系统 SHALL 通过 SSE 把 Harness 事件推送到所有打开的页面 (包括业务页面), 业务页面监听事件实时刷新。

#### Scenario: 用户在 #/cornerScape 页面, Harness 生图完成
- **WHEN** DPAgent 完成 shot_3 的生图, CallbackBridge 写入 o_assets
- **THEN** HarnessEventBus 发出 `callback.persisted` 事件
- **AND** SSE 推送到 #/cornerScape 页面
- **AND** 该页面立即显示 shot_3 的新图, 无需手动刷新

### Requirement: Harness 主控台必须复用业务页面组件

系统 SHALL 要求 Harness 主控台的 7 个步骤子组件复用现有业务页面的 Vue 组件, 不维护第二套 UI。

#### Scenario: StageScriptEditor 复用 #/script 的 ScriptTable
- **WHEN** 主控台渲染 `<StageScriptEditor>`
- **THEN** 该组件 import `src/views/script/components/ScriptTable.vue`
- **AND** 传入 `source="harness"` prop 过滤 Harness 生成的剧本
- **AND** 不重新实现剧本表格 UI

#### Scenario: StageShotImageGrid 复用 #/cornerScape 的批量生图 UI
- **WHEN** 主控台渲染 `<StageShotImageGrid>`
- **THEN** 该组件 import `src/views/cornerScape/components/...`
- **AND** 显示 Harness 生图进度和缩略图
