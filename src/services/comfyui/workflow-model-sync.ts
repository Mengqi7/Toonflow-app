/**
 * ComfyUI 工作流 ↔ 模型 同步层
 *
 * 核心目标：用户导入的每个 ComfyUI 工作流都会自动注册为一个「ComfyUI」供应商下的
 * 虚拟模型（engine = "comfyui"），从而可以直接在 Toonflow 的模型选择器中选到它，
 * 由内置执行引擎（src/services/comfyui）完成文生图 / 图生图 / 视频生成。
 *
 * 说明：
 * - ComfyUI 是一个「虚拟供应商」，没有真实的三方 API，也不走 vendor 脚本适配；
 *   它仅作为模型选择器里的一个分组容器，其 models 由导入的工作流动态维护。
 * - 为保证 u.vendor.getModelList("comfyui") 能正常工作，必须存在 data/vendor/comfyui.ts
 *   模板文件（models 为空数组），并配合 o_vendorConfig.models 里的动态模型。
 */

import { WorkflowRecord } from "./types";

export const COMFYUI_VENDOR_ID = "comfyui";

/**
 * ComfyUI 虚拟供应商模板（会被写入 data/vendor/comfyui.ts）
 *
 * 注意：这里只是占位，真实的 imageRequest / videoRequest 不会被调用，
 * 因为 ai.ts 中 engine === "comfyui" 的模型会直接路由到内置执行引擎。
 */
export const COMFYUI_VENDOR_TEMPLATE = [
  "/**",
  " * Toonflow AI 供应商模板 - ComfyUI 工作流（虚拟供应商）",
  " * @version 2.0",
  " *",
  " * 该供应商用于承载用户导入的 ComfyUI 工作流，实际执行由内置执行引擎完成",
  " * （engine === 'comfyui'），下面的适配函数仅为占位，不会被调用。",
  " */",
  "",
  "type VideoMode =",
  '  | "singleImage"',
  '  | "startEndRequired"',
  '  | "endFrameOptional"',
  '  | "startFrameOptional"',
  '  | "text"',
  '  | string;',
  "",
  "interface TextModel {",
  "  name: string;",
  "  modelName: string;",
  '  type: "text";',
  "  think: boolean;",
  "}",
  "",
  "interface ImageModel {",
  "  name: string;",
  "  modelName: string;",
  '  type: "image";',
  '  mode: ("text" | "singleImage" | "multiReference")[];',
  "}",
  "",
  "interface VideoModel {",
  "  name: string;",
  "  modelName: string;",
  '  type: "video";',
  "  mode: VideoMode[];",
  '  audio: "optional" | false | true;',
  "  durationResolutionMap: { duration: number[]; resolution: string[] }[];",
  "}",
  "",
  "interface TTSModel {",
  "  name: string;",
  "  modelName: string;",
  '  type: "tts";',
  "  voices: { title: string; voice: string }[];",
  "}",
  "",
  "interface VendorConfig {",
  "  id: string;",
  "  version: string;",
  "  name: string;",
  "  author: string;",
  "  description?: string;",
  "  icon?: string;",
  '  inputs: { key: string; label: string; type: "text" | "password" | "url"; required: boolean; placeholder?: string }[];',
  "  inputValues: Record<string, string>;",
  "  models: (TextModel | ImageModel | VideoModel | TTSModel)[];",
  "}",
  "",
  "declare const exports: {",
  "  vendor: VendorConfig;",
  "  textRequest: (m: TextModel, t: boolean, tl: 0 | 1 | 2 | 3) => any;",
  "  imageRequest: (c: any, m: ImageModel) => Promise<string>;",
  "  videoRequest: (c: any, m: VideoModel) => Promise<string>;",
  "  ttsRequest: (c: any, m: TTSModel) => Promise<string>;",
  "};",
  "",
  "const vendor: VendorConfig = {",
  '  id: "comfyui",',
  '  version: "2.0",',
  '  author: "Toonflow",',
  '  name: "ComfyUI 工作流",',
  '  description: "导入 ComfyUI 工作流后自动生成模型，由内置执行引擎调用。",',
  "  inputs: [],",
  "  inputValues: {},",
  "  models: [],",
  "};",
  "",
  "const textRequest = () => {",
  '  throw new Error("ComfyUI 供应商仅支持图像/视频生成");',
  "};",
  "",
  "const imageRequest = async (): Promise<string> => {",
  '  throw new Error("ComfyUI 工作流应由内置执行引擎调用，请勿直接调用该适配函数");',
  "};",
  "",
  "const videoRequest = async (): Promise<string> => {",
  '  throw new Error("ComfyUI 工作流应由内置执行引擎调用，请勿直接调用该适配函数");',
  "};",
  "",
  "const ttsRequest = async (): Promise<string> => {",
  '  throw new Error("ComfyUI 供应商不支持语音生成");',
  "};",
  "",
  "exports.vendor = vendor;",
  "exports.textRequest = textRequest;",
  "exports.imageRequest = imageRequest;",
  "exports.videoRequest = videoRequest;",
  "exports.ttsRequest = ttsRequest;",
  "",
  "export {};",
].join("\n");

/** 根据工作流记录构造虚拟模型对象（用于写入 o_vendorConfig.models） */
export function buildWorkflowModel(workflow: Pick<WorkflowRecord, "id" | "name" | "type">): Record<string, any> {
  const base: Record<string, any> = {
    name: workflow.name,
    modelName: workflow.id, // 唯一键：直接用工作流 id
    type: workflow.type,
    engine: "comfyui", // 关键标记：ai.ts 据此路由到内置执行引擎
    workflowId: workflow.id,
  };

  if (workflow.type === "video") {
    base.mode = ["text", "singleImage", "startEndRequired", "endFrameOptional", "startFrameOptional"];
    base.audio = false;
    base.durationResolutionMap = [
      { duration: [3, 5, 10], resolution: ["1080P", "720P", "512P"] },
    ];
  } else {
    base.mode = ["text", "singleImage", "multiReference"];
  }

  return base;
}

/**
 * 确保 ComfyUI 虚拟供应商存在：
 * 1. 写入 data/vendor/comfyui.ts 模板（缺失时）
 * 2. 在 o_vendorConfig 中创建/启用 id = "comfyui"
 */
export async function ensureComfyUIVendor(u: any): Promise<void> {
  // 1. 写入模板文件（vendor.ts 的 getModelList 依赖该文件存在）
  try {
    const code = u.vendor.getCode(COMFYUI_VENDOR_ID);
    if (!code) {
      u.vendor.writeCode(COMFYUI_VENDOR_ID, COMFYUI_VENDOR_TEMPLATE);
      console.log("[ComfyUI] 已写入虚拟供应商模板 data/vendor/comfyui.ts");
    }
  } catch (e: any) {
    console.warn("[ComfyUI] 写入供应商模板失败:", e?.message);
  }

  // 2. 确保数据库行存在
  const existing = await u.db("o_vendorConfig").where("id", COMFYUI_VENDOR_ID).first();
  if (existing) {
    if (existing.enable !== 1) {
      await u.db("o_vendorConfig").where("id", COMFYUI_VENDOR_ID).update({ enable: 1 });
      console.log("[ComfyUI] 已启用 ComfyUI 虚拟供应商");
    }
    return;
  }

  await u.db("o_vendorConfig").insert({
    id: COMFYUI_VENDOR_ID,
    inputValues: "{}",
    models: "[]",
    enable: 1,
  });
  console.log("[ComfyUI] 已创建 ComfyUI 虚拟供应商");
}

/**
 * 同步工作流到虚拟供应商模型列表
 * @param action add | update | remove
 */
export async function syncWorkflowModel(
  u: any,
  workflow: Pick<WorkflowRecord, "id" | "name" | "type">,
  action: "add" | "update" | "remove",
): Promise<void> {
  await ensureComfyUIVendor(u);

  const row = await u.db("o_vendorConfig").where("id", COMFYUI_VENDOR_ID).first();
  let models: any[] = [];
  try {
    models = row?.models ? JSON.parse(row.models) : [];
  } catch {
    models = [];
  }
  if (!Array.isArray(models)) models = [];

  const index = models.findIndex((m: any) => m.modelName === workflow.id);

  if (action === "remove") {
    if (index >= 0) models.splice(index, 1);
  } else {
    const model = buildWorkflowModel(workflow);
    if (index >= 0) models[index] = model;
    else models.push(model);
  }

  await u.db("o_vendorConfig")
    .where("id", COMFYUI_VENDOR_ID)
    .update({ models: JSON.stringify(models), enable: 1 });
}

/** 删除工作流对应的虚拟模型 */
export async function removeWorkflowModel(u: any, workflowId: string): Promise<void> {
  await syncWorkflowModel(u, { id: workflowId, name: "", type: "image" }, "remove");
}
