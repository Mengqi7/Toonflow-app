/**
 * ComfyUI 工具 - 薄封装层
 *
 * 此文件是 ComfyUIService 的适配层，保持与现有 ai.ts 路由代码的兼容性。
 * 所有核心逻辑都在 src/services/comfyui/ 模块中。
 *
 * 关键入口：
 * - executeById(workflowId, config)：按工作流 ID 执行（推荐，由 ai.ts 使用）
 * - executeByModel(vendorId, modelName, config, workflowName?)：兼容旧签名
 */
import { ComfyUIService } from "@/services/comfyui";
import type { ExecutionConfig, ExecutionResult } from "@/services/comfyui";

// 延迟初始化 service 实例（需要 u 对象）
let _service: ComfyUIService | null = null;

function getService(): ComfyUIService {
  if (!_service) {
    // u 必须在运行时通过全局上下文获取，此处延迟加载
    const u = require("@/utils").default;
    _service = new ComfyUIService(u);
  }
  return _service;
}

/** 分辨率映射 */
const SIZE_MAP: Record<string, [number, number]> = {
  "1080P": [1920, 1080],
  "768P": [1360, 768],
  "720P": [1280, 720],
  "512P": [910, 512],
  "4K": [3840, 2160],
  "2K": [2560, 1440],
  "1K": [1024, 1024],
};

/** 将 ai.ts 传入的宽松 config 转换为标准 ExecutionConfig */
function translateConfig(config: Record<string, any>): ExecutionConfig {
  let width: number | undefined;
  let height: number | undefined;
  if (config.size) {
    const [w, h] = SIZE_MAP[config.size] || [config.width, config.height];
    width = w ?? config.width;
    height = h ?? config.height;
  }

  // 参考图：优先 referenceImageBase64 / referenceImage（单图），referenceImages（多图）
  const referenceImage = config.referenceImageBase64 || config.referenceImage;
  const referenceImages: string[] = Array.isArray(config.referenceImages) ? [...config.referenceImages] : [];
  if (referenceImage && !referenceImages.length) referenceImages.push(referenceImage);
  // 尾帧（视频）：追加到参考图列表末尾
  if (config.endImageBase64 && !referenceImages.includes(config.endImageBase64)) {
    referenceImages.push(config.endImageBase64);
  }

  return {
    prompt: config.prompt,
    negativePrompt: config.negative || config.negativePrompt,
    referenceImage: referenceImage || referenceImages[0],
    referenceImages,
    width: width || config.width,
    height: height || config.height,
    seed: config.seed,
    steps: config.steps,
    cfg: config.cfg,
    duration: config.duration,
  };
}

/** 统一取出第一个产物，失败时抛错 */
function unwrapResult(result: ExecutionResult): string {
  if (!result.success) {
    throw new Error(result.error || "ComfyUI 执行失败");
  }
  if (!result.outputs || result.outputs.length === 0) {
    throw new Error("ComfyUI 执行完成但未产生输出");
  }
  return result.outputs[0].dataUrl;
}

/**
 * 按工作流 ID 执行（推荐入口）
 * @param workflowId 工作流 ID（模型选择器里 modelName 即工作流 ID）
 * @param config 宽松执行配置（支持 size / referenceImageBase64 / referenceImages / endImageBase64 等）
 * @returns 第一个产物的 base64 data URL
 */
async function executeById(workflowId: string, config: Record<string, any>): Promise<string> {
  const service = getService();
  const result = await service.executeById(workflowId, translateConfig(config));
  return unwrapResult(result);
}

/**
 * 通过模型名称执行 ComfyUI 工作流（兼容旧版 API）
 *
 * 兼容旧签名：(vendorId, modelName, config, workflowName?) → Promise<string (base64)>
 */
async function executeByModel(
  vendorId: string,
  modelName: string,
  config: Record<string, any>,
  workflowName?: string,
): Promise<string> {
  const service = getService();
  const execConfig = translateConfig(config);

  let result: ExecutionResult;
  if (workflowName) {
    result = await service.executeByName(workflowName, execConfig);
  } else {
    result = await service.executeByModel(modelName, execConfig);
  }

  return unwrapResult(result);
}

export const comfyui = {
  executeByModel,
  executeById,
  // 直接暴露 ComfyUIService 类，方便路由层使用
  createService: (u: any) => new ComfyUIService(u),
};
