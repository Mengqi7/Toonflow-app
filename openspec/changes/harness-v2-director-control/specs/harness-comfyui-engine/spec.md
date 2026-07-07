# harness-comfyui-engine — ComfyUI 模块完全重写

> 本 spec 定义 ComfyUI 模块的完全重写: 服务管理 / 工作流库 / 参数编辑 / 执行 / 后端选择 / 资产处理, 并与 Harness 集成。

## 新增需求 (ADDED Requirements)

### 需求: ComfyUIServerManager 必须支持多服务管理与健康检查

系统 SHALL 提供 ComfyUIServerManager, 支持添加/删除/列出多个 ComfyUI 服务, 并定期健康检查。

#### 场景: 添加 ComfyUI 服务
- **WHEN** 用户在 `#/comfyui/server` 页面提交 `{ name: "本地 SDXL", baseUrl: "http://127.0.0.1:8188", wsUrl: "ws://127.0.0.1:8188/ws" }`
- **THEN** ComfyUIServerManager 插入 `o_comfyui_server` 表
- **AND** 立即调用 healthCheck 验证连通性
- **AND** 返回 `{ healthy: true, vram: 8192, queue: 0 }`

#### 场景: 健康检查失败标记不健康
- **WHEN** ComfyUI 服务无响应超过 5 秒
- **THEN** ComfyUIServerManager 标记该服务 `healthy: false`
- **AND** BackendSelector 不再选择该服务

#### 场景: 负载均衡选择服务
- **WHEN** BackendSelector 请求一个 ComfyUI 服务
- **THEN** ComfyUIServerManager 按 strategy (round-robin / least-load / most-vram) 返回最优服务
- **AND** 跳过 `healthy: false` 的服务

### 需求: WorkflowLibrary 必须支持工作流 CRUD 与版本管理

系统 SHALL 提供 WorkflowLibrary, 支持工作流导入/列表/更新/删除/版本回滚。

#### 场景: 导入新工作流
- **WHEN** 用户上传 ComfyUI workflow JSON
- **THEN** WorkflowLibrary 解析 JSON, 提取参数, 插入 `o_comfyui_workflow`
- **AND** 自动生成缩略图 (用默认参数跑一次)

#### 场景: 更新工作流创建新版本
- **WHEN** 用户修改工作流 JSON
- **THEN** WorkflowLibrary 在 `o_comfyui_workflow_version` 表插入新版本
- **AND** 当前版本号 +1

#### 场景: 回滚到历史版本
- **WHEN** 用户点击"回滚到 v2"
- **THEN** WorkflowLibrary 把 v2 的 JSON 复制为当前版本
- **AND** 创建 v4 (新版本号) 作为回滚结果

### 需求: ParameterEditor 必须正确提取和注入参数 (兼容两种 API 格式)

系统 SHALL 提供 ParameterEditor, 自动识别 ComfyUI 工作流中可配置参数, 兼容 `widgets_values` 和 `inputs` 两种 API 格式。

#### 场景: 提取参数 (widgets_values 格式)
- **WHEN** ParameterEditor 解析一个 ComfyUI 工作流, 节点 4 的 widgets_values = ["{{prompt}}", "negative"]
- **THEN** 提取参数 `{ id: "prompt", name: "提示词", nodeId: 4, widgetName: "prompt", type: "string", injectVia: "widgets_values" }`

#### 场景: 提取参数 (inputs 格式)
- **WHEN** 节点 6 的 inputs = `{ seed: 12345, steps: 20, cfg: 7 }`
- **THEN** 提取参数 `{ id: "seed", nodeId: 6, widgetName: "seed", type: "number", defaultValue: 12345, injectVia: "inputs" }`

#### 场景: 注入参数
- **WHEN** DPAgent 调用 WorkflowExecutor 执行工作流, 传入 `{ prompt: "美丽女性" }`
- **THEN** ParameterEditor 根据 `injectVia` 字段决定注入方式
- **AND** widgets_values 格式: 修改 `node.widgets_values[0] = "美丽女性"`
- **AND** inputs 格式: 修改 `node.inputs.prompt = "美丽女性"`

#### 场景: 参数校验
- **WHEN** 用户提交参数 `{ steps: 150 }` 但 schema 定义 `max: 100`
- **THEN** ParameterEditor 返回 `{ valid: false, errors: ["steps 不能超过 100"] }`

### 需求: WorkflowExecutor 必须提交执行并实时推送进度

系统 SHALL 提供 WorkflowExecutor, 提交工作流到 ComfyUI, 通过 WebSocket 接收进度, 下载结果。

#### 场景: 执行工作流并接收进度
- **WHEN** DPAgent 调用 `WorkflowExecutor.execute(workflowId, params, onProgress)`
- **THEN** WorkflowExecutor 提交到 ComfyUI `/prompt` 端点
- **AND** 通过 WebSocket 接收进度, 每次回调 `onProgress(nodeId, progress, max)`
- **AND** 完成后下载生成的图片到 `production/<projectId>/`
- **AND** 返回 `{ promptId, outputs: [{filename, localPath}], executionTime, vramUsed }`

#### 场景: 中断执行
- **WHEN** 用户点击"取消生成"
- **THEN** WorkflowExecutor 调用 ComfyUI `/interrupt` 端点
- **AND** 发出 task.failed 事件, 原因为 "cancelled"

### 需求: BackendSelector 必须根据 shot 类型智能选择 API 或 ComfyUI

系统 SHALL 提供 BackendSelector, 根据 shot 类型、风格强度、用户偏好自动选择后端。

#### 场景: close-up 特写优先 ComfyUI
- **WHEN** shot.shotType = "close-up" 且 ComfyUI 可用
- **THEN** BackendSelector 返回 `{ backend: "comfyui", workflowId: <portrait_workflow_id>, reason: "特写镜头使用 IP-Adapter 保证角色一致性" }`

#### 场景: 风格化强优先 ComfyUI
- **WHEN** style.colorPalette.saturation = "desaturated"
- **THEN** BackendSelector 返回 `{ backend: "comfyui", reason: "强风格化场景使用 ComfyUI 定制工作流" }`

#### 场景: ComfyUI 不可用降级到 API
- **WHEN** 所有 ComfyUI 服务 unhealthy
- **THEN** BackendSelector 返回 `{ backend: "api", apiModel: "1:default", reason: "ComfyUI 不可用, 降级到 API" }`

#### 场景: 用户指定偏好
- **WHEN** 用户在主控台设置 "所有生图用 ComfyUI"
- **THEN** BackendSelector 返回 `{ backend: "comfyui", reason: "用户偏好" }`

### 需求: AssetProcessor 必须下载产物并写入 o_assets

系统 SHALL 提供 AssetProcessor, 从 ComfyUI 下载生成的图片/视频, 写入 `o_assets` 表。

#### 场景: 下载图片并写入 o_assets
- **WHEN** WorkflowExecutor 返回 `{ outputs: [{filename: "ComfyUI_001.png", subfolder: "output"}] }`
- **THEN** AssetProcessor 调用 ComfyUI `/view` 端点下载图片
- **AND** 保存到 `production/<projectId>/<uuid>.png`
- **AND** 生成缩略图 `production/<projectId>/thumb_<uuid>.png`
- **AND** 插入 `o_assets` 行: `{ type: "image", url: "<path>", thumbnailUrl: "<thumb_path>", source: "harness", instanceId }`

### 需求: ComfyUI 管理前端页面必须可用

系统 SHALL 提供三个 ComfyUI 管理页面: 服务管理 / 工作流库 / 工作流详情。

#### 场景: 服务管理页面
- **WHEN** 用户访问 `#/comfyui/server`
- **THEN** 显示所有 ComfyUI 服务列表, 每行包含: 名称 / baseUrl / 健康状态 / VRAM / 队列数 / 操作按钮
- **AND** 点击"添加服务"弹出表单

#### 场景: 工作流详情页面
- **WHEN** 用户访问 `#/comfyui/workflow/3`
- **THEN** 显示工作流基本信息 (名称/类型/版本)
- **AND** 按节点分组显示参数编辑器 (string→文本框, number→滑块, select→下拉)
- **AND** 每个参数标注"注入方式"
- **AND** 提供"测试运行"按钮

#### 场景: 测试运行
- **WHEN** 用户在工作流详情页点击"测试运行"
- **THEN** 用当前参数执行工作流
- **AND** 实时显示进度
- **AND** 完成后显示生成的图片缩略图
