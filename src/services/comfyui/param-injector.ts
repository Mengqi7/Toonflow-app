/**
 * ComfyUI 动态参数注入引擎
 *
 * 根据工作流分析结果，将用户的配置参数动态注入到工作流 JSON 的对应节点中。
 * 不依赖任何硬编码节点类型，完全通过参数映射表驱动。
 */

import {
  ComfyWorkflowJSON,
  ExecutionConfig,
  ParamDefinition,
  WorkflowAnalysis,
  AnalyzedNode,
} from "./types";

/**
 * 将用户配置注入到工作流 JSON
 *
 * @param workflow  原始工作流 JSON
 * @param analysis  工作流分析结果（来自 workflow-analyzer）
 * @param config    用户提供的执行配置
 * @returns 注入参数后的工作流 JSON 副本
 */
export function injectParams(
  workflow: ComfyWorkflowJSON,
  analysis: WorkflowAnalysis,
  config: ExecutionConfig
): ComfyWorkflowJSON {
  // 深拷贝工作流，避免修改原始数据
  const injected: ComfyWorkflowJSON = JSON.parse(JSON.stringify(workflow));
  const nodes = injected.nodes || {};

  // 使用分析结果中的参数映射
  const paramDefs = analysis.derivedParams;

  // ---- 1. 注入正/负提示词 ----
  if (config.prompt !== undefined || config.negativePrompt !== undefined) {
    if (config.prompt !== undefined) injectByParamName(paramDefs, nodes, "prompt", config.prompt);
    if (config.negativePrompt !== undefined) injectByParamName(paramDefs, nodes, "negative_prompt", config.negativePrompt);
    // 按极性直接注入到 promptNodes
    injectToPromptNodes(analysis, nodes, config.prompt, config.negativePrompt);
  }

  // ---- 3. 注入参考图（单图 / 多图 / 首尾帧）----
  const referenceImages: string[] = [];
  if (config.referenceImages && config.referenceImages.length > 0) {
    referenceImages.push(...config.referenceImages);
  } else if (config.referenceImage) {
    referenceImages.push(config.referenceImage);
  }

  if (referenceImages.length > 0) {
    // 3.1 按参数名注入（单图 → reference_image）
    injectByParamName(paramDefs, nodes, "reference_image", referenceImages[0]);
    // 3.2 按图片输入节点顺序注入（首帧 → 第一个 image 节点，尾帧 → 第二个）
    injectToImageNodes(analysis, nodes, referenceImages);
  }

  // ---- 5. 注入分辨率 ----
  if (config.width !== undefined) {
    injectByParamName(paramDefs, nodes, "width", Number(config.width));
  }
  if (config.height !== undefined) {
    injectByParamName(paramDefs, nodes, "height", Number(config.height));
  }

  // ---- 6. 注入种子 ----
  if (config.seed !== undefined) {
    injectByParamName(paramDefs, nodes, "seed", Number(config.seed));
  } else {
    // 如果没有指定种子，随机生成一个
    const randomSeed = Math.floor(Math.random() * 2 ** 32);
    injectByParamName(paramDefs, nodes, "seed", randomSeed);
  }

  // ---- 7. 注入采样器参数 ----
  if (config.steps !== undefined) {
    injectByParamName(paramDefs, nodes, "steps", Number(config.steps));
  }
  if (config.cfg !== undefined) {
    injectByParamName(paramDefs, nodes, "cfg", Number(config.cfg));
  }

  // ---- 8. 注入视频时长 ----
  if (config.duration !== undefined) {
    injectByParamName(paramDefs, nodes, "duration", Number(config.duration));
  }

  // ---- 9. 注入扩展参数 ----
  for (const [key, value] of Object.entries(config)) {
    if (
      [
        "prompt", "negativePrompt", "referenceImage", "referenceImages",
        "width", "height", "seed", "steps", "cfg", "duration",
      ].includes(key)
    ) {
      continue; // 已处理的标准参数
    }
    if (value !== undefined && value !== null) {
      injectByParamName(paramDefs, nodes, key, value);
    }
  }

  return injected;
}

// ============================================================
// 内部工具函数
// ============================================================

/** 根据参数名找到对应的 injectTargets 并注入值 */
function injectByParamName(
  paramDefs: ParamDefinition[],
  nodes: Record<string, any>,
  paramName: string,
  value: any
): boolean {
  const paramDef = paramDefs.find(p => p.name === paramName);
  if (!paramDef || paramDef.injectTargets.length === 0) return false;

  let injected = false;
  for (const target of paramDef.injectTargets) {
    const node = nodes[target.nodeId];
    if (!node) continue;

    if (target.valueType === "inputs") {
      if (node.inputs && typeof node.inputs === "object") {
        node.inputs[target.fieldKey] = value;
        injected = true;
      }
    } else if (target.valueType === "widgets_values_index") {
      const idx = parseInt(target.fieldKey, 10);
      if (!isNaN(idx) && node.widgets_values && Array.isArray(node.widgets_values)) {
        node.widgets_values[idx] = value;
        injected = true;
      }
    }
  }
  return injected;
}

/** 直接注入到文字提示节点（按极性：positive → prompt，negative → negativePrompt） */
function injectToPromptNodes(
  analysis: WorkflowAnalysis,
  nodes: Record<string, any>,
  prompt?: string,
  negativePrompt?: string
): void {
  for (const pNode of analysis.promptNodes) {
    const node = nodes[pNode.id];
    if (!node) continue;

    const value = pNode.promptPolarity === "negative" ? negativePrompt : prompt;
    if (value === undefined || value === null) continue;

    // 查找节点中第一个 text 类型字段
    const textField = pNode.injectFields.find(f => f.semanticType === "text");
    if (textField) {
      if (textField.key.match(/^\d+$/)) {
        // widgets_values 索引
        const idx = parseInt(textField.key, 10);
        if (node.widgets_values && node.widgets_values[idx] !== undefined) {
          node.widgets_values[idx] = value;
        }
      } else {
        // 标准 inputs
        if (node.inputs && typeof node.inputs === "object") {
          node.inputs[textField.key] = value;
        }
      }
    }
  }
}

/** 直接注入到图片输入节点（按顺序：images[0] → 第一个 image 节点，images[1] → 第二个） */
function injectToImageNodes(
  analysis: WorkflowAnalysis,
  nodes: Record<string, any>,
  images: string[]
): void {
  if (!images.length) return;

  analysis.imageInputNodes.forEach((imgNode, idx) => {
    // 若图片数量少于节点数量，其余节点复用第一张；否则按索引对应
    const image = images[idx] ?? images[0];
    if (!image) return;

    const node = nodes[imgNode.id];
    if (!node) return;

    const imgField = imgNode.injectFields.find(f => f.semanticType === "image");
    if (!imgField) return;

    if (imgField.key.match(/^\d+$/)) {
      const i = parseInt(imgField.key, 10);
      if (node.widgets_values && node.widgets_values[i] !== undefined) {
        node.widgets_values[i] = image;
      }
    } else {
      if (node.inputs && typeof node.inputs === "object") {
        node.inputs[imgField.key] = image;
      }
    }
  });
}

/**
 * 为工作流生成随机种子（如果没有指定的话）
 */
export function ensureSeed(seed?: number): number {
  return seed ?? Math.floor(Math.random() * 2 ** 32);
}

/**
 * 获取工作流中所有需要的参数定义（去除重复）
 */
export function getRequiredParams(
  paramDefs: ParamDefinition[]
): ParamDefinition[] {
  // 按 name 去重，取第一个
  const seen = new Set<string>();
  return paramDefs.filter(p => {
    if (seen.has(p.name)) return false;
    seen.add(p.name);
    return true;
  });
}
