/**
 * ComfyUI 执行引擎
 *
 * 统一的执行流水线：提交工作流 → 轮询结果 → 下载产物 → 返回 base64
 * 支持图片和视频产出，支持上传参考图，支持进度回调。
 *
 * 注意：这里使用原生 fetch，避免引入额外依赖。
 * 如需发送 base64 图片到 ComfyUI，需要先上传到 ComfyUI 的 /upload/image 接口。
 */

import * as path from "path";
import * as fs from "fs";

import {
  ComfyWorkflowJSON,
  ExecutionConfig,
  ExecutionResult,
  ProgressCallback,
  ComfyServer,
} from "./types";

// 动态加载 axios（避免顶层 await 兼容问题）
import type { AxiosStatic } from "axios";
let _axios: AxiosStatic | null = null;
async function getAxios(): Promise<AxiosStatic> {
  if (!_axios) {
    _axios = (await import("axios")).default as AxiosStatic;
  }
  return _axios;
}

// 动态加载 form-data（仅在上传参考图时需要）
let _formData: any = null;
async function getFormData(): Promise<any> {
  if (!_formData) {
    _formData = (await import("form-data")).default;
  }
  return _formData;
}

// ============================================================
// 类型：ComfyUI API 响应
// ============================================================

interface SubmitResponse {
  prompt_id: string;
  number?: number;
  node_errors?: Record<string, any>;
  error?: string | { message?: string; type?: string };
}

interface HistoryOutput {
  filename?: string;
  subfolder?: string;
  type?: string;
  images?: Array<{ filename: string; subfolder?: string; type?: string }>;
  gifs?: Array<{ filename: string; subfolder?: string; type?: string }>;
  videos?: Array<{ filename: string; subfolder?: string; type?: string }>;
  [key: string]: any;
}

interface HistoryEntry {
  prompt: [number, string, any];
  outputs: Record<string, HistoryOutput>;
  status?: {
    status_str?: string;
    completed?: boolean;
    messages?: Array<[string, any]>;
  };
}

interface HistoryResponse {
  [promptId: string]: HistoryEntry | undefined;
}

// ============================================================
// 执行入口
// ============================================================

/**
 * 执行 ComfyUI 工作流
 *
 * @param server   ComfyUI 服务信息
 * @param workflow 注入参数后的工作流 JSON
 * @param config   执行配置（用于上传参考图等）
 * @param onProgress 进度回调
 * @returns 执行结果（含 base64 产物）
 */
export async function executeWorkflow(
  server: ComfyServer,
  workflow: ComfyWorkflowJSON,
  config: ExecutionConfig,
  onProgress?: ProgressCallback
): Promise<ExecutionResult> {
  const startTime = Date.now();
  const baseUrl = server.baseUrl.replace(/\/+$/, "");

  try {
    // ---- Step 1: 提交工作流 ----
    // 注意：参考图上传在 executeByWorkflow 中完成（必须先上传再注入参数），
    // 因此这里直接提交。保留对遗留直接调用方的兼容：若 config 中仍是 data URL，则先上传。
    await uploadReferenceImages(baseUrl, config);

    onProgress?.({ stage: "submitting", progress: 10, message: "提交工作流..." });
    const { promptId, apiWorkflow } = await submitWorkflow(baseUrl, workflow);

    // 仅提交模式：不等待生成完成，立即返回 promptId（用于「测试」按钮）
    if ((config as any).submitOnly) {
      return {
        success: true,
        promptId,
        duration: Date.now() - startTime,
      };
    }

    // ---- Step 2: 轮询结果 ----
    onProgress?.({ stage: "executing", progress: 20, message: `执行中 (ID: ${promptId})...` });
    const maxWait = (config as any)?.options?.maxWaitMs ?? (config as any)?.maxWaitMs;
    const outputs = await pollForResult(baseUrl, promptId, onProgress, maxWait);

    // ---- Step 3: 下载产物 ----
    onProgress?.({ stage: "downloading", progress: 80, message: "下载生成结果..." });
    const results = await downloadOutputs(baseUrl, outputs);

    const duration = Date.now() - startTime;
    onProgress?.({ stage: "done", progress: 100, message: `完成 (${(duration / 1000).toFixed(1)}s)` });

    return {
      success: true,
      promptId,
      outputs: results,
      duration,
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    const errMsg = error?.message || String(error);
    onProgress?.({ stage: "error", message: errMsg });

    return {
      success: false,
      error: errMsg,
      duration,
    };
  }
}

// ============================================================
// 内部实现
// ============================================================

/**
 * 上传参考图到 ComfyUI 服务器
 * 将 base64 数据转存为临时文件，通过 upload/image 接口上传。
 * 上传成功后会把 config.referenceImage / config.referenceImages 中的 data URL 原地替换为
 * 上传后的文件名（ComfyUI 接受文件名作为 LoadImage 输入）。
 */
export async function uploadReferenceImages(baseUrl: string, config: ExecutionConfig): Promise<void> {
  const images: string[] = [];
  if (config.referenceImage) images.push(config.referenceImage);
  if (config.referenceImages) images.push(...config.referenceImages);

  // 过滤出需要上传的 data URL
  const toUpload = images.filter((img) => typeof img === "string" && img.startsWith("data:"));

  for (const img of toUpload) {
    try {
      const tmpDir = path.join(process.cwd(), "temp", "comfyui_uploads");
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }

      const ext = img.includes("image/png") ? ".png" : img.includes("image/webp") ? ".webp" : ".jpg";
      const tmpFile = path.join(tmpDir, `upload_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);

      // 解码 base64 并写入文件
      const base64Data = img.replace(/^data:image\/\w+;base64,/, "");
      fs.writeFileSync(tmpFile, Buffer.from(base64Data, "base64"));

      // 使用 form-data 上传到 ComfyUI
      const FormData = await getFormData();
      const formData = new FormData();
      formData.append("image", fs.createReadStream(tmpFile), {
        filename: path.basename(tmpFile),
      });

      await (await getAxios()).post(`${baseUrl}/upload/image`, formData, {
        headers: {
          ...formData.getHeaders(),
        },
        timeout: 30000,
      });

      // 清理临时文件
      try { fs.unlinkSync(tmpFile); } catch {}

      // 原地替换：单图字段
      if (config.referenceImage === img) {
        config.referenceImage = path.basename(tmpFile);
      }
      // 原地替换：多图数组
      if (config.referenceImages) {
        config.referenceImages = config.referenceImages.map((item) =>
          item === img ? path.basename(tmpFile) : item,
        );
      }
    } catch (err: any) {
      console.warn(`[ComfyUI] 上传参考图失败: ${err.message}`);
      // 不中断执行，继续尝试
    }
  }
}

/**
 * 提交工作流到 ComfyUI（/prompt 接口）
 *
 * ComfyUI API 格式要求：
 * {
 *   "prompt": { "1": { "class_type": "CLIPTextEncode", "inputs": {...} }, ... },
 *   "client_id": "..."
 * }
 * 但更常见的格式是：
 * {
 *   "prompt": { "1": {...}, "2": {...}, ... }
 * }
 */
async function submitWorkflow(
  baseUrl: string,
  workflow: ComfyWorkflowJSON
): Promise<{ promptId: string; apiWorkflow: any }> {
  // 构造 API 格式的工作流 payload
  const apiWorkflow: Record<string, any> = {};

  if (workflow.nodes) {
    for (const [nodeId, node] of Object.entries(workflow.nodes)) {
      const apiNode: Record<string, any> = {
        class_type: node.class_type || node.type || "Unknown",
        inputs: node.inputs || {},
      };

      if (node._meta) {
        apiNode._meta = node._meta;
      }

      apiWorkflow[nodeId] = apiNode;
    }
  }

  const payload = {
    prompt: apiWorkflow,
    client_id: `toonflow_${Date.now()}`,
  };

  let data: SubmitResponse;
  try {
    const resp = await (await getAxios()).post<SubmitResponse>(
      `${baseUrl}/prompt`,
      payload,
      { timeout: 15000 }
    );
    data = resp.data;
  } catch (err: any) {
    // ComfyUI 在验证失败时返回 400，错误体在 response.data 中
    const respData = err?.response?.data;
    if (respData) {
      throw new Error(formatComfyUIError(respData));
    }
    throw new Error(`ComfyUI 请求失败: ${err?.message || err}`);
  }

  // 检查错误
  if (data.error) {
    const errMsg = typeof data.error === "string" ? data.error : data.error.message || JSON.stringify(data.error);
    throw new Error(`ComfyUI 提交失败: ${errMsg}`);
  }

  if (data.node_errors && Object.keys(data.node_errors).length > 0) {
    throw new Error(formatComfyUIError(data));
  }

  if (!data.prompt_id) {
    throw new Error("ComfyUI 返回异常：未获取到 prompt_id");
  }

  return { promptId: data.prompt_id, apiWorkflow };
}

/**
 * 把 ComfyUI 返回的 node_errors / error 转成可读的中文错误信息
 */
function formatComfyUIError(data: any): string {
  const parts: string[] = [];

  const topErr = data?.error;
  if (topErr) {
    if (typeof topErr === "string") parts.push(topErr);
    else if (topErr?.message) parts.push(topErr.message);
  }

  if (data?.node_errors && typeof data.node_errors === "object") {
    for (const [nodeId, nodeErr] of Object.entries(data.node_errors) as [string, any][]) {
      const classType = nodeErr?.class_type || `节点 ${nodeId}`;
      const errors: any[] = nodeErr?.errors || [];
      if (errors.length === 0) continue;
      const msgs = errors.map((e: any) => {
        const inputName = e?.extra_info?.input_name || e?.input_name;
        const label = inputName ? `${inputName}` : "";
        const detail = e?.details ? `：${e.details}` : "";
        return `${label}${e?.message || "校验失败"}${detail}`;
      });
      parts.push(`${classType} -> ${msgs.join("；")}`);
    }
  }

  return parts.length ? `ComfyUI 校验失败：${parts.join("；")}` : "ComfyUI 提交失败";
}

/**
 * 轮询 ComfyUI 直到任务完成
 * maxWaitMs 默认 45 分钟——H3 等大模型完整生成常超过原 10 分钟上限，
 * 导致“执行超时”误报（任务实际仍在 ComfyUI 后台运行）
 */
async function pollForResult(
  baseUrl: string,
  promptId: string,
  onProgress?: ProgressCallback,
  maxWaitMs: number = 45 * 60 * 1000,  // 默认 45 分钟
  pollIntervalMs: number = 3000         // 3 秒轮询
): Promise<Record<string, HistoryOutput>> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const entry = await fetchHistory(baseUrl, promptId);

    if (entry && entry.outputs && Object.keys(entry.outputs).length > 0) {
      onProgress?.({
        stage: "executing",
        progress: 50 + Math.min(30, Math.floor((Date.now() - startTime) / 1000)),
        message: "生成完成，开始下载...",
      });
      return entry.outputs;
    }

    // 检查状态
    if (entry?.status?.status_str === "error") {
      const errorMsg =
        entry.status.messages
          ?.map((m: any) => (typeof m[1] === "string" ? m[1] : JSON.stringify(m[1])))
          .join("; ") || "未知错误";
      throw new Error(`ComfyUI 执行错误: ${errorMsg}`);
    }

    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    onProgress?.({
      stage: "executing",
      progress: 20 + Math.min(40, Math.floor(elapsed / 5)),
      message: `等待生成中... (${elapsed}s)`,
    });

    await sleep(pollIntervalMs);
  }

  throw new Error(`ComfyUI 执行超时 (${(maxWaitMs / 1000).toFixed(0)}s)`);
}

/**
 * 获取 ComfyUI 执行历史
 */
async function fetchHistory(
  baseUrl: string,
  promptId: string
): Promise<HistoryEntry | null> {
  try {
    const resp = await (await getAxios()).get<HistoryResponse>(
      `${baseUrl}/history/${promptId}`,
      { timeout: 10000 }
    );
    return resp.data?.[promptId] || null;
  } catch (err: any) {
    if (err.response?.status === 404) return null;
    console.warn(`[ComfyUI] 查询历史失败: ${err.message}`);
    return null;
  }
}

/**
 * 下载所有产物到本地，转为 base64 data URL
 */
async function downloadOutputs(
  baseUrl: string,
  outputs: Record<string, HistoryOutput>
): Promise<Array<{ type: "image" | "video"; filename: string; dataUrl: string; mimeType: string }>> {
  const results: Array<{ type: "image" | "video"; filename: string; dataUrl: string; mimeType: string }> = [];

  const isVideoFile = (filename: string) => /\.(mp4|webm|avi|mov|mkv|gif)$/i.test(filename);

  for (const [, output] of Object.entries(outputs)) {
    // 收集所有产物条目（ComfyUI 的 SaveVideo 会把 .mp4 放在 images 下，需按扩展名判断）
    const items: Array<{ filename: string; subfolder?: string; type?: string }> = [];
    for (const img of output.images || []) items.push(img);
    for (const vid of output.videos || output.gifs || []) items.push(vid);

    for (const item of items) {
      const kind: "image" | "video" = isVideoFile(item.filename) ? "video" : "image";
      try {
        const dataUrl = await downloadAsBase64(baseUrl, item);
        results.push({
          type: kind,
          filename: item.filename,
          dataUrl,
          mimeType: guessMimeType(item.filename),
        });
      } catch (err: any) {
        console.warn(`[ComfyUI] 下载产物失败 ${item.filename}: ${err.message}`);
      }
    }

    // 直接的 filename（某些自定义节点）
    if (items.length === 0 && output.filename) {
      try {
        const dataUrl = await downloadAsBase64(baseUrl, { filename: output.filename, subfolder: output.subfolder, type: output.type });
        results.push({
          type: isVideoFile(output.filename) ? "video" : "image",
          filename: output.filename,
          dataUrl,
          mimeType: guessMimeType(output.filename),
        });
      } catch (err: any) {
        console.warn(`[ComfyUI] 下载产物失败 ${output.filename}: ${err.message}`);
      }
    }
  }

  if (results.length === 0) {
    throw new Error("ComfyUI 执行完成但未生成任何产物");
  }

  return results;
}

/**
 * 从 ComfyUI 下载单个文件并转为 base64 data URL
 */
async function downloadAsBase64(
  baseUrl: string,
  fileInfo: { filename: string; subfolder?: string; type?: string }
): Promise<string> {
  const url = buildFileUrl(baseUrl, fileInfo);

  const resp = await (await getAxios()).get<ArrayBuffer>(url, {
    responseType: "arraybuffer",
    timeout: 120000, // 2 分钟超时（大文件）
  });

  const buffer = Buffer.from(resp.data);
  const mimeType = guessMimeType(fileInfo.filename);
  const base64 = buffer.toString("base64");

  return `data:${mimeType};base64,${base64}`;
}

/**
 * 构造 ComfyUI 文件下载 URL
 */
function buildFileUrl(
  baseUrl: string,
  fileInfo: { filename: string; subfolder?: string; type?: string }
): string {
  const params = new URLSearchParams();
  params.set("filename", fileInfo.filename);
  if (fileInfo.subfolder) params.set("subfolder", fileInfo.subfolder);
  if (fileInfo.type) params.set("type", fileInfo.type);

  return `${baseUrl}/view?${params.toString()}`;
}

/**
 * 根据文件名猜测 MIME 类型
 */
function guessMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const mimeMap: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".avi": "video/avi",
    ".mov": "video/quicktime",
    ".mkv": "video/x-matroska",
  };
  return mimeMap[ext] || "application/octet-stream";
}

// ============================================================
// 健康检查
// ============================================================

/** /object_info 缓存（按 baseUrl），避免重复拉取大响应 */
const objectInfoCache = new Map<string, any>();

/**
 * 获取 ComfyUI 节点对象信息（/object_info），用于 UI→API 的精确转换。
 * 结果按 baseUrl 缓存。
 */
export async function fetchObjectInfo(baseUrl: string): Promise<Record<string, any>> {
  const key = baseUrl.replace(/\/+$/, "");
  if (objectInfoCache.has(key)) return objectInfoCache.get(key);

  const resp = await (await getAxios()).get<Record<string, any>>(`${key}/object_info`, {
    timeout: 60000,
  });
  const data = resp.data || {};
  objectInfoCache.set(key, data);
  return data;
}

/**
 * 检查 ComfyUI 服务是否可用
 */
export async function checkServerHealth(baseUrl: string): Promise<{
  online: boolean;
  message: string;
  systemInfo?: any;
}> {
  try {
    const resp = await (await getAxios()).get(`${baseUrl}/system_stats`, { timeout: 5000 });
    return {
      online: true,
      message: "服务正常",
      systemInfo: resp.data,
    };
  } catch (err: any) {
    // 如果 system_stats 接口不存在，尝试 queue 接口
    try {
      await (await getAxios()).get(`${baseUrl}/queue`, { timeout: 5000 });
      return {
        online: true,
        message: "服务正常（system_stats 接口不可用）",
      };
    } catch (e2: any) {
      return {
        online: false,
        message: `无法连接: ${err.message}`,
      };
    }
  }
}

// ============================================================
// 工具函数
// ============================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
