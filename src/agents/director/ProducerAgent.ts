import { FilmAgent } from "@/agents/FilmAgent";
import type { AgentDescriptor, AgentContext, AgentResult, ToolDefinition } from "@/core/harness/types";

/** 制片人 Agent — 项目立项、预算控制、进度汇报 */
export class ProducerAgent extends FilmAgent {
  readonly descriptor: AgentDescriptor = {
    id: "producer", name: "制片人 Agent", role: "producer",
    capabilities: ["text-generation", "analysis"], version: "1.0",
    factory: async (ctx: AgentContext) => { const a = new ProducerAgent(); await a.init(ctx); return a; },
  };

  getSystemPrompt(): string {
    return `你是 Toonflow 影视项目的制片人。负责:
1. 接收用户的项目启动请求, 创建 Harness 实例
2. 监控整体进度, 在关键节点向用户汇报
3. 管理预算: 估算 Token / API 调用成本, 超预算时向用户告警

输出 JSON: { projectMeta: {...}, costReport: {...} }`;
  }

  getTools(): ToolDefinition[] { return []; }

  async execute(ctx: AgentContext): Promise<AgentResult> {
    const { projectId, novelText } = ctx.input;
    const project = await this.dbGet("o_project", { id: projectId });
    if (!project) {
      return { success: false, data: { error: `项目 ${projectId} 不存在` } };
    }
    const novelLength = (novelText || "").length;
    const estimatedCost = this.estimateCost(novelLength);
    return {
      success: true,
      data: {
        projectMeta: { projectId, projectName: project.name, novelLength },
        costReport: { estimatedTokens: estimatedCost.tokens, estimatedApiCalls: estimatedCost.apiCalls, estimatedCostCNY: estimatedCost.costCNY },
      },
    };
  }

  private estimateCost(novelLength: number): { tokens: number; apiCalls: number; costCNY: number } {
    const tokens = Math.ceil(novelLength / 2) * 10;
    const apiCalls = Math.ceil(novelLength / 500) + 24 + 24;
    const costCNY = (tokens * 0.00001 + apiCalls * 0.05);
    return { tokens, apiCalls, costCNY };
  }

  private async dbGet(table: string, where: Record<string, any>): Promise<any> {
    try { const { db } = await import("@/utils/db"); return await db(table).where(where).first(); }
    catch { return null; }
  }
}
export const descriptor: AgentDescriptor = new ProducerAgent().descriptor;
