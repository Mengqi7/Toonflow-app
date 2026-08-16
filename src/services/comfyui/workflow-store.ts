/**
 * ComfyUI 工作流存储层
 *
 * 使用项目统一的 Knex 数据库 API 进行 CRUD 操作。
 * 数据库实例通过 u.db 访问（Knex with better-sqlite3）。
 */

import { v4 as uuidv4 } from "uuid";
import {
  WorkflowRecord,
  ServerRecord,
  ComfyWorkflowJSON,
  WorkflowAnalysis,
  WorkflowSchema,
} from "./types";
import { analyzeWorkflow, detectWorkflowType } from "./workflow-analyzer";
import { normalizeWorkflow } from "./workflow-normalizer";

// ============================================================
// 服务器 CRUD
// ============================================================

export async function getServersFromDB(u: any): Promise<ServerRecord[]> {
  try {
    const rows = await u.db("o_comfyui_server")
      .select("*")
      .where("enabled", true)
      .orderBy("createTime", "desc");
    return rows as ServerRecord[];
  } catch (err: any) {
    console.warn(`[ComfyUI] 读取服务器列表失败，使用默认服务器: ${err?.message}`);
    // 表可能不存在，返回默认服务器
    return [{
      id: "default",
      name: "本地 ComfyUI",
      baseUrl: "http://127.0.0.1:8188",
      enabled: true,
      status: "active",
      createTime: Date.now(),
    }];
  }
}

// ============================================================
// 工作流 CRUD
// ============================================================

export async function getWorkflowsFromDB(u: any): Promise<WorkflowRecord[]> {
  try {
    const rows = await u.db("o_comfyui_workflow")
      .select("*")
      .where("status", "active")
      .orderBy("createTime", "desc");
    return rows as WorkflowRecord[];
  } catch {
    return [];
  }
}

export async function getWorkflowById(u: any, workflowId: string): Promise<WorkflowRecord | null> {
  try {
    const row = await u.db("o_comfyui_workflow")
      .select("*")
      .where("id", workflowId)
      .where("status", "active")
      .first();
    return (row as WorkflowRecord) || null;
  } catch {
    return null;
  }
}

export async function getWorkflowByName(u: any, name: string): Promise<WorkflowRecord | null> {
  try {
    const row = await u.db("o_comfyui_workflow")
      .select("*")
      .where("name", name)
      .where("status", "active")
      .first();
    return (row as WorkflowRecord) || null;
  } catch {
    return null;
  }
}

/**
 * 导入并分析工作流（自动保存到数据库）
 */
export async function importWorkflow(
  u: any,
  name: string,
  workflowJsonStr: string,
  serverId?: string
): Promise<{ record: WorkflowRecord; analysis: WorkflowAnalysis }> {
  // 解析原始 JSON；导入时无 object_info，仅做尽力而为的转换用于分析展示，
  // 原始 JSON 原样存储，执行时再结合 /object_info 做精确转换。
  const rawJson = JSON.parse(workflowJsonStr);
  const bestEffort: ComfyWorkflowJSON = normalizeWorkflow(rawJson);
  const analysis = analyzeWorkflow(bestEffort);
  const workflowType = detectWorkflowType(analysis);

  const id = uuidv4();
  const now = Date.now();

  // 构建 Schema
  const schema: WorkflowSchema = {
    workflowId: id,
    workflowName: name,
    workflowType,
    totalNodes: analysis.totalNodes,
    inputs: analysis.derivedParams,
    outputs: analysis.derivedOutputs,
    rawAnalysis: analysis,
  };

  // 使用 Knex API 存入数据库（只插入已知列）
  const insertData: Record<string, any> = {
    id,
    serverId: serverId || null,
    name,
    type: workflowType,
    workflowJson: workflowJsonStr, // 原始 JSON，执行时再精确转换
    analysis: JSON.stringify(analysis),
    status: "active",
    createTime: now,
  };

  // schema 和 paramMapping 列可能不存在（旧版本数据库），尝试插入
  try {
    await u.db("o_comfyui_workflow").insert({
      ...insertData,
      schema: JSON.stringify(schema),
      paramMapping: null,
    });
  } catch {
    // 降级：不使用 schema/paramMapping 列
    try {
      await u.db("o_comfyui_workflow").insert({ ...insertData, schema: JSON.stringify(schema) });
    } catch {
      await u.db("o_comfyui_workflow").insert(insertData);
    }
  }

  const record: WorkflowRecord = {
    id,
    serverId: serverId || undefined,
    name,
    type: workflowType,
    workflowJson: workflowJsonStr,
    analysis: JSON.stringify(analysis),
    schema: JSON.stringify(schema),
    status: "active",
    createTime: now,
  };

  return { record, analysis };
}

/**
 * 重新分析已有工作流（更新分析缓存）
 */
export async function reanalyzeWorkflow(
  u: any,
  workflowId: string
): Promise<WorkflowAnalysis | null> {
  const record = await getWorkflowById(u, workflowId);
  if (!record) return null;

  const rawJson = JSON.parse(record.workflowJson);
  const workflowJson: ComfyWorkflowJSON = normalizeWorkflow(rawJson);
  const analysis = analyzeWorkflow(workflowJson);

  await u.db("o_comfyui_workflow")
    .where("id", workflowId)
    .update({
      analysis: JSON.stringify(analysis),
      schema: JSON.stringify({
        workflowId,
        workflowName: record.name,
        workflowType: detectWorkflowType(analysis),
        totalNodes: analysis.totalNodes,
        inputs: analysis.derivedParams,
        outputs: analysis.derivedOutputs,
        rawAnalysis: analysis,
      }),
    });

  return analysis;
}

export async function deleteWorkflow(u: any, workflowId: string): Promise<boolean> {
  try {
    await u.db("o_comfyui_workflow")
      .where("id", workflowId)
      .update({ status: "inactive" });
    return true;
  } catch {
    return false;
  }
}
