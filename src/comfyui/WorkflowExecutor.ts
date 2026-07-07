/**
 * WorkflowExecutor — ComfyUI 工作流执行器
 *
 * 提交执行 + WS 进度 + 结果下载
 */
import axios from "axios";
import { db } from "@/utils/db";
import { WorkflowParser } from "./WorkflowParser";
import { ParameterEditor } from "./ParameterEditor";
import { ComfyUIResultHandler } from "./ComfyUIResultHandler";
import { ComfyUIClient } from "./ComfyUIClient";
import { v4 as uuid } from "uuid";
import fs from "fs";
import path from "path";

export interface ExecutionResult {
  promptId: string;
  outputs: GeneratedAsset[];
  executionTime: number;
  vramUsed?: number;
}

export interface GeneratedAsset {
  filename: string;
  subfolder: string;
  type: "image" | "video";
  localPath?: string;
  url?: string;
}

export class WorkflowExecutor {
  private parser = new WorkflowParser();
  private paramEditor = new ParameterEditor();

  /**
   * 执行工作流
   * @param workflowId 工作流 ID
   * @param params 参数
   * @param onProgress 进度回调
   * @param projectId 项目 ID (用于保存产物)
   */
  async execute(
    workflowId: number,
    params: Record<string, any>,
    onProgress?: (nodeId: string, progress: number, max: number) => void,
    projectId?: number,
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    // 1. 获取工作流
    const wf = await db("o_comfyui_workflow").where("id", workflowId).first();
    if (!wf) throw new Error(`工作流 ${workflowId} 不存在`);

    // 2. 注入参数
    const injectedJson = this.paramEditor.injectParameters(wf.workflow_json, params);

    // 3. 获取 ComfyUI 服务
    const server = await db("o_comfyui_server").where("enabled", 1).first();
    if (!server) throw new Error("没有可用的 ComfyUI 服务");

    // 4. 创建客户端并提交
    const client = new ComfyUIClient({ baseUrl: server.baseUrl, wsUrl: server.wsUrl });
    const resultHandler = new ComfyUIResultHandler(client);

    // 5. 提交工作流 (把 JSON 转为 ComfyUI API 格式)
    const wfJson = this.parser.parse(injectedJson);
    const apiPrompt = this.convertToApiFormat(wfJson);
    const promptId = await client.queuePrompt(apiPrompt as any);

    // 6. 等待完成 (轮询)
    const history = await client.waitForCompletion(promptId, onProgress);

    // 7. 提取产物
    const assets = resultHandler.extractOutputs(history);

    // 8. 下载产物
    if (projectId && assets.length > 0) {
      const outputDir = path.resolve(`production/${projectId}`);
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
      for (const asset of assets) {
        try {
          const buffer = await client.getImage(asset.filename, asset.subfolder, asset.type);
          const localPath = path.join(outputDir, `${uuid()}.${asset.type === "video" ? "mp4" : "png"}`);
          fs.writeFileSync(localPath, buffer);
          asset.localPath = localPath;
        } catch (err) {
          console.warn("[WorkflowExecutor] Failed to download asset:", err);
        }
      }
    }

    return {
      promptId,
      outputs: assets,
      executionTime: Date.now() - startTime,
    };
  }

  /** 中断执行 */
  async interrupt(promptId: string): Promise<void> {
    const server = await db("o_comfyui_server").where("enabled", 1).first();
    if (!server) return;
    await axios.post(`${server.baseUrl}/interrupt`, {}, { timeout: 5000 });
  }

  /** 查询队列 */
  async getQueue(): Promise<any> {
    const server = await db("o_comfyui_server").where("enabled", 1).first();
    if (!server) return { queue: [] };
    const resp = await axios.get(`${server.baseUrl}/queue`, { timeout: 5000 });
    return resp.data;
  }

  /** 转换为 ComfyUI API 格式 */
  private convertToApiFormat(wf: any): Record<string, any> {
    // ComfyUI API 格式: { "nodeId": { "class_type": "...", "inputs": {...} } }
    const result: Record<string, any> = {};
    for (const node of wf.nodes || []) {
      const inputs: Record<string, any> = {};
      if (Array.isArray(node.widgets_values)) {
        // 把 widgets_values 映射到 inputs (简化: 按顺序)
        node.widgets_values.forEach((val: any, i: number) => {
          inputs[`widget_${i}`] = val;
        });
      }
      if (node.inputs && typeof node.inputs === "object" && !Array.isArray(node.inputs)) {
        Object.assign(inputs, node.inputs);
      }
      result[String(node.id)] = {
        class_type: node.type,
        inputs,
      };
    }
    return result;
  }
}
