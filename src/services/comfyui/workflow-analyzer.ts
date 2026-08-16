/**
 * ComfyUI 工作流智能分析引擎
 *
 * 核心能力：接收任意 ComfyUI 工作流 JSON，自动识别节点类型、
 * 可注入参数、输入输出结构，无需任何硬编码节点名。
 *
 * 分析策略：
 * 1. 字段名语义匹配 —— 通过字段名推断语义（如 text→文字输入, image→图片输入）
 * 2. 字段值类型推断 —— 通过字段的默认值类型推断注入点
 * 3. 节点连接分析 —— 通过 links 找到终端节点（输出点）
 * 4. 节点类型模式匹配 —— 兜底方案，通过 class_type 名匹配已知输出类型
 */

import * as path from "path";
import {
  ComfyWorkflowJSON,
  ComfyNodeRaw,
  ComfyLink,
  AnalyzedNode,
  InjectField,
  FieldSemanticType,
  WorkflowAnalysis,
  ParamDefinition,
  OutputDefinition,
} from "./types";
import { isSamplerNode } from "./workflow-normalizer";

// ============================================================
// 1. 语义检测规则
// ============================================================

/** 已知的输出节点类型（产出图片/视频） */
const OUTPUT_NODE_TYPES: Set<string> = new Set([
  "SaveImage", "PreviewImage", "SaveAnimatedWEBP", "SaveAnimatedPNG",
  "SaveVideo", "VHS_VideoCombine", "VideoCombine", "ImageCombine",
  "PreviewVideo", "SaveImageWebsocket",
]);

/** 文本输入相关的字段名模式 */
const TEXT_FIELD_PATTERNS = [
  /^text$/i, /^prompt$/i, /^positive$/i, /^positive_prompt$/i,
  /^negative$/i, /^negative_prompt$/i, /^caption$/i,
  /^clip$/i, /^conditioning$/i,
];

/** 图片输入相关的字段名模式 */
const IMAGE_FIELD_PATTERNS = [
  /^image$/i, /^images$/i, /^img$/i,
  /^first_frame$/i, /^last_frame$/i, /^frame$/i,
  /^reference$/i, /^reference_image$/i,
  /^input_image$/i, /^source$/i, /^source_image$/i,
  /^pixels$/i, /^image_input$/i,
];

/** 分辨率相关字段 */
const RESOLUTION_FIELD_PATTERNS = [
  /^width$/i, /^height$/i, /^resolution$/i,
  /^latent_width$/i, /^latent_height$/i,
  /^image_width$/i, /^image_height$/i,
  /^output_width$/i, /^output_height$/i,
];

/** 种子字段 */     
const SEED_FIELD_PATTERNS = [
  /^seed$/i, /^noise_seed$/i, /^random_seed$/i,
];

/** 采样器参数字段 */
const SAMPLER_FIELD_PATTERNS = [
  /^steps$/i, /^cfg$/i, /^denoise$/i,
  /^sampler_name$/i, /^scheduler$/i,
  /^cfg_scale$/i, /^guidance$/i,
];

/** 时长字段 */
const DURATION_FIELD_PATTERNS = [
  /^duration$/i, /^length$/i, /^frame_count$/i,
  /^frame_rate$/i, /^fps$/i,
  /^total_frames$/i,
];

/** 模型加载节点类型 */
const MODEL_LOADER_PATTERNS = [
  /loader/i, /load/i, /checkpoint/i, /unet/i, /clip/i,
  /vae/i, /lora/i, /model/i,
];

// ============================================================
// 2. 工具函数
// ============================================================

/** 根据字段名判断语义类型 */
function detectFieldSemanticType(
  fieldKey: string,
  fieldValue: any,
  classType: string
): FieldSemanticType {
  const key = fieldKey.toLowerCase();

  for (const pattern of TEXT_FIELD_PATTERNS) {
    if (pattern.test(key)) return "text";
  }

  for (const pattern of IMAGE_FIELD_PATTERNS) {
    if (pattern.test(key)) return "image";
  }

  for (const pattern of RESOLUTION_FIELD_PATTERNS) {
    if (pattern.test(key)) return "resolution";
  }

  for (const pattern of SEED_FIELD_PATTERNS) {
    if (pattern.test(key)) return "seed";
  }

  for (const pattern of SAMPLER_FIELD_PATTERNS) {
    if (pattern.test(key)) return "sampler";
  }

  for (const pattern of DURATION_FIELD_PATTERNS) {
    if (pattern.test(key)) return "duration";
  }

  return "unknown";
}

/** 判断值的 JavaScript 类型 */
function detectValueType(value: any): "string" | "number" | "boolean" | "array" | "object" {
  if (value === null || value === undefined) return "string";
  if (Array.isArray(value)) return "array";
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return t;
  return "object";
}

/** 格式化标签 */
function formatLabel(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

// ============================================================
// 3. 节点分析
// ============================================================

/** 判断节点是否为输出节点 */
function isOutputNode(classType: string, allLinks: ComfyLink[], nodeId: string): boolean {
  // 方法1：已知的输出节点类型
  if (OUTPUT_NODE_TYPES.has(classType)) return true;

  // 方法2：只有在有 links 信息时，才根据连接关系判断终端节点
  // （没有其他节点的 input 连接到该节点的 output，且该节点有消费者时，不是输出节点）
  if (allLinks.length > 0) {
    const hasConsumer = allLinks.some(
      (link) => String(link.from) === nodeId
    );
    // 如果有消费者连接该节点，说明不是输出节点
    if (hasConsumer) return false;
  }

  return false;
}

/** 判断节点是否为终端节点（没有下游消费者） */
function isTerminalNode(classType: string, allLinks: ComfyLink[], nodeId: string): boolean {
  // 只有在有 links 信息时才准确判断
  if (allLinks.length === 0) {
    // 没有 links 信息时，仅已知输出类型算终端
    return OUTPUT_NODE_TYPES.has(classType);
  }

  const hasConsumer = allLinks.some(
    (link) => String(link.from) === nodeId
  );
  return !hasConsumer;
}

/** 已知的非模型加载节点的 class_type（用于排除误匹配） */
const NON_MODEL_NODES: Set<string> = new Set([
  "CLIPTextEncode", "CLIPTextEncodeSDXL", "CLIPTextEncodeSD3",
  "CLIPTextEncodeFlux", "CLIPTextEncodeHunyuan",
  "CLIPSetLastLayer", "CLIPVisionEncode",
]);

/** 分析节点的角色 */
function detectNodeRole(
  classType: string,
  fields: InjectField[]
): FieldSemanticType {
  const lowerClass = classType.toLowerCase();

  // 已知输出类型
  if (OUTPUT_NODE_TYPES.has(classType)) return "output";

  // 根据字段分布推断（优先，因为字段信息更准确）
  const typeCounts = fields.reduce(
    (acc, f) => { acc[f.semanticType] = (acc[f.semanticType] || 0) + 1; return acc; },
    {} as Record<string, number>
  );

  if (typeCounts.text && typeCounts.text >= 1) return "text";
  if (typeCounts.image) return "image";
  if (typeCounts.resolution && typeCounts.seed) return "sampler";
  if (typeCounts.resolution) return "resolution";
  if (typeCounts.seed) return "sampler";
  if (typeCounts.duration) return "unknown";

  // 模型加载类型（排除已知的非模型节点）
  if (!NON_MODEL_NODES.has(classType)) {
    for (const pattern of MODEL_LOADER_PATTERNS) {
      if (pattern.test(lowerClass)) return "model";
    }
  }

  return "unknown";
}

/** 分析单个节点，提取可注入字段 */
function analyzeNode(
  node: ComfyNodeRaw,
  links: ComfyLink[],
  nodeId: string,
  nodeIndex: number
): AnalyzedNode {
  const classType = (node.class_type || node.type || `unknown_${nodeIndex}`) as string;
  const title = node._meta?.title || classType;

  const injectFields: InjectField[] = [];

  // --- 处理标准 inputs 结构 ---
  if (node.inputs && typeof node.inputs === "object") {
    for (const [key, value] of Object.entries(node.inputs)) {
      // 跳过连接引用：[nodeId, slot] 格式的数组表示这是来自其他节点的连接
      if (
        Array.isArray(value) &&
        value.length === 2 &&
        typeof value[0] === "string" &&
        !isNaN(Number(value[0]))
      ) {
        continue;
      }
      // 跳过非基本类型值（对象但不是数组）
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        continue;
      }

      const semanticType = detectFieldSemanticType(key, value, classType);
      const valueType = detectValueType(value);

      injectFields.push({
        key,
        label: formatLabel(key),
        semanticType,
        currentValue: value,
        valueType,
        required: semanticType === "text" || semanticType === "image",
      });
    }
  }

  // --- 处理 widgets_values 结构（自定义节点常用）---
  if (node.widgets_values && Array.isArray(node.widgets_values)) {
    // widgets_values 是无名的位置参数，尝试推断语义
    node.widgets_values.forEach((value, index) => {
      const valueType = detectValueType(value);
      let semanticType: FieldSemanticType = "unknown";

      if (valueType === "string" && index === 0) {
        // 第一个字符串通常是指令/prompt
        semanticType = "text";
      } else if (valueType === "string" && typeof value === "string") {
        semanticType = "text";
      } else if (valueType === "number") {
        // 根据常见顺序推测
        if (index === 1) semanticType = "resolution";  // 通常是 width
        else if (index === 2) semanticType = "resolution";  // 通常是 height
        else if (index === 3) semanticType = "duration";  // 视频时长
        else semanticType = "seed";
      }

      injectFields.push({
        key: String(index),
        label: `${classType} Widget ${index + 1}`,
        semanticType,
        currentValue: value,
        valueType,
      });
    });
  }

  // 判断是否是输出节点 & 终端节点
  const isTerminal = isTerminalNode(classType, links, nodeId);
  // isOutput 只对已知的输出节点类型为 true
  const isOutput = OUTPUT_NODE_TYPES.has(classType);

  // 判定角色
  const role = detectNodeRole(classType, injectFields);

  return {
    id: nodeId,
    classType,
    title,
    role,
    injectFields,
    isOutput,
    isTerminal,
  };
}

// ============================================================
// 4. 自动推导参数 Schema
// ============================================================

/** 识别正/负提示词节点极性（通过采样器的 positive/negative 连接） */
function annotatePromptPolarity(
  nodesMap: Record<string, ComfyNodeRaw>,
  analyzedNodes: AnalyzedNode[]
): void {
  const byId = new Map(analyzedNodes.map((n) => [n.id, n]));

  for (const node of Object.values(nodesMap)) {
    const classType = (node.class_type || node.type || "") as string;
    if (!isSamplerNode(classType)) continue;

    const inputs = (node.inputs || {}) as Record<string, any>;
    for (const polarity of ["positive", "negative"] as const) {
      const ref = inputs[polarity];
      if (Array.isArray(ref) && ref.length >= 1 && typeof ref[0] === "string") {
        const target = byId.get(String(ref[0]));
        if (target && target.role === "text") {
          target.promptPolarity = polarity;
        }
      }
    }
  }
}

/** 从分析结果中自动推导用户需要提供的参数 */
function deriveParams(nodes: AnalyzedNode[]): ParamDefinition[] {
  const params: ParamDefinition[] = [];
  const seenParamNames = new Set<string>();

  for (const node of nodes) {
    for (const field of node.injectFields) {
      let paramName: string;
      let paramType: "string" | "number" | "boolean" | "image";

      switch (field.semanticType) {
        case "text":
          paramName = node.promptPolarity === "negative" ? "negative_prompt" : "prompt";
          paramType = "string";
          break;
        case "image":
          paramName = "reference_image";
          paramType = "image";
          break;
        case "resolution":
          if (field.key.toLowerCase() === "width") paramName = "width";
          else if (field.key.toLowerCase() === "height") paramName = "height";
          else paramName = field.key;
          paramType = "number";
          break;
        case "seed":
          paramName = "seed";
          paramType = "number";
          break;
        case "sampler":
          paramName = field.key;
          paramType = field.valueType as "number";
          break;
        case "duration":
          paramName = "duration";
          paramType = "number";
          break;
        default:
          paramName = `${node.classType}_${field.key}`;
          paramType = "string";
      }

      const existing = params.find(p => p.name === paramName);
      if (existing) {
        existing.injectTargets.push({
          nodeId: node.id,
          fieldKey: field.key,
          valueType: field.key.match(/^\d+$/) ? "widgets_values_index" : "inputs",
        });
      } else {
        params.push({
          name: paramName,
          label: formatLabel(paramName),
          type: paramType,
          required: field.semanticType === "text" || field.semanticType === "image",
          default: field.currentValue,
          injectTargets: [{
            nodeId: node.id,
            fieldKey: field.key,
            valueType: field.key.match(/^\d+$/) ? "widgets_values_index" : "inputs",
          }],
        });
      }
    }
  }

  return params;
}

/** 从分析结果中推导输出定义 */
function deriveOutputs(nodes: AnalyzedNode[]): OutputDefinition[] {
  return nodes
    .filter(n => n.isOutput)
    .map(n => ({
      type: n.classType.toLowerCase().includes("video") ? "video" as const : "image" as const,
      nodeId: n.id,
      nodeClassType: n.classType,
      description: `${n.title} 节点`,
    }));
}

// ============================================================
// 5. 主分析入口
// ============================================================

/**
 * 分析一个完整的 ComfyUI 工作流 JSON
 *
 * @param workflowJson - 原始工作流 JSON 对象
 * @returns 结构化的分析结果
 */
export function analyzeWorkflow(workflowJson: ComfyWorkflowJSON): WorkflowAnalysis {
  const nodesMap: Record<string, ComfyNodeRaw> = workflowJson.nodes || {};
  const links: ComfyLink[] = (workflowJson.links || []) as ComfyLink[];

  // 分析每个节点
  const analyzedNodes: AnalyzedNode[] = Object.entries(nodesMap).map(
    ([nodeId, node], index) => analyzeNode(node, links, nodeId, index)
  );

  // 识别正/负提示词节点极性（通过采样器的 positive/negative 连接）
  annotatePromptPolarity(nodesMap, analyzedNodes);

  // 按角色分类
  const promptNodes = analyzedNodes.filter(n => n.role === "text");
  const imageInputNodes = analyzedNodes.filter(n => n.role === "image");
  const resolutionNodes = analyzedNodes.filter(
    n => n.role === "resolution" || n.injectFields.some(f => f.semanticType === "resolution")
  );
  const samplerNodes = analyzedNodes.filter(
    n => n.role === "sampler" || n.injectFields.some(f => f.semanticType === "sampler" || f.semanticType === "seed")
  );
  const modelLoaderNodes = analyzedNodes.filter(n => n.role === "model");
  const outputNodes = analyzedNodes.filter(n => n.isOutput);
  const unknownNodes = analyzedNodes.filter(n => n.role === "unknown" && !n.isOutput);

  // 自动推导参数
  const derivedParams = deriveParams(analyzedNodes);
  const derivedOutputs = deriveOutputs(analyzedNodes);

  // 生成建议
  const suggestion = buildSuggestion(
    promptNodes,
    imageInputNodes,
    resolutionNodes,
    samplerNodes,
    outputNodes,
    derivedParams
  );

  return {
    totalNodes: analyzedNodes.length,
    nodes: analyzedNodes,
    edges: links,
    promptNodes,
    imageInputNodes,
    resolutionNodes,
    samplerNodes,
    modelLoaderNodes,
    outputNodes,
    unknownNodes,
    suggestion,
    derivedParams,
    derivedOutputs,
  };
}

function buildSuggestion(
  promptNodes: AnalyzedNode[],
  imageNodes: AnalyzedNode[],
  resolutionNodes: AnalyzedNode[],
  samplerNodes: AnalyzedNode[],
  outputNodes: AnalyzedNode[],
  params: ParamDefinition[]
): string {
  const parts: string[] = [];

  parts.push(`检测到 ${params.length} 个可配置参数`);
  if (promptNodes.length > 0) parts.push(`文本输入：${promptNodes.map(n => n.title).join(", ")}`);
  if (imageNodes.length > 0) parts.push(`图片输入：${imageNodes.map(n => n.title).join(", ")}`);
  if (outputNodes.length > 0) {
    parts.push(`输出节点：${outputNodes.map(n => `${n.title}(${n.classType})`).join(", ")}`);
  } else {
    parts.push("⚠ 未检测到明确输出节点，将尝试从终端节点获取结果");
  }

  return parts.join("; ");
}

/**
 * 检测工作流类型（图片生成 or 视频生成）
 */
export function detectWorkflowType(analysis: WorkflowAnalysis): "image" | "video" {
  const hasVideoOutput = analysis.outputNodes.some(
    n => n.classType.toLowerCase().includes("video") ||
         n.classType.toLowerCase().includes("vhs")
  );
  return hasVideoOutput ? "video" : "image";
}

/**
 * 获取分析摘要（用于日志/展示）
 */
export function getAnalysisSummary(analysis: WorkflowAnalysis): string {
  return [
    `节点总数: ${analysis.totalNodes}`,
    `文本提示节点: ${analysis.promptNodes.length}`,
    `图片输入节点: ${analysis.imageInputNodes.length}`,
    `采样节点: ${analysis.samplerNodes.length}`,
    `输出节点: ${analysis.outputNodes.length}`,
    `可配置参数: ${analysis.derivedParams.length}`,
  ].join(", ");
}
