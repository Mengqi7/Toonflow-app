## Harness 引擎核心架构

### 总览

Harness 引擎是 Toonflow 2.0 的调度核心，由 7 个松耦合模块组成，以 DAG 编排器为中枢，Agent 注册表、规则引擎、技能注册表、记忆总线、MCP 连接器和脚本执行器各司其职。

### 1. WorkflowRunner — DAG 编排引擎

**文件**: src/core/harness/WorkflowRunner.ts  
**依赖**: 项目已安装的 graphlib (^2.1.8)

**设计哲学**: 将电影制作流程建模为有向无环图(DAG)，每个节点代表一个 Agent/AI 任务，边代表数据依赖。系统通过 Kahn 算法自动解析拓扑顺序，在依赖满足时最大化并行调度。

**核心数据结构**:

```typescript
// 工作流定义
interface WorkflowDefinition {
  id: string;
  version: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  config?: WorkflowConfig;
}

interface WorkflowNode {
  id: string;                    // 如 "screenwriter.adapt"
  type: "agent" | "script" | "review-gate" | "parallel-fork" | "parallel-join";
  agentRole?: FilmAgentRole;     // Screenwriter / Director / DP / Editor / Sound / etc.
  input: { bindings: Record<string, string>; static?: Record<string, any> };
  output: { keys: string[]; schema?: Record<string, string> };
  config: NodeConfig;
}

interface NodeConfig {
  timeoutMs: number;             // 超时 (默认 300000ms)
  retry: { maxRetries: number; backoffMs: number; backoffMultiplier: number; retryableErrors: string[] };
  reviewGate?: ReviewGateConfig;
  parallelDegree?: number;       // parallel-fork 专用
}

interface ReviewGateConfig {
  reviewerAgentId: string;
  criteria: { name: string; weight: number; threshold: number; description: string }[];
  passThreshold: number;         // 0-1, 默认 0.75
  onReject: "retry" | "skip" | "pause";
}

interface WorkflowEdge { from: string; to: string; condition?: string; }

// 运行时实例
interface WorkflowInstance {
  id: string;
  definitionId: string;
  status: "pending"|"running"|"paused"|"completed"|"failed";
  nodeStates: Map<string, "pending"|"ready"|"running"|"reviewing"|"completed"|"failed"|"skipped">;
  context: WorkflowContext;
}

interface WorkflowContext {
  data: Map<string, Record<string, any>>;  // 所有节点输出
  projectId: number;
  userId: number;
  config: Record<string, any>;
}
```

**WorkflowRunner 核心方法**:

```typescript
class WorkflowRunner {
  private graph: Graph;           // 复用项目现有的 graphlib
  private registry: AgentRegistry;

  // 加载/注册工作流定义，构建 DAG
  async registerWorkflow(def: WorkflowDefinition): Promise<void>;

  // Kahn 算法拓扑排序，返回分层数组 (每层可并行)
  resolveExecutionOrder(): string[][];

  // 启动工作流实例
  async execute(instance: WorkflowInstance): Promise<WorkflowResult>;

  // 单节点执行：收集输入->创建Agent->执行->审核(如需要)
  private async executeNode(node: WorkflowNode, ctx: WorkflowContext): Promise<NodeResult>;

  // 暂停/恢复/取消
  async pause(id: string): Promise<void>;
  async resume(id: string): Promise<void>;
  async cancel(id: string): Promise<void>;

  // 事件: node:state-change, node:progress, workflow:complete
  on(event: string, handler: (...args: any[]) => void): void;
}
```

**执行流程**: 
1. registerWorkflow() 构建 DAG → 2. resolveExecutionOrder() 生成分层执行计划 → 
3. 按层并行: collect upstream outputs → bindInputs() → executeNode() → reviewGate (如配置) → 
4. 更新 WorkflowContext → 5. 处理失败重试 → 6. 进入下一层 → 7. 返回 WorkflowResult


### 2. AgentRegistry — Agent 注册与生命周期

**文件**: src/core/harness/AgentRegistry.ts

采用「文件即注册」模式，延续当前的 src/agents/**/index.ts 约定。每个 Agent 目录导出一个 AgentDescriptor。

```typescript
type AgentCapability = "text-generation"|"image-generation"|"video-generation"|"audio-generation"
  |"composition"|"style-design"|"character-design"|"review"|"editing"|"lighting"|"analysis";

interface AgentDescriptor {
  id: string;
  name: string;
  role: FilmAgentRole;
  capabilities: AgentCapability[];
  dependencies?: string[];       // 依赖的其他 Agent
  factory: (ctx: AgentContext) => Promise<BaseAgent>;
  version: string;
}

interface AgentContext {
  instanceId: string; nodeId: string; projectId: number;
  input: Record<string, any>;
  memoryBus: MemoryBus;
  rulesEngine: RulesEngine;
  skillsRegistry: SkillsRegistry;
  mcpConnector: MCPConnector;
  abortSignal?: AbortSignal;
  config: Record<string, any>;
}

abstract class BaseAgent {
  abstract readonly descriptor: AgentDescriptor;
  async init(ctx: AgentContext): Promise<void> {}
  abstract execute(ctx: AgentContext): Promise<AgentResult>;
  async cleanup(ctx: AgentContext): Promise<void> {}
  // 便捷方法: callAI, useSkill, readMemory, writeMemory
}

interface AgentResult {
  success: boolean;
  data: Record<string, any>;
  artifacts?: string[];         // 生成的文件路径
  metrics?: Record<string, number>;
}

class AgentRegistry {
  private agents: Map<string, AgentDescriptor>;
  async scanAndRegister(): Promise<void>;           // glob src/agents/**/index.ts
  get(id: string): AgentDescriptor;
  findByCapability(cap: AgentCapability): AgentDescriptor[];
  findByRole(role: FilmAgentRole): AgentDescriptor;
  async createInstance(id: string, ctx: AgentContext): Promise<BaseAgent>;
}
```


### 3. RulesEngine — 规则约束注入

**文件**: src/core/harness/RulesEngine.ts

规则 = Markdown + YAML frontmatter，作用域支持 global / agent:<id> / project:<id> / workflow:<id>。在 Agent 初始化时自动加载对应作用域的规则并注入 system prompt。

```typescript
interface Rule {
  id: string; name: string;
  scope: "global"|"agent:<id>"|"project:<id>"|"workflow:<id>";
  priority: number;          // 数字越大优先级越高
  conflictResolution: "override"|"merge"|"append";
  content: string;           // 去掉 frontmatter 后的 Markdown body
}

class RulesEngine {
  async loadRules(): Promise<void>;              // 扫描 data/rules/**/*.md
  watchRules(): void;                            // fs.watch 热加载
  getRulesForAgent(agentId: string): string;     // 获取注入 Agent 的规则文本
  invalidateCache(scope?: string): void;         // 清除缓存
}
```


### 4. SkillsRegistry — 可复用能力

**文件**: src/core/harness/SkillsRegistry.ts

扩展现有 utils/agent/skillsTools.ts，统一使用 Markdown+frontmatter 格式，新增分类(category)字段和 AI SDK tool 自动生成。

```typescript
interface SkillDescriptor {
  id: string; name: string;
  category: "text-generation"|"image-generation"|"video-generation"|"audio-generation"|"analysis"|"utility";
  version: string;
  parameters: { name: string; type: string; required: boolean; description: string; default?: any }[];
  content: string;                              // Markdown body (含 prompt 模板)
  generatedTools?: ToolDefinition[];
}

class SkillsRegistry {
  async scanSkills(): Promise<void>;             // 扫描 data/skills/**/*.md
  getByCategory(cat: string): SkillDescriptor[];
  getToolsForAgent(agentId: string): ToolDefinition[];
  async execute(skillId: string, params: Record<string, any>): Promise<string>;
  watchSkills(): void;                           // fs.watch
}
```


### 5. MemoryBus — 跨 Agent 记忆总线

**文件**: src/core/harness/MemoryBus.ts

在现有 utils/agent/memory.ts 基础上扩展：多命名空间隔离、跨 Agent 共享、LRU 缓存 + SQLite 持久化、本地 embedding RAG。

```typescript
type MemoryNamespace = "system"|"project:<id>"|"agent:<id>"|"workflow:<id>";

interface MemoryEntry {
  id: string; namespace: MemoryNamespace; key: string; value: any;
  type: "short-term"|"long-term"|"summary"|"rag";
  timestamp: number; ttl?: number; embedding?: number[];
}

class MemoryBus {
  async set(entry: Omit<MemoryEntry, "id"|"timestamp">): Promise<string>;
  async get(query: { namespaces?: MemoryNamespace[]; keys?: string[]; type?: string; limit?: number }): Promise<MemoryEntry[]>;
  async getAgentContext(agentId: string, projectId: number): Promise<string>;  // 合并多个命名空间
  async summarize(ns: MemoryNamespace): Promise<string>;                        // AI 压缩
  async semanticSearch(query: string, ns: MemoryNamespace, limit?: number): Promise<MemoryEntry[]>;
  async persist(): Promise<void>;    // 落 SQLite o_memory 表
}
```


### 6. MCPConnector — MCP 客户端

**文件**: src/core/harness/MCPConnector.ts

轻量 MCP 客户端，支持 stdio 和 HTTP 两种传输方式，用于连接 ComfyUI MCP Server、外部模型服务等。

```typescript
interface MCPServerConfig {
  id: string; name: string;
  transport: "stdio"|"http";
  command?: string; args?: string[];   // stdio
  url?: string;                        // http
  autoReconnect: boolean; reconnectIntervalMs: number;
}

class MCPConnector {
  async registerServer(config: MCPServerConfig): Promise<void>;
  async connect(serverId: string): Promise<void>;
  async discoverTools(serverId: string): Promise<MCPTool[]>;
  async invokeTool(serverId: string, toolName: string, params: Record<string, any>): Promise<any>;
  async healthCheck(serverId: string): Promise<boolean>;
  getAllTools(): Map<string, MCPTool[]>;
}
```


### 7. ScriptExecutor — 脚本执行器

**文件**: src/core/harness/ScriptExecutor.ts

处理确定性逻辑（数据转换/文件操作/格式校验），使用项目已有的 vm2 沙箱执行。

```typescript
class ScriptExecutor {
  async execute(script: { id: string; code: string; timeoutMs: number }, ctx: Record<string, any>): Promise<any>;
  async loadBuiltinScripts(): Promise<void>;     // data/scripts/
  registerScript(script: { id: string; code: string }): void;
}
```


---

## 影视 Agent 角色体系详细设计

### Agent 基类 (src/agents/BaseAgent.ts → src/agents/FilmAgent.ts)

所有影视 Agent 继承 `FilmAgent`，它提供统一的 AI 调用、Skill 调用、记忆读写接口。

```typescript
abstract class FilmAgent extends BaseAgent {
  protected aiClient: AIClient;     // utils/ai.ts 封装
  protected memory: MemoryBus;
  protected rules: RulesEngine;
  protected skills: SkillsRegistry;
  protected mcp: MCPConnector;

  // 每个 Agent 必须实现
  abstract getSystemPrompt(): string;         // system prompt (含 rules 注入后)
  abstract getTools(): ToolDefinition[];      // 可用的 AI SDK tools

  // AI 便捷方法
  protected async generateText(prompt: string, opts?: {
    tools?: ToolDefinition[]; temperature?: number; maxTokens?: number;
  }): Promise<string>;

  protected async generateImage(prompt: string, opts?: {
    backend?: "api"|"comfyui"; style?: VisualStyleSpec;
    workflowId?: number; count?: number;
  }): Promise<string[]>;                      // 返回图片 URL 数组

  protected async generateVideo(prompt: string, opts?: {
    backend?: "api"|"comfyui"; duration?: number; style?: VisualStyleSpec;
  }): Promise<string[]>;

  // 审核输出
  protected async reviewOutput(output: any, criteria: ReviewCriterion[]): Promise<ReviewScore>;
}
```


### 各 Agent 详细设计

#### 1. 编剧 Agent (src/agents/screenwriter/ScreenwriterAgent.ts)

**内部子流程**:
```
小说输入
  → [storySkeletonAgent] 提取三/五幕结构、关键情节点
  → [adaptationStrategyAgent] 评估影视类型、确定改编取舍
  → [scriptAgent] 逐场生成剧本 (对白+动作+场景描述)
  → 输出标准格式剧本
```

**System Prompt 关键约束**:
- 保留核心情节和人物弧光，将内心独白转化为动作/对白
- 每场戏格式: 场号 | 场景 | 人物 | 对白 | 动作指示
- 时长控制: 短剧3-5分钟/集、电视剧40-45分钟/集、电影90-120分钟


#### 2. 导演 Agent (src/agents/director/DirectorAgent.ts)

**内部子流程**:
```
剧本输入
  → [styleInference] 分析题材/情绪/时代 → 推断色调/光影/镜头语言 → VisualStyleSpec
  → [storyboardPlanning] 拆解剧本为 shot list (每 shot: 镜头类型+景别+运镜+时长)
  → [qualityControl] 审核 DP/剪辑/成片输出
```

**VisualStyleSpec (核心输出)**:
```typescript
interface VisualStyleSpec {
  colorPalette: {
    primary: string; secondary: string; accent: string;
    temperature: "warm"|"cool"|"neutral";
    saturation: "high"|"medium"|"desaturated";
  };
  lighting: {
    style: "hard"|"soft"|"mixed";
    keyLightDirection: string;       // 如 "top-right-45deg"
    contrastRatio: "high"|"medium"|"low";
  };
  composition: {
    preferredShotTypes: string[];    // ["close-up","medium","wide"]
    ruleOfThirds: boolean;
    symmetry: boolean;
    depthOfField: "shallow"|"medium"|"deep";
  };
  camera: {
    movement: string[];              // ["handheld","dolly","static"]
    preferredAngles: string[];
    lensPreference: string[];        // ["35mm","50mm","85mm"]
  };
  referenceImages?: string[];        // 风格参考图
}
```


#### 3. 摄影指导 DP Agent (src/agents/dp/DPAgent.ts)

**执行流程**:
```
1. 输入: shot item + VisualStyleSpec
2. 读取导演规则约束 (this.rules.getRulesForAgent("director"))
3. 生成构图 prompt (调用 skills.execute("image-composition", {...}))
4. selectBackend(): 根据 cost/quality/customization 选 API 或 ComfyUI
5. generateImage(prompt, { backend }) → 返回图片
6. 输出: { imageUrl, compositionPrompt }
```

**后端选择逻辑**:
```typescript
async selectBackend(shot: ShotItem, style: VisualStyleSpec): Promise<"api"|"comfyui"> {
  // 风格化强 → 优先 ComfyUI (定制化优势)
  if (style.saturation === "desaturated" || shot.type === "close-up") return "comfyui";
  // 有匹配的工作流 → ComfyUI
  const matchingWorkflow = await this.findWorkflow(shot, style);
  if (matchingWorkflow) return "comfyui";
  // 默认 API (速度/质量保障)
  return "api";
}
```


#### 4. 灯光美术 Agent (src/agents/lighting/LightingAgent.ts)

**职责**: 根据导演风格和 DP 构图，生成光影方案和美术设定。  
**输入**: VisualStyleSpec + shot description  
**输出**: LightingSpec { lightSource, lightType, intensity, colorTemp, shadowHardness } + ArtDirectionSpec { sceneElements[], colorAccents[], textureNotes[] }

#### 5. 服装化妆造型 Agent (src/agents/costume/CostumeAgent.ts)

**职责**: 维护角色形象库 (o_character_library 表)，每次生成前检查一致性，生成后审核。  
**核心逻辑**: 对比当前生成图与角色库参考图 → embedding 相似度 → 低于阈值则修正 prompt 重试。

#### 6. 录音/配音 Agent (src/agents/sound/SoundAgent.ts)

**职责**: 解析剧本情绪 → 输出 SoundPlan { voiceActors[], bgm[], sfx[] }，调用 TTS/音乐生成 API。  
**输出**: 时间轴绑定的音频方案。

#### 7. 剪辑 Agent (src/agents/editor/EditorAgent.ts)

**职责**: 根据分镜和生成的素材，输出镜头组接方案。  
**输出 EditTimeline**:
```typescript
interface EditTimeline {
  tracks: EditTrack[]; totalDuration: number; bpm?: number;
}
interface EditTrack {
  clips: EditClip[];
}
interface EditClip {
  shotId: string;
  inPoint: number; outPoint: number;
  transition: "cut"|"dissolve"|"fade"|"wipe";
  transitionDuration: number;
  effects?: { name: string; params: Record<string, any> }[];
}
```

#### 8. 特效 Agent (src/agents/vfx/VFXAgent.ts)

**职责**: 识别需要特效的场景 → 生成 VFX 指导 → 调用视频生成 API 或 ComfyUI 特效工作流。



---

## ComfyUI 集成详细设计

### 架构

```
Toonflow Server
  └─ src/comfyui/
       ├─ ComfyUIClient.ts          HTTP/WS 通信 (localhost:8188)
       ├─ WorkflowParser.ts         JSON 解析 + 参数提取 + 注入
       └─ ComfyUIResultHandler.ts   结果提取 + 文件下载到 oss
```

### 1. ComfyUIClient — API 通信层

**ComfyUI API 端点**:
| 端点 | 方法 | 用途 |
|------|------|------|
| /prompt | POST | 提交工作流 |
| /history/{id} | GET | 查询任务历史/结果 |
| /queue | GET | 查看队列 |
| /interrupt | POST | 中断当前任务 |
| /view | GET | 获取生成图片 |
| /system_stats | GET | GPU 状态 |

```typescript
class ComfyUIClient {
  private baseUrl: string;          // e.g. http://localhost:8188
  private clientId: string;
  private ws: WebSocket | null;

  constructor(config: { baseUrl: string; wsUrl?: string });

  // 提交工作流 (将数组形式转为对象形式)
  async queuePrompt(workflow: WorkflowJSON, params?: Record<string, any>): Promise<string>;

  // 轮询状态 (fallback 方案)
  async pollStatus(promptId: string): Promise<ComfyUIHistoryEntry>;

  // WebSocket 实时进度: 每次进度更新回调
  onProgress(cb: (nodeId: string, progress: number, max: number) => void): void;

  // 获取生成的图片 buffer
  async getImage(filename: string, subfolder: string, type: string): Promise<Buffer>;

  // 上传参考图 (img2img / ControlNet)
  async uploadImage(imagePath: string): Promise<string>;

  async interrupt(): Promise<void>;
  async getSystemStats(): Promise<{ vram_used: number; vram_total: number; device: string }>;
}
```

### 2. WorkflowParser — 工作流解析器

```typescript
interface WorkflowJSON {
  version: number;
  nodes: { id: number; type: string; pos: [number,number]; size: [number,number];
           widgets_values?: any[]; title?: string }[];
  links: [number, number, number, number, number, string][];
  groups?: any[]; config?: any; extra?: any;
}

interface NodeParameterMap {
  nodeId: number; nodeType: string;
  parameters: {
    name: string; widgetName: string;       // widgetName 即 widgets_values 索引
    type: "string"|"number"|"boolean"|"select";
    defaultValue: any; options?: string[]; min?: number; max?: number; step?: number;
  }[];
}

class WorkflowParser {
  parse(json: string): WorkflowJSON;
  extractParameters(wf: WorkflowJSON): NodeParameterMap[];
  injectParameters(wf: WorkflowJSON, params: Record<string, any>): WorkflowJSON;
  validate(wf: WorkflowJSON): { valid: boolean; errors: string[] };
  getInputNodes(wf: WorkflowJSON): ComfyUINode[];    // LoadImage, CheckpointLoader 等
  getOutputNodes(wf: WorkflowJSON): ComfyUINode[];   // SaveImage, VHS_VideoCombine 等
}
```

### 3. ComfyUIResultHandler — 结果处理器

```typescript
class ComfyUIResultHandler {
  // 从 History 提取输出文件列表
  extractOutputs(history: ComfyUIHistoryEntry): GeneratedAsset[];

  // 下载到本地 oss 目录，返回本地路径
  async downloadAssets(assets: GeneratedAsset[], targetDir: string): Promise<string[]>;

  detectOutputType(filename: string): "image"|"video"|"unknown";
}

interface GeneratedAsset {
  filename: string; subfolder: string; type: "image"|"video";
  url: string; localPath?: string;
}
```

### 4. 数据模型

```sql
-- ComfyUI 服务配置
CREATE TABLE o_comfyui_server (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL, baseUrl TEXT NOT NULL, wsUrl TEXT,
  enabled INTEGER DEFAULT 1, createTime INTEGER
);

-- ComfyUI 工作流库
CREATE TABLE o_comfyui_workflow (
  id INTEGER PRIMARY KEY,
  serverId INTEGER REFERENCES o_comfyui_server(id),
  name TEXT NOT NULL, description TEXT,
  type TEXT,                            -- "image"/"video"/"both"
  workflow_json TEXT NOT NULL,          -- 完整 workflow JSON
  parameters TEXT,                       -- 可调参数 JSON (NodeParameterMap[])
  thumbnail TEXT,
  createdBy TEXT,                        -- "user"|"agent"
  createTime INTEGER, updateTime INTEGER
);

-- 角色形象库
CREATE TABLE o_character_library (
  id INTEGER PRIMARY KEY,
  projectId INTEGER REFERENCES o_project(id),
  characterName TEXT NOT NULL,
  description TEXT, referenceImage TEXT, outfitStyle TEXT,
  hairStyle TEXT, accessories TEXT,
  createTime INTEGER, updateTime INTEGER
);

-- 记忆表
CREATE TABLE o_memory (
  id TEXT PRIMARY KEY, namespace TEXT NOT NULL, key TEXT NOT NULL,
  value TEXT NOT NULL, type TEXT NOT NULL,
  timestamp INTEGER NOT NULL, ttl INTEGER, embedding BLOB
);
CREATE INDEX idx_memory_ns ON o_memory(namespace);
CREATE INDEX idx_memory_type ON o_memory(type);
```



---

## 质量审核系统详细设计

### 审核流水线

```
Agent 输出
  → [技术审核] 分辨率/格式/色彩空间/AI瑕疵检测 (规则+程序, ~100ms)
     fail? → 打回重做 (附技术建议)
  → [艺术审核] 构图/风格匹配/光影合理性 (AI 视觉模型)
     fail? → 打回重做 (附艺术建议)
  → [内容审核] 与剧本/分镜描述的一致性 (AI 文本-图像对比)
     fail? → 打回重做 (附匹配建议)
  → ✓ 通过 → 写入 WorkflowContext
```

### 评分模型

```typescript
interface ReviewScore {
  technical: {
    resolution: number;     // 0-1, 分辨率是否达标
    artifacts: number;      // 0-1, AI 瑕疵程度 (反向)
    colorSpace: number;     // 0-1, 色彩空间合理性
    format: number;         // 0-1, 格式符合度
  };
  artistic: {
    composition: number;    // 0-1, 构图评分
    styleMatch: number;     // 0-1, 风格匹配度
    lighting: number;       // 0-1, 光影合理性
    aesthetic: number;      // 0-1, 整体美感
  };
  contentMatch: {
    sceneAccuracy: number;  // 0-1, 场景描述匹配度
    characterMatch: number; // 0-1, 角色一致性
    propAccuracy: number;   // 0-1, 道具/环境匹配
  };
  overall: number;          // 加权总分
  passed: boolean;
  feedback?: string;        // 不通过时的修改建议
}

// 默认权重 (可在项目配置中覆盖)
const WEIGHTS = {
  dimensions: { technical: 0.3, artistic: 0.4, contentMatch: 0.3 },
  technical: { resolution: 0.4, artifacts: 0.3, colorSpace: 0.15, format: 0.15 },
  artistic: { composition: 0.3, styleMatch: 0.3, lighting: 0.2, aesthetic: 0.2 },
  contentMatch: { sceneAccuracy: 0.5, characterMatch: 0.3, propAccuracy: 0.2 },
};
```

### 打回重做机制

```typescript
interface RetryInstruction {
  targetAgentId: string;
  originalOutput: any;
  failedCriterion: string;       // 失败的具体标准名
  failedScore: number;
  suggestions: string[];         // AI 生成的修改建议 (可直接用作 prompt 补充)
  priorityParams: Record<string, any>;  // 建议调整的参数
  attemptNumber: number;
  maxAttempts: number;           // 默认 3
}

// 重试修复 prompt (AI 动态生成):
// "以下内容未通过审核 [{criterion}], 得分 {score}。
//  原始需求: {requirement}
//  生成结果: {output}
//  请输出: 1.失败原因 2.修改建议 3.应调整的参数"
```

### 审核 Agent 配置

```typescript
// 每个 review-gate 节点配置一个审核 Agent (通常是 Director Agent 的审核子模块)
// 审核 Agent 使用 skills.execute("image-review", { image, requirement, style })
// → 返回 ReviewScore
```


---

## 制作流程 DAG 定义

### 完整电影制作流水线 (data/workflows/film-production.yaml)

```yaml
id: film-production
version: "1.0"
config:
  globalTimeoutMs: 3600000
  parallelLimit: 4

nodes:
  # === 阶段1: 剧本 ===
  - id: screenwriter.analyze
    type: agent
    agentRole: screenwriter
    config: { timeoutMs: 300000, retry: { maxRetries: 2, backoffMs: 10000 } }
    output: { keys: [novelAnalysis] }
  - id: screenwriter.adapt
    type: agent
    agentRole: screenwriter
    input: { bindings: { analysis: "${screenwriter.analyze.novelAnalysis}" } }
    output: { keys: [adaptationStrategy] }
  - id: screenwriter.generate
    type: agent
    agentRole: screenwriter
    input: { bindings: { strategy: "${screenwriter.adapt.adaptationStrategy}" } }
    output: { keys: [script] }
  - id: review.script
    type: review-gate
    input: { bindings: { content: "${screenwriter.generate.script}" } }
    config: { reviewGate: { reviewerAgentId: director, criteria: [{ name: completeness, weight: 0.4, threshold: 0.8 }, { name: format, weight: 0.3, threshold: 0.9 }, { name: dialogue, weight: 0.3, threshold: 0.7 }], passThreshold: 0.75, onReject: retry } }

  # === 阶段2: 风格+分镜 ===
  - id: director.style
    type: agent
    agentRole: director
    input: { bindings: { script: "${screenwriter.generate.script}" } }
    output: { keys: [visualStyle] }
  - id: review.style
    type: review-gate
    input: { bindings: { content: "${director.style.visualStyle}" } }
    config: { reviewGate: { reviewerAgentId: director, criteria: [{ name: coherence, weight: 0.5, threshold: 0.8 }, { name: genreMatch, weight: 0.5, threshold: 0.8 }], passThreshold: 0.8, onReject: retry } }
  - id: director.storyboard
    type: agent
    agentRole: director
    input: { bindings: { script: "${screenwriter.generate.script}", style: "${director.style.visualStyle}" } }
    output: { keys: [storyboardPlan] }

  # === 阶段3: 并行画面生成 ===
  - id: generate.shots.fork
    type: parallel-fork
    input: { bindings: { items: "${director.storyboard.storyboardPlan.shots}" } }
    config: { parallelDegree: 4 }
  - id: generate.shot.unit
    type: agent
    agentRole: dp
    input: { bindings: { shot: "${item}", style: "${director.style.visualStyle}" } }
    output: { keys: [imageUrl, compositionPrompt] }
  - id: review.image
    type: review-gate
    input: { bindings: { content: "${generate.shot.unit}", reference: "${director.storyboard.storyboardPlan}" } }
    config: { reviewGate: { criteria: [{ name: resolution, weight: 0.3, threshold: 0.9 }, { name: composition, weight: 0.3, threshold: 0.7 }, { name: styleMatch, weight: 0.4, threshold: 0.75 }], passThreshold: 0.75, onReject: retry } }
  - id: generate.shots.join
    type: parallel-join

  # === 阶段4: 剪辑+音频 ===
  - id: editor.assemble
    type: agent
    agentRole: editor
    input: { bindings: { shots: "${generate.shots.join}", plan: "${director.storyboard.storyboardPlan}" } }
    output: { keys: [editTimeline] }
  - id: sound.design
    type: agent
    agentRole: sound
    input: { bindings: { script: "${screenwriter.generate.script}", timeline: "${editor.assemble.editTimeline}" } }
    output: { keys: [soundPlan] }

  # === 阶段5: 并行视频生成 ===
  - id: generate.videos.fork
    type: parallel-fork
    input: { bindings: { items: "${editor.assemble.editTimeline.clips}" } }
    config: { parallelDegree: 2 }
  - id: generate.video.unit
    type: agent
    agentRole: dp
    input: { bindings: { clip: "${item}", style: "${director.style.visualStyle}" } }
    output: { keys: [videoUrl] }
  - id: review.video
    type: review-gate
    input: { bindings: { content: "${generate.video.unit}" } }
    config: { reviewGate: { criteria: [{ name: videoQuality, weight: 0.4, threshold: 0.75 }, { name: motionSmoothness, weight: 0.3, threshold: 0.7 }, { name: styleConsistency, weight: 0.3, threshold: 0.8 }], passThreshold: 0.75, onReject: retry } }
  - id: generate.videos.join
    type: parallel-join

  # === 阶段6: 终剪 ===
  - id: final.assemble
    type: script
    scriptId: final-render
    input: { bindings: { timeline: "${editor.assemble.editTimeline}", videos: "${generate.videos.join}", audio: "${sound.design.soundPlan}" } }

edges:
  # 阶段1
  - { from: screenwriter.analyze, to: screenwriter.adapt }
  - { from: screenwriter.adapt, to: screenwriter.generate }
  - { from: screenwriter.generate, to: review.script }
  # 阶段2
  - { from: review.script, to: director.style }
  - { from: director.style, to: review.style }
  - { from: review.style, to: director.storyboard }
  # 阶段3
  - { from: director.storyboard, to: generate.shots.fork }
  - { from: generate.shots.fork, to: generate.shot.unit }
  - { from: generate.shot.unit, to: review.image }
  - { from: review.image, to: generate.shots.join }
  # 阶段4
  - { from: generate.shots.join, to: editor.assemble }
  - { from: editor.assemble, to: sound.design }
  # 阶段5
  - { from: sound.design, to: generate.videos.fork }
  - { from: generate.videos.fork, to: generate.video.unit }
  - { from: generate.video.unit, to: review.video }
  - { from: review.video, to: generate.videos.join }
  # 阶段6
  - { from: generate.videos.join, to: final.assemble }
```


---

## 文件结构全景

```
src/
├── core/harness/
│   ├── WorkflowRunner.ts        # DAG 编排引擎
│   ├── AgentRegistry.ts         # Agent 注册表 (glob src/agents/**/index.ts)
│   ├── RulesEngine.ts           # 规则引擎 (data/rules/**/*.md)
│   ├── SkillsRegistry.ts        # 技能注册表 (data/skills/**/*.md)
│   ├── MemoryBus.ts             # 跨 Agent 记忆总线 + RAG
│   ├── MCPConnector.ts          # MCP 客户端 (stdio/http)
│   ├── ScriptExecutor.ts        # 沙箱脚本执行器 (vm2)
│   ├── types.ts                 # 共享类型
│   └── index.ts
├── agents/
│   ├── FilmAgent.ts             # Agent 基类
│   ├── screenwriter/            # 编剧 (复用+扩展现有 scriptAgent)
│   ├── director/                # 导演 (核心: styleInference + storyboardPlanning)
│   ├── dp/                      # 摄影指导
│   ├── lighting/                # 灯光美术
│   ├── costume/                 # 服装化妆造型
│   ├── sound/                   # 录音配音
│   ├── editor/                  # 剪辑
│   └── vfx/                     # 特效
├── comfyui/
│   ├── ComfyUIClient.ts         # API 通信
│   ├── WorkflowParser.ts        # 工作流解析
│   ├── ComfyUIResultHandler.ts  # 结果处理
│   └── index.ts
├── review/
│   ├── ReviewPipeline.ts        # 审核流水线编排
│   ├── TechnicalReviewer.ts     # 技术审核 (规则+程序)
│   ├── ArtisticReviewer.ts      # 艺术审核 (AI 视觉)
│   └── ContentReviewer.ts       # 内容审核 (AI 文本-图像)
└── routes/                      # REST API (保持现有 file-based routing)
    └── comfyui/                 # ComfyUI 管理 API

data/
├── workflows/                   # 工作流 DAG 定义 (YAML)
│   ├── film-production.yaml
│   ├── tv-series-production.yaml
│   └── short-drama-production.yaml
├── rules/                       # Agent 规则 (Markdown+frontmatter)
│   ├── director_style.md
│   ├── dp_composition.md
│   └── costume_consistency.md
└── skills/                      # Agent Skills (扩展现有)
    ├── image_composition.md
    ├── lighting_design.md
    └── character_design.md
```

---

# 实现状态审计 (2026-06-28)

## 总体评估：架构骨架完成 47%，核心业务链路多处断连

设计文档中的 125 项任务，实际代码完成 59 项 (47%)。缺失最严重的是：
1. **Agent ↔ ComfyUI 执行链路**（占位符返回，无法出图/视频）
2. **审核系统评分**（全部硬编码，无 AI 参与）
3. **5 个 Agent 空壳**（Lighting/Costume/Sound/Editor/VFX 各仅 12-15 行）
4. **Harness 未接入主应用**（app.ts 无任何初始化调用）

## 关键缺口清单

### P0 — 阻断性缺陷
- Harness 引擎未在 app.ts 初始化 (AgentRegistry.scanAndRegister() 未被调用)
- FilmAgent.generateImage/Video 的 ComfyUI 分支返回 placeholder
- YAML 工作流无法加载 (WorkflowRunner 无 YAML 解析器)

### P1 — 高优先级
- ArtisticReviewer / ContentReviewer 全部硬编码评分
- o_workflow_state 表未创建，工作流崩溃无法恢复
- 分 Agent 审核标准未实现

### P2 — 中优先级
- LightingAgent / CostumeAgent / SoundAgent / EditorAgent / VFXAgent 空壳
- o_review_report / o_review_preference 表未创建
- TemplateLibrary 为 0 模版
- SkillsRegistry.execute() 未调用 AI

## 修复路径

参见 `tasks.md` 详细清单，按 P0 → P1 → P2 顺序修复。
