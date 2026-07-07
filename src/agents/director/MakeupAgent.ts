import { FilmAgent } from "@/agents/FilmAgent";
import type { AgentDescriptor, AgentContext, AgentResult, ToolDefinition } from "@/core/harness/types";

/** 化妆师 Agent — 设计角色妆容 */
export class MakeupAgent extends FilmAgent {
  readonly descriptor: AgentDescriptor = {
    id: "makeup", name: "化妆师 Agent", role: "makeup",
    capabilities: ["character-design", "text-generation"], version: "1.0",
    factory: async (ctx: AgentContext) => { const a = new MakeupAgent(); await a.init(ctx); return a; },
  };

  getSystemPrompt(): string {
    return `你是影视化妆师。分析角色设定, 设计妆容方案。

输出 JSON:
{
  "makeup": {
    "characterName": "角色名",
    "look": "妆容描述 (底妆/眼妆/唇妆/修容)",
    "effects": ["特效妆1", "特效妆2"],
    "ageAdjustment": "年龄调整说明",
    "consistencyNotes": "跨场次一致性建议"
  }
}`;
  }

  getTools(): ToolDefinition[] { return []; }

  async execute(ctx: AgentContext): Promise<AgentResult> {
    const { character, style } = ctx.input;
    const charDesc = typeof character === "string" ? character : JSON.stringify(character);
    try {
      const result = await this.generateText(
        `设计角色妆容。\n角色: ${charDesc}\n风格参考: ${JSON.stringify(style || {})}\n\n请只输出 JSON:`,
        { temperature: 0.4, maxTokens: 2048 },
      );
      const cleaned = result.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      const makeup = match ? JSON.parse(match[0]) : {};
      return { success: true, data: { makeup: makeup.makeup || makeup } };
    } catch (err) {
      return { success: false, data: { error: err instanceof Error ? err.message : String(err) } };
    }
  }
}
export const descriptor: AgentDescriptor = new MakeupAgent().descriptor;
