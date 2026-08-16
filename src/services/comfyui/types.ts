/**
 * ComfyUI 服务模块 - 通用类型定义
 *
 * 设计原则：不依赖任何特定工作流或节点类型，
 * 通过动态分析实现对所有 ComfyUI 工作流的自适应支持。
 */

// ============================================================
// 1. 原始 ComfyUI 数据结构
// ============================================================

/** ComfyUI 工作流中的原始节点（标准 API 格式） */
export interface ComfyNodeRaw {
  id: string;
  class_type?: string;
  type?: string;               // 某些自定义节点使用 type 而非 class_type
  inputs?: Record<string, any>;
  outputs?: Record<string, any>;
  widgets_values?: any[];
  _meta?: {
    title?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

/** 工作流连接（链路） */
export interface ComfyLink {
  from: string;       // 源节点 ID
  fromOutput: number; // 源节点输出端口索引
  to: string;         // 目标节点 ID
  toInput: number;    // 目标节点输入端口索引
}

/** 完整的工作流 JSON 结构 */
export interface ComfyWorkflowJSON {
  nodes?: Record<string, ComfyNodeRaw>;
  links?: ComfyLink[];
  [key: string]: any;
}

// ============================================================
// 2. 分析后的节点分类
// ============================================================

/** 输入字段的语义类型 */
export type FieldSemanticType =
  | "text"        // 文本输入（prompt, negative, text 等）
  | "image"       // 图片输入（image, reference_image, first_frame 等）
  | "resolution"  // 分辨率（width/height 对）
  | "seed"        // 随机种子
  | "sampler"     // 采样器参数（steps, cfg, denoise 等）
  | "model"       // 模型加载
  | "condition"   // 条件输入
  | "latent"      // 潜空间输入
  | "duration"    // 视频时长
  | "output"      // 输出节点
  | "unknown";    // 未知类型

/** 节点中的一个可注入参数字段 */
export interface InjectField {
  key: string;               // 字段在 inputs/widgets_values 中的键
  label: string;             // 人类可读标签
  semanticType: FieldSemanticType;
  currentValue: any;         // 当前默认值
  valueType: "string" | "number" | "boolean" | "array" | "object";
  required?: boolean;
  description?: string;
}

/** 分析后的节点信息 */
export interface AnalyzedNode {
  id: string;
  classType: string;          // class_type || type
  title: string;              // _meta.title || id
  role: FieldSemanticType;    // 这个节点在工作流中的主要角色
  injectFields: InjectField[];// 可注入的参数字段列表
  isOutput: boolean;          // 是否是输出节点
  isTerminal: boolean;        // 是否是终端节点（没有下游消费者）
  promptPolarity?: "positive" | "negative"; // 文本提示节点的极性（正/负提示词）
}

// ============================================================
// 3. 参数 Schema（工作流分析结果）
// ============================================================

/** 用户可配置的输入参数定义 */
export interface ParamDefinition {
  name: string;               // 参数名称（如 "prompt", "negative_prompt", "seed"）
  label: string;              // 显示标签
  type: "string" | "number" | "boolean" | "image";
  required: boolean;
  default?: any;
  description?: string;
  /** 注入目标：哪个节点的哪个字段 */
  injectTargets: {
    nodeId: string;
    fieldKey: string;
    valueType: "inputs" | "widgets_values_index";  // 注入到 inputs 还是 widgets_values 索引
  }[];
}

/** 输出定义 */
export interface OutputDefinition {
  type: "image" | "video" | "batch_images";
  nodeId: string;             // 输出节点 ID
  nodeClassType: string;      // SaveImage / PreviewImage / SaveVideo / VHS_VideoCombine
  description?: string;
}

/** 完整的工作流参数 Schema */
export interface WorkflowSchema {
  workflowId: string;
  workflowName: string;
  workflowType: "image" | "video";
  totalNodes: number;
  inputs: ParamDefinition[];   // 用户需要提供的参数
  outputs: OutputDefinition[]; // 工作流产生的输出
  rawAnalysis: WorkflowAnalysis; // 原始分析结果
}

// ============================================================
// 4. 工作流分析结果
// ============================================================

export interface WorkflowAnalysis {
  totalNodes: number;
  nodes: AnalyzedNode[];
  edges: ComfyLink[];
  promptNodes: AnalyzedNode[];
  imageInputNodes: AnalyzedNode[];
  resolutionNodes: AnalyzedNode[];
  samplerNodes: AnalyzedNode[];
  modelLoaderNodes: AnalyzedNode[];
  outputNodes: AnalyzedNode[];
  unknownNodes: AnalyzedNode[];
  suggestion: string;
  // 自动推导的参数 schema
  derivedParams: ParamDefinition[];
  derivedOutputs: OutputDefinition[];
}

// ============================================================
// 5. 执行相关类型
// ============================================================

/** 执行配置（用户提供的参数） */
export interface ExecutionConfig {
  prompt?: string;
  negativePrompt?: string;
  referenceImage?: string;     // base64 或文件路径
  referenceImages?: string[];  // 多张参考图
  width?: number;
  height?: number;
  seed?: number;
  steps?: number;
  cfg?: number;
  duration?: number;           // 视频时长（秒或帧数）
  batchSize?: number;
  [key: string]: any;          // 扩展参数
}

/** ComfyUI 服务信息 */
export interface ComfyServer {
  id: string;
  name: string;
  baseUrl: string;
  enabled: boolean;
  status: "connected" | "disconnected" | "unknown";
  lastCheckTime?: number;
}

/** 执行结果 */
export interface ExecutionResult {
  success: boolean;
  promptId?: string;
  outputs?: Array<{
    type: "image" | "video";
    filename: string;
    dataUrl: string;           // base64 data URL
    mimeType: string;
  }>;
  error?: string;
  duration?: number;           // 执行耗时（ms）
}

/** 执行进度回调 */
export type ProgressCallback = (progress: {
  stage: "submitting" | "queued" | "executing" | "uploading" | "downloading" | "done" | "error";
  progress?: number;           // 0-100
  message?: string;
}) => void;

// ============================================================
// 6. 数据库记录类型
// ============================================================

export interface WorkflowRecord {
  id: string;
  serverId?: string;
  name: string;
  type: "image" | "video";
  workflowJson: string;        // JSON 字符串
  analysis?: string;           // WorkflowAnalysis JSON 字符串
  schema?: string;             // WorkflowSchema JSON 字符串 (新增)
  paramMapping?: string;       // 用户自定义参数映射 JSON (新增)
  status: "active" | "inactive";
  createTime: number;
}

export interface ServerRecord {
  id: string;
  name: string;
  baseUrl: string;
  enabled: boolean;
  status: string;
  lastCheckTime?: number;
  createTime: number;
  updateTime?: number;
}
