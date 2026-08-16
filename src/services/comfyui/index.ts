/**
 * ComfyUI 服务模块 - 统一入口
 *
 * 封装了工作流导入分析、动态参数注入、执行引擎、服务器管理。
 * 所有数据库操作通过 u.db (Knex) 异步执行。
 *
 * 使用方式：
 *   import { ComfyUIService } from "@/services/comfyui";
 *   const service = new ComfyUIService(u);
 *   const result = await service.executeByModel("model-name", config);
 */

import {
  WorkflowRecord,
  ServerRecord,
  ExecutionConfig,
  ExecutionResult,
  ProgressCallback,
  WorkflowAnalysis,
  WorkflowSchema,
} from "./types";
import { analyzeWorkflow, detectWorkflowType, getAnalysisSummary } from "./workflow-analyzer";
import { injectParams } from "./param-injector";
import { executeWorkflow, checkServerHealth, uploadReferenceImages, fetchObjectInfo } from "./execution-engine";
import { normalizeWorkflow } from "./workflow-normalizer";
import { getFirstAvailableServer } from "./server-manager";
import {
  getServersFromDB,
  getWorkflowsFromDB,
  getWorkflowById,
  getWorkflowByName,
  importWorkflow as importWorkflowToDB,
  reanalyzeWorkflow as reanalyzeInDB,
  deleteWorkflow as deleteFromDB,
} from "./workflow-store";

export class ComfyUIService {
  private u: any;

  constructor(u: any) {
    this.u = u;
  }

  // ============================================================
  // 核心执行 API
  // ============================================================

  /**
   * 根据模型名称执行 ComfyUI 工作流
   */
  async executeByModel(
    modelName: string,
    config: ExecutionConfig,
    onProgress?: ProgressCallback
  ): Promise<ExecutionResult> {
    const workflow = await this.findWorkflowByModel(modelName);
    if (!workflow) {
      return {
        success: false,
        error: `未找到匹配模型 "${modelName}" 的 ComfyUI 工作流，请先在 ComfyUI 管理页面导入相应的工作流`,
      };
    }
    return this.executeByWorkflow(workflow, config, onProgress);
  }

  /**
   * 根据工作流 ID 执行
   */
  async executeById(
    workflowId: string,
    config: ExecutionConfig,
    onProgress?: ProgressCallback
  ): Promise<ExecutionResult> {
    const workflow = await getWorkflowById(this.u, workflowId);
    if (!workflow) {
      return { success: false, error: `工作流不存在: ${workflowId}` };
    }
    return this.executeByWorkflow(workflow, config, onProgress);
  }

  /**
   * 根据工作流名称执行
   */
  async executeByName(
    workflowName: string,
    config: ExecutionConfig,
    onProgress?: ProgressCallback
  ): Promise<ExecutionResult> {
    const workflow = await getWorkflowByName(this.u, workflowName);
    if (!workflow) {
      return { success: false, error: `工作流不存在: ${workflowName}` };
    }
    return this.executeByWorkflow(workflow, config, onProgress);
  }

  // ============================================================
  // 工作流管理 API
  // ============================================================

  /**
   * 分析工作流 JSON（无需保存到数据库，同步）
   */
  analyzeWorkflowJSON(workflowJsonStr: string): WorkflowAnalysis {
    const json = JSON.parse(workflowJsonStr);
    return analyzeWorkflow(normalizeWorkflow(json));
  }

  /**
   * 导入工作流（自动分析 + 保存到数据库）
   */
  async importWorkflow(
    name: string,
    workflowJsonStr: string,
    serverId?: string
  ): Promise<{ record: WorkflowRecord; analysis: WorkflowAnalysis }> {
    return await importWorkflowToDB(this.u, name, workflowJsonStr, serverId);
  }

  /**
   * 重新分析已有工作流
   */
  async reanalyzeWorkflow(workflowId: string): Promise<WorkflowAnalysis | null> {
    return await reanalyzeInDB(this.u, workflowId);
  }

  /**
   * 删除工作流（软删除）
   */
  async deleteWorkflow(workflowId: string): Promise<boolean> {
    return await deleteFromDB(this.u, workflowId);
  }

  /**
   * 获取工作流列表
   */
  async getWorkflows(): Promise<WorkflowRecord[]> {
    return await getWorkflowsFromDB(this.u);
  }

  /**
   * 获取工作流详情
   */
  async getWorkflowInfo(workflowId: string): Promise<{
    record: WorkflowRecord;
    analysis?: WorkflowAnalysis;
    schema?: WorkflowSchema;
  } | null> {
    const record = await getWorkflowById(this.u, workflowId);
    if (!record) return null;

    let analysis: WorkflowAnalysis | undefined;
    let schema: WorkflowSchema | undefined;

    try {
      if (record.analysis) analysis = JSON.parse(record.analysis);
    } catch {}
    try {
      if (record.schema) schema = JSON.parse(record.schema);
    } catch {}

    return { record, analysis, schema };
  }

  // ============================================================
  // 服务器管理 API
  // ============================================================

  /**
   * 获取所有服务器
   */
  async getServers(): Promise<ServerRecord[]> {
    return await getServersFromDB(this.u);
  }

  /**
   * 检查服务器健康状态
   */
  async checkServer(baseUrl: string): Promise<{ online: boolean; message: string }> {
    return await checkServerHealth(baseUrl);
  }

  // ============================================================
  // 内部方法
  // ============================================================

  /**
   * 根据模型名称查找匹配的工作流
   */
  private async findWorkflowByModel(modelName: string): Promise<WorkflowRecord | null> {
    const workflows = await getWorkflowsFromDB(this.u);
    if (workflows.length === 0) return null;

    const exact = workflows.find(
      (w) => w.name.toLowerCase() === modelName.toLowerCase()
    );
    if (exact) return exact;

    const lowerModel = modelName.toLowerCase();
    const fuzzy = workflows.find(
      (w) =>
        w.name.toLowerCase().includes(lowerModel) ||
        lowerModel.includes(w.name.toLowerCase())
    );
    if (fuzzy) return fuzzy;

    return workflows[0];
  }

  /**
   * 核心执行逻辑
   */
  private async executeByWorkflow(
    workflow: WorkflowRecord,
    config: ExecutionConfig,
    onProgress?: ProgressCallback
  ): Promise<ExecutionResult> {
    // 1. 获取可用服务器
    const servers = await getServersFromDB(this.u);
    const server = await getFirstAvailableServer(servers);

    if (!server) {
      return {
        success: false,
        error: "没有可用的 ComfyUI 服务，请确保 ComfyUI 已启动并检查服务器配置",
      };
    }

    // 2. 拉取 /object_info（用于 UI→API 的精确 widget 映射）
    let objectInfo: Record<string, any> | undefined;
    try {
      objectInfo = await fetchObjectInfo(server.baseUrl);
    } catch (infoErr: any) {
      console.warn("[ComfyUI] 获取 object_info 失败（将使用降级转换）:", infoErr?.message);
    }

    // 3. 解析并规范化工作流（UI 格式 → API 格式，依赖 object_info 精确映射 widget）
    let workflowJson;
    try {
      workflowJson = normalizeWorkflow(JSON.parse(workflow.workflowJson), objectInfo);
    } catch {
      return { success: false, error: "工作流 JSON 解析失败" };
    }

    // 4. 分析工作流（始终基于转换后的 API 格式重新分析，确保注入目标正确）
    const analysis: WorkflowAnalysis = analyzeWorkflow(workflowJson);

    // 5. 上传参考图（必须先于参数注入，这样注入到工作流里的是上传后的文件名）
    try {
      await uploadReferenceImages(server.baseUrl, config);
    } catch (uploadErr: any) {
      console.warn("[ComfyUI] 上传参考图失败:", uploadErr?.message);
    }

    // 6. 注入参数
    const injectedWorkflow = injectParams(workflowJson, analysis, config);

    // 7. 执行
    const result = await executeWorkflow(server, injectedWorkflow, config, onProgress);
    return result;
  }
}

// 单例工厂
export function createComfyUIService(u: any): ComfyUIService {
  return new ComfyUIService(u);
}

// 子模块公共 API
export {
  analyzeWorkflow,
  detectWorkflowType,
  getAnalysisSummary,
} from "./workflow-analyzer";

export {
  injectParams,
  ensureSeed,
  getRequiredParams,
} from "./param-injector";

export {
  executeWorkflow,
  checkServerHealth,
} from "./execution-engine";

export {
  getFirstAvailableServer,
  getAvailableServers,
  findServerById,
  getDefaultServerUrl,
} from "./server-manager";

export {
  getServersFromDB,
  getWorkflowsFromDB,
  getWorkflowById,
  getWorkflowByName,
  importWorkflow as importWorkflowToDB,
  reanalyzeWorkflow,
  deleteWorkflow,
} from "./workflow-store";

export { normalizeWorkflow } from "./workflow-normalizer";

export * from "./types";
