import { FilmAgent } from "@/agents/FilmAgent";
import type { AgentDescriptor, AgentContext, AgentResult, ToolDefinition } from "@/core/harness/types";
import { ParseError, wrapAsAgentError } from "@/core/harness/errors";
import { db } from "@/utils/db";
import { CharacterConsistencyReviewer } from "@/review/CharacterConsistencyReviewer";

/** 服装师 Agent — 设计角色服装, 写入角色库, 失败抛错 */
export class CostumeAgent extends FilmAgent {
  readonly descriptor: AgentDescriptor = {
    id: "costume", name: "服装化妆造型 Agent", role: "costume",
    capabilities: ["character-design", "review"], version: "2.0",
    factory: async (ctx: AgentContext) => { const a = new CostumeAgent(); await a.init(ctx); return a; },
  };

  getSystemPrompt(): string {
    const rules = this.rules?.getRulesForAgent("costume") || "";
    return `你是影视服装化妆造型师。确保角色造型在镜头间保持一致。
分析角色描述, 输出造型方案 (JSON):

{
  "characterName": "角色名",
  "outfit": "服装描述",
  "hairStyle": "发型",
  "accessories": ["配饰1", "配饰2"],
  "makeup": "妆容描述",
  "consistencyNotes": "一致性建议"
}

禁止返回空角色兜底, 失败时抛错。

${rules}`;
  }

  getTools(): ToolDefinition[] { return []; }

  async execute(ctx: AgentContext): Promise<AgentResult> {
    const { character, shots, style } = ctx.input;
    const charDesc = typeof character === "string" ? character : JSON.stringify(character || {});

    try {
      const result = await this.generateText(
        `分析角色造型并检查一致性。\n角色: ${charDesc}\n镜头数: ${Array.isArray(shots) ? shots.length : 1}\n风格: ${JSON.stringify(style || {})}\n\n请只输出 JSON:`,
        { temperature: 0.3, maxTokens: 2048 },
      );
      const cleaned = result.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) {
        throw new ParseError("JSON 造型方案", result, { agentRole: "costume" });
      }
      const costume = JSON.parse(match[0]);
      if (!costume.characterName) {
        throw new ParseError("包含 characterName 的 JSON", result, { agentRole: "costume" });
      }

      // 写入角色库 (与 CallbackBridge 配合, 这里也写一次确保)
      try {
        const characterRow = {
            projectId: ctx.projectId,
            characterName: costume.characterName,
            description: charDesc.slice(0, 500),
            referenceImage: costume.referenceImage || "",
            outfitStyle: costume.outfit || "",
            hairStyle: costume.hairStyle || "",
            accessories: JSON.stringify(costume.accessories || []),
            makeup: costume.makeup || "",
            source: "harness",
            instanceId: ctx.instanceId,
            createTime: Date.now(),
            updateTime: Date.now(),
        };
        const existingCharacter = await db("o_character_library")
          .where({ projectId: ctx.projectId, characterName: costume.characterName })
          .first();
        if (existingCharacter) {
          await db("o_character_library").where("id", existingCharacter.id).update(characterRow);
        } else {
          await db("o_character_library").insert(characterRow);
        }
      } catch (dbErr) {
        console.warn("[CostumeAgent] DB write skipped:", dbErr instanceof Error ? dbErr.message : dbErr);
      }

      // 写入 MemoryBus 供 DP Agent 读取
      try {
        await this.memory.set({
          namespace: "agent:costume",
          key: `${ctx.projectId}:${costume.characterName}:outfit`,
          value: JSON.stringify(costume),
          type: "long-term",
        });
      } catch { /* 静默 */ }

      const consistency = await new CharacterConsistencyReviewer().review({
        projectId: ctx.projectId,
        characterName: costume.characterName,
        description: charDesc,
        costume,
        referenceImage: costume.referenceImage,
      });
      return {
        success: true,
        data: {
          costume,
          consistency,
          consistencyCheck: consistency.passed ? (costume.consistencyNotes || "OK") : consistency.reason,
        },
      };
    } catch (err) {
      if (err instanceof ParseError) throw err;
      throw wrapAsAgentError(err, { agentRole: "costume" });
    }
  }
}
export const descriptor: AgentDescriptor = new CostumeAgent().descriptor;
