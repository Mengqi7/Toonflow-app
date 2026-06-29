## ADDED Requirements

### Requirement: Toonflow 集成 API 契约
comfyui-workflow-agent MUST 通过标准化 MCP 协议与 Toonflow 主项目通信，提供工作流生成/测试/优化三个核心端点。

#### Scenario: 通过 MCP 调用生成工作流
- **WHEN** 用户在 Toonflow 中点击"AI 生成 ComfyUI 工作流"，描述"生成一个日系赛博朋克风格的文生图工作流，支持 IP-Adapter 参考图输入，输出 1024x1536 竖屏"
- **THEN** Toonflow 通过 MCPConnector 调用 mcp://comfyui-workflow-agent/generateWorkflow，参数: { style: "japanese-cyberpunk", features: ["ip-adapter", "portrait-1024x1536"] }。Agent 返回 { workflowJson: "{...}", suggestedParams: {...}, requiredModels: [...], estimatedVRAM: "8GB", previewImageBase64: "..." }

#### Scenario: 工作流测试
- **WHEN** Agent 生成了工作流，Toonflow 调用 mcp://comfyui-workflow-agent/testWorkflow
- **THEN** Agent 在沙箱环境中: 1) 验证 JSON 格式完整性 2) 模拟 ComfyUI 节点依赖检查 3) 使用最小配置生成测试图（512x512, steps=10）4) 返回 { testPassed: true, testImageBase64, generationTime: 3.2s, warnings: ["建议增加 ControlNet 节点以提升参考图效果"] }

#### Scenario: 工作流优化迭代
- **WHEN** 测试生成效果不理想（构图模糊），Toonflow 调用 mcp://comfyui-workflow-agent/optimizeWorkflow
- **THEN** Agent 分析失败原因: "采样步数不足 + CFG Scale 过低"。自动调整: steps 10→30, cfg 7→9.5，重新测试。最多迭代 5 次（防止无限循环）。返回最佳版本的 workflowJson 和优化历史


### Requirement: 安全沙箱
comfyui-workflow-agent MUST 在受限沙箱内运行，防止生成的 workflow JSON 或测试代码对系统造成危害。

#### Scenario: 节点白名单验证
- **WHEN** Agent 生成的工作流中包含节点类型 "MaliciousNode"
- **THEN** 安全验证器比对白名单（内置节点 + 知名社区节点如 ControlNet/IPAdapter/AnimateDiff），发现 MaliciousNode 不在白名单中，拒绝该工作流并提示"节点 'MaliciousNode' 未通过安全验证"

#### Scenario: 文件路径注入防护
- **WHEN** Agent 生成的工作流中某文件路径为 "../../../etc/passwd"
- **THEN** 路径规范器检测到路径遍历，自动清洗为安全的相对路径（相对于 ComfyUI input 目录），并记录安全告警日志

#### Scenario: 资源限制
- **WHEN** Agent 生成的测试任务请求生成 8192x8192 的超大图片
- **THEN** 系统强制将测试分辨率限制在 1024x1024 以内，防止沙箱资源耗尽。用户正式使用时不受测试限制


### Requirement: 自定义节点知识库
Agent MUST 维护一个可更新的自定义节点知识库，了解 ComfyUI 生态中常用自定义节点的参数和使用方式。

#### Scenario: 知识库更新
- **WHEN** ComfyUI 社区发布了新的自定义节点 "AdvancedLivePortrait"
- **THEN** 管理员（或自动爬虫）更新节点知识库，添加: { nodeName, category, parameters: [...], compatibleModels: [...], exampleWorkflows: [...] }。Agent 之后可以识别并在生成工作流时使用该节点

#### Scenario: 节点缺失时的智能替代
- **WHEN** Agent 想使用 IPAdapterAdvanced 但知识库显示该节点可用，用户 ComfyUI 却没有安装
- **THEN** Agent 自动降级: 检测 IPAdapter（基础版）在知识库中可用，且提供 80% 的功能覆盖。生成的工作流使用 IPAdapter 替代 IPAdapterAdvanced，并在返回中标注"建议安装 IPAdapterAdvanced 以获得完整功能"


### Requirement: 工作流模板库管理
系统 MUST 内置和维护一个分层工作流模板库，从基础（Primitive）到高级（Complex），Agent 优先在模板基础上修改而非从零创建。

#### Scenario: 模板库层级
- **WHEN** Agent 需要生成工作流
- **THEN** 模板库结构: Level 1 (Primitive: 文生图/图生图/文生视频) → Level 2 (Standard: +ControlNet/+IPAdapter/+LoRA) → Level 3 (Complex: AnimateDiff/Deforum/区域提示词) → Level 4 (Custom: 用户上传的定制工作流)。Agent 选择最接近的模板作为起点，调整参数而非重建节点结构

#### Scenario: 从用户工作流学习
- **WHEN** 用户手动创建了一个高质量的工作流并标记"可共享"
- **THEN** 系统分析该工作流的节点结构和参数配置，提取为模板元数据: { type, features, avgQualityScore, usagePattern }。该模板加入 Level 4 模板库，供后续 Agent 和用户参考


### Requirement: 工作流版本控制与发布
Agent 生成的工作流 MUST 有版本管理，支持从 Toonflow 侧追溯和回退。

#### Scenario: 工作流发布流程
- **WHEN** Agent 完成工作流优化，质量评分 > 0.8
- **THEN** 系统为该工作流创建版本记录: { version, workflowJson, testResult, parameters, createdAt, createdBy: "agent" }。用户在 Toonflow 中看到"Agent 推荐了一个优化版工作流(v3)，测试评分 0.85"，可选择: 1) 接受并设为当前版本 2) 与当前版本对比 3) 拒绝

#### Scenario: 工作流迭代历史
- **WHEN** 一个工作流历经 v1(初始生成)→v2(Agent 优化)→v3(用户手动调整)→v4(Agent 再次优化)
- **THEN** 完整历史链可追溯: 每版记录 { parentVersion, changes, testScore, creator }。用户可查看优化轨迹: "v1→v2: 增加采样步数(20→30), CFG(7→9.5), 评分+0.12 | v2→v3: 用户添加 ControlNet Depth, 评分+0.08 | v3→v4: Agent 替换 sampler 为 DPM++ 2M Karras, 评分+0.05"
