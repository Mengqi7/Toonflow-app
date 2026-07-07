import { FilmAgent } from "@/agents/FilmAgent";
import type { AgentDescriptor, AgentContext, AgentResult, ToolDefinition } from "@/core/harness/types";

/** 场记 Agent — 审核剧本/分镜的连续性 */
export class ScriptSupervisorAgent extends FilmAgent {
  readonly descriptor: AgentDescriptor = {
    id: "script_supervisor", name: "场记 Agent", role: "script_supervisor",
    capabilities: ["review", "analysis", "text-generation"], version: "1.0",
    factory: async (ctx: AgentContext) => { const a = new ScriptSupervisorAgent(); await a.init(ctx); return a; },
  };

  getSystemPrompt(): string {
    return `你是场记/剧本监督。检查剧本和分镜的连续性:
- 时间线一致性 (季节/天气/年龄)
- 角色动机连贯
- 道具位置不矛盾
- 跨场次对白衔接

输出 JSON: { continuityIssues: [{ scene, issue, severity, suggestion }] }`;
  }

  getTools(): ToolDefinition[] { return []; }

  async execute(ctx: AgentContext): Promise<AgentResult> {
    const { script, storyboardPlan } = ctx.input;
    try {
      const result = await this.generateText(
        `检查剧本和分镜的连续性问题。\n剧本: ${typeof script === "string" ? script.slice(0, 4000) : JSON.stringify(script).slice(0, 4000)}\n分镜: ${JSON.stringify(storyboardPlan).slice(0, 2000)}\n\n请只输出 JSON:`,
        { temperature: 0.3, maxTokens: 2048 },
      );
      const cleaned = result.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      const parsed = match ? JSON.parse(match[0]) : { continuityIssues: [] };
      return { success: true, data: { continuityIssues: parsed.continuityIssues || [] } };
    } catch {
      return { success: true, data: { continuityIssues: [] } };
    }
  }
}
export const descriptor: AgentDescriptor = new ScriptSupervisorAgent().descriptor;
