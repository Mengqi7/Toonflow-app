import { FilmAgent } from "@/agents/FilmAgent";
import type { AgentDescriptor, AgentContext, AgentResult, ToolDefinition } from "@/core/harness/types";

/** 服装穿戴 Agent — 设计服装穿戴方案 (与 costume 服装设计协作) */
export class WardrobeAgent extends FilmAgent {
  readonly descriptor: AgentDescriptor = {
    id: "wardrobe", name: "服装穿戴 Agent", role: "wardrobe",
    capabilities: ["character-design", "text-generation"], version: "1.0",
    factory: async (ctx: AgentContext) => { const a = new WardrobeAgent(); await a.init(ctx); return a; },
  };

  getSystemPrompt(): string {
    return `你是影视服装穿戴师。根据服装设计, 制定具体穿戴方案。

输出 JSON:
{
  "wardrobe": {
    "characterName": "角色名",
    "pieces": [
      { "name": "白色衬衫", "description": "解开 top 两颗扣子", "layer": 1 },
      { "name": "黑色西装", "description": "敞开穿着", "layer": 2 }
    ],
    "accessories": ["手表", "领带夹"],
    "notes": "穿戴注意事项"
  }
}`;
  }

  getTools(): ToolDefinition[] { return []; }

  async execute(ctx: AgentContext): Promise<AgentResult> {
    const { character, costume, style } = ctx.input;
    try {
      const result = await this.generateText(
        `制定服装穿戴方案。\n角色: ${JSON.stringify(character)}\n服装设计: ${JSON.stringify(costume || {})}\n风格: ${JSON.stringify(style || {})}\n\n请只输出 JSON:`,
        { temperature: 0.4, maxTokens: 2048 },
      );
      const cleaned = result.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      const wardrobe = match ? JSON.parse(match[0]) : {};
      return { success: true, data: { wardrobe: wardrobe.wardrobe || wardrobe } };
    } catch (err) {
      return { success: false, data: { error: err instanceof Error ? err.message : String(err) } };
    }
  }
}
export const descriptor: AgentDescriptor = new WardrobeAgent().descriptor;
