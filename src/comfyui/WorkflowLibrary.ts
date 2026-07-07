/**
 * WorkflowLibrary — ComfyUI 工作流库管理
 *
 * CRUD + 版本管理 + 缩略图
 */
import { db } from "@/utils/db";
import { WorkflowParser } from "./WorkflowParser";

export interface Workflow {
  id: number;
  name: string;
  description?: string;
  type: string;            // "image" | "video" | "both"
  workflowJson: string;
  parameters?: string;     // JSON of WorkflowParameter[]
  thumbnail?: string;
  createdBy: string;       // "user" | "agent" | "system"
  createTime: number;
  updateTime: number;
}

export interface WorkflowVersion {
  id: number;
  workflowId: number;
  version: number;
  workflowJson: string;
  changedParams: string;
  createdAt: number;
}

export class WorkflowLibrary {
  private parser = new WorkflowParser();

  /** 导入工作流 */
  async importWorkflow(json: string, name: string, type: "image" | "video" | "both"): Promise<number> {
    // 解析并提取参数
    const wf = this.parser.parse(json);
    const params = this.parser.extractParameters(wf);

    const [id] = await db("o_comfyui_workflow").insert({
      name,
      type,
      workflow_json: json,
      parameters: JSON.stringify(params),
      createdBy: "user",
      createTime: Date.now(),
      updateTime: Date.now(),
    });
    return id;
  }

  /** 列出工作流 */
  async listWorkflows(filter?: { type?: string; createdBy?: string }): Promise<Workflow[]> {
    let q = db("o_comfyui_workflow");
    if (filter?.type) q = q.where("type", "like", `%${filter.type}%`);
    if (filter?.createdBy) q = q.where("createdBy", filter.createdBy);
    const rows = await q.orderBy("createTime", "desc");
    return rows.map((r: any) => ({
      id: r.id, name: r.name, description: r.description, type: r.type,
      workflowJson: r.workflow_json, parameters: r.parameters,
      thumbnail: r.thumbnail, createdBy: r.createdBy,
      createTime: r.createTime, updateTime: r.updateTime,
    }));
  }

  /** 获取工作流 */
  async getWorkflow(id: number): Promise<Workflow | null> {
    const r = await db("o_comfyui_workflow").where("id", id).first();
    if (!r) return null;
    return {
      id: r.id, name: r.name, description: r.description, type: r.type,
      workflowJson: r.workflow_json, parameters: r.parameters,
      thumbnail: r.thumbnail, createdBy: r.createdBy,
      createTime: r.createTime, updateTime: r.updateTime,
    };
  }

  /** 更新工作流 (创建新版本) */
  async updateWorkflow(id: number, json: string): Promise<number> {
    // 保存旧版本
    const current = await this.getWorkflow(id);
    if (current) {
      await this.saveVersion(id, current.workflowJson, "更新工作流");
    }
    // 更新
    const wf = this.parser.parse(json);
    const params = this.parser.extractParameters(wf);
    await db("o_comfyui_workflow").where("id", id).update({
      workflow_json: json,
      parameters: JSON.stringify(params),
      updateTime: Date.now(),
    });
    return id;
  }

  /** 删除工作流 */
  async deleteWorkflow(id: number): Promise<void> {
    await db("o_comfyui_workflow").where("id", id).del();
  }

  /** 保存版本 */
  private async saveVersion(workflowId: number, json: string, note: string): Promise<void> {
    try {
      const maxVersion = await db("o_comfyui_workflow_version")
        .where("workflowId", workflowId)
        .max("version as maxVer")
        .first();
      const nextVer = (maxVersion?.maxVer || 0) + 1;
      await db("o_comfyui_workflow_version").insert({
        workflowId, version: nextVer,
        workflowJson: json, changedParams: note,
        createdAt: Date.now(),
      });
    } catch {
      // o_comfyui_workflow_version 表可能不存在, 静默
    }
  }

  /** 列出版本 */
  async listVersions(id: number): Promise<WorkflowVersion[]> {
    try {
      return await db("o_comfyui_workflow_version").where("workflowId", id).orderBy("version", "desc");
    } catch {
      return [];
    }
  }

  /** 回滚到指定版本 */
  async rollbackToVersion(id: number, version: number): Promise<void> {
    const ver = await db("o_comfyui_workflow_version")
      .where({ workflowId: id, version })
      .first();
    if (!ver) throw new Error(`Version ${version} not found`);

    // 保存当前版本
    const current = await this.getWorkflow(id);
    if (current) {
      await this.saveVersion(id, current.workflowJson, `回滚前备份 v${version}`);
    }

    // 恢复
    await db("o_comfyui_workflow").where("id", id).update({
      workflow_json: ver.workflowJson,
      updateTime: Date.now(),
    });
  }
}
