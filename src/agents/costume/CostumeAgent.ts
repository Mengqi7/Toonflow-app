import { FilmAgent } from "@/agents/FilmAgent";
import type { AgentDescriptor, AgentContext, AgentResult, ToolDefinition } from "@/core/harness/types";
import { db } from "@/utils/db";

export class CostumeAgent extends FilmAgent {
  readonly descriptor: AgentDescriptor = {
    id: "costume", name: "服装化妆造型 Agent", role: "costume",
    capabilities: ["character-design", "review"], version: "1.0",
    factory: async (ctx: AgentContext) => { const ag = new CostumeAgent(); await ag.init(ctx); return ag; },
  };

  getSystemPrompt(): string {
    return `你是影视服装化妆造型师。确保角色造型在镜头间保持一致。
分析角色描述，输出造型方案 (JSON):

{
  "characterName": "角色名",
  "outfit": "服装描述",
  "hairStyle": "发型",
  "accessories": ["配饰1", "配饰2"],
  "makeup": "妆容描述",
  "consistencyNotes": "一致性建议"
}`;
  }

  getTools(): ToolDefinition[] { return []; }

  async execute(ctx: AgentContext): Promise<AgentResult> {
    const { character, shots } = ctx.input;
    const charDesc = typeof character === "string" ? character : JSON.stringify(character);

    try {
      const result = await this.generateText(
        `分析角色造型并检查一致性。\n角色: ${charDesc}\n镜头数: ${Array.isArray(shots) ? shots.length : 1}\n\n请只输出 JSON：`,
        { temperature: 0.3 }
      );
      const cleaned = result.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      let costume: any = {};
      if (match) costume = JSON.parse(match[0]);

      // 存储到角色形象库
      try {
        await db("o_character_library").insert({
          id: Date.now(),
          projectId: ctx.projectId,
          characterName: costume.characterName || "未命名角色",
          description: charDesc.slice(0, 500),
          referenceImage: "",
          outfitStyle: costume.outfit || "",
          hairStyle: costume.hairStyle || "",
          accessories: JSON.stringify(costume.accessories || []),
          createTime: Date.now(),
          updateTime: Date.now(),
        });
      } catch (e) {
        console.warn("[CostumeAgent] Failed to save character:", e);
      }

      return { success: true, data: { costume: costume, consistencyCheck: costume.consistencyNotes || "OK" } };
    } catch {
      return { success: true, data: { costume: {}, consistencyCheck: "使用默认造型" } };
    }
  }
}
export const descriptor: AgentDescriptor = new CostumeAgent().descriptor;
