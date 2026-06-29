## ADDED Requirements

### Requirement: ComfyUI 服务管理
系统 MUST 将 ComfyUI 作为与模型 API 同级的服务提供者管理，支持多 Server 配置、连接测试、启用/禁用。

#### Scenario: 添加 ComfyUI Server
- **WHEN** 用户在设置中配置 ComfyUI server: name="本地 ComfyUI", baseUrl="http://192.168.1.100:8188"
- **THEN** 系统调用 ComfyUIClient.getSystemStats() 验证连接，成功后写入 o_comfyui_server 表，返回 { id, status: "connected", gpu: "RTX 4090 24GB" }。如果连接失败（超时/403/404），返回 { status: "unreachable", suggestion: "请确认 ComfyUI 已启动，端口 8188 未被防火墙阻挡" }

#### Scenario: 多 Server 负载均衡
- **WHEN** 用户配置了两个 ComfyUI Server: 本地 RTX 4090 + 远程 A100
- **THEN** DP Agent 的 selectBackend() 查询所有 enabled server 的 GPU 状态，选择 vram_free 最高且类型匹配的 server（生视频优先选 A100，生图优先本地 RTX 4090）。任务提交时携带 serverId，ComfyUIClient 路由到指定 server


### Requirement: 工作流版本管理
系统 MUST 对导入的 ComfyUI 工作流进行版本追踪，支持参数修改后创建新版本、版本间 Diff、回退到历史版本。

#### Scenario: 工作流修改后自动版本化
- **WHEN** Agent 调整了工作流中 KSampler 的 steps: 20→30 并保存
- **THEN** 系统不直接覆盖原 workflow_json，而是创建新版本: o_comfyui_workflow_version 表插入新行 { workflowId, version: 2, workflow_json: "...", changedParams: [{ nodeId: 3, param: "steps", old: 20, new: 30 }], createdBy: "agent/dp", createTime }。o_comfyui_workflow.workflow_json 更新为最新版本

#### Scenario: 版本回退
- **WHEN** 用户发现 v3 版本的工作流生成效果不如 v2，点击"回退到 v2"
- **THEN** 系统将 workflow_json 替换为 v2 内容，创建一条 version:4 的新记录（标记 restoredFrom: v2），而非直接删除 v3。保留完整的历史链

#### Scenario: 版本 Diff 对比
- **WHEN** 用户查看工作流版本历史
- **THEN** 前端展示版本列表: v1(原始导入) → v2(DP Agent 调整 steps) → v3(用户调整 CFG Scale) → v4(回退到 v2)。点击任意两个版本对比，高亮显示差异节点和参数


### Requirement: GPU 资源感知调度
系统 MUST 实时监控 ComfyUI Server 的 GPU 使用情况，在资源不足时自动排队，避免 OOM。

#### Scenario: VRAM 容量调度
- **WHEN** ComfyUIClient.getSystemStats() 返回 { vram_total: 24576, vram_used: 21000, device: "RTX 4090" }，只剩 3.5GB
- **THEN** 新提交的任务在工作流解析后估算所需 VRAM（checkpoint 大小 + latent 尺寸），超过 3GB 的加入等待队列。队列中任务按优先级排序: 当前制作流程的任务 > 测试任务，生图 > 生视频（视频占用更大）

#### Scenario: OOM 后的优雅恢复
- **WHEN** ComfyUI 任务在生成过程中因 VRAM 不足而崩溃（node_errors 包含 "CUDA out of memory"）
- **THEN** ComfyUIClient 捕获错误，将任务状态置为 failed_with_recovery。系统自动: 1) 调用 interrupt() 清理 ComfyUI 状态 2) 等待 5s 让 VRAM 释放 3) 降低参数（latent size 减半 / batch_size=1）后重新提交。如果连续 3 次 OOM，标记为永久失败，通知用户"该工作流对当前 GPU 来说过重，建议简化或使用云端 API"


### Requirement: 工作流智能推荐
系统 MUST 根据当前任务特征（shot 类型、风格要求、内容类型）自动匹配最合适的工作流。

#### Scenario: 根据 shot 类型推荐工作流
- **WHEN** DP Agent 需要为 shot type="close-up" + style.saturation="desaturated" 生成画面
- **THEN** Agent 查询 o_comfyui_workflow 表，按匹配度排序: 1) type=image + 参数包含 ip-adapter（适合风格化特写）2) 用户标记为"特写专用"的工作流 3) 通用文生图工作流。返回 top 3 供 Agent 选择（或自动选第 1 个）

#### Scenario: 用户标记和搜索
- **WHEN** 用户导入一个新的 ComfyUI 工作流
- **THEN** 系统自动解析 workflow_json 提取: type(image/video)、主要节点类型(checkpoint/sampler/controlnet)、分辨率偏好。用户可补充标签: ["日系动漫", "特写", "高细节"]。之后可通过标签/节点类型/创建者搜索


### Requirement: 错误诊断与自动修复
当 ComfyUI 任务失败时，系统 MUST 自动诊断错误类型并尝试修复，而非简单报错。

#### Scenario: 模型缺失诊断
- **WHEN** ComfyUI 返回 node_errors: { "4": { "errors": [{ "message": "Cannot find model 'sd_xl_base_1.0.safetensors'" }] } }
- **THEN** WorkflowParser 定位到 node #4 (CheckpointLoaderSimple)，提取缺失的模型名。Agent 检查 o_comfyui_workflow 中是否有其他工作流使用了该模型 → 如果有，提示用户需要下载；如果没有，尝试在工作流模板库中查找替代模型并自动替换 ckpt_name 参数

#### Scenario: 自定义节点缺失
- **WHEN** ComfyUI 返回 "Cannot execute because node ComfyUI-Impact-Pack is not installed"
- **THEN** 系统解析依赖的节点包名，在提示中展示"该工作流需要安装 ComfyUI-Impact-Pack"，并提供: 1) GitHub 链接 2) ComfyUI Manager 安装命令 3) 替换方案（用内置节点等效实现）


### Requirement: 混合渲染策略
系统 MUST 支持同一制作流程中混合使用模型 API 和 ComfyUI，Agent 按规则自动分配。

#### Scenario: 按镜头类型分配后端
- **WHEN** 导演的分镜计划包含: 30% close-up（需高细节）、40% medium（标准）、30% wide（背景复杂）
- **THEN** DP Agent 的 selectBackend() 逻辑: close-up→ComfyUI（细节可控性好），medium→API（速度快），wide→ComfyUI（场景一致性需要 ControlNet）。最终 60% ComfyUI + 40% API，项目设置中展示混合策略的成本估算

#### Scenario: 后端切换不影响流水线
- **WHEN** 某个 shot 原定使用 API 生成，但因风格复杂切换为 ComfyUI
- **THEN** 切换对上游（导演/storyboard）和下游（review/editor）透明。DP Agent 的 output 格式统一: { imageUrl, backend, generationTime, promptUsed }。下游 Agent 不关心后端来源

#### Scenario: 成本感知选择
- **WHEN** 用户设置月度预算上限 ¥500
- **THEN** selectBackend() 额外检查成本: 模型 API 每次生成 ¥0.05 vs ComfyUI 电费 ¥0.01。当预算使用超过 80% 时，系统倾向于 ComfyUI；预算耗尽时全部使用 ComfyUI。用户可随时切换为"无视成本-质量优先"模式
