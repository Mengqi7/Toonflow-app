# film-production-pipeline (二轮 delta)

> 来自一阶段。本 spec 是 delta 增量, 描述"静态 YAML DAG → 导演 Agent 动态任务图"的能力变更。

## MODIFIED Requirements

### Requirement: 工作流不再由 YAML 驱动, 而由导演 Agent 规划

系统 SHALL 满足本需求。

**替换** (来自一阶段): "工作流定义由 data/workflows/*.yaml 静态驱动"

系统 SHALL 把 YAML 工作流定义视为可选模板, 而非主要调度机制。主要调度 SHALL 由 DirectorOrchestrator 用 LLM 决策动态任务图完成。

#### Scenario: DirectorOrchestrator 动态生成任务图
- **WHEN** Harness 实例启动, 输入小说
- **THEN** DirectorOrchestrator LLM 决策工种序列 (如: screenwriter → assistant_director → [costume, makeup, set_decorator 并行] → dp → vfx → [editor, sound_designer 并行])
- **AND** 动态任务图可能因小说内容不同而异 (如 玄幻小说 触发更多 vfx 任务)

#### Scenario: YAML 模板作为降级方案
- **WHEN** DirectorOrchestrator 的 LLM 不可用或返回无效 JSON
- **THEN** 降级到 YAML 模板的下一个 pending 节点

### Requirement: 导演 Agent 决定跨工种依赖

系统 SHALL 满足本需求。

**替换** (来自一阶段): "Edges are statically defined in YAML"

系统 SHALL 允许导演 Agent 在运行时插入临时依赖, 如"DP 构图失败后, 依赖编剧重写场 3"。

#### Scenario: reroute 注入新依赖边
- **WHEN** SupervisorAgent 决策 DP 失败应打回给编剧
- **THEN** DirectorOrchestrator 在动态任务图中插入 `screenwriter.revise` 任务
- **AND** 该任务依赖原 DP 任务的失败结果
- **AND** 失败任务完全解决后才派发新任务
