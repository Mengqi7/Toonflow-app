import { FilmAgent } from "@/agents/FilmAgent";
import type { AgentDescriptor, AgentContext, AgentResult, ToolDefinition } from "@/core/harness/types";
import { ParseError, wrapAsAgentError } from "@/core/harness/errors";
import type { VisualStyleSpec } from "@/agents/director/DirectorAgent";

export interface LightingSpec {
  lightSource: "natural" | "artificial" | "mixed";
  lightType: "key" | "fill" | "rim" | "ambient";
  intensity: "low" | "medium" | "high";
  colorTemp: number;
  shadowHardness: "hard" | "soft" | "mixed";
  direction: string;
}

export interface ArtDirectionSpec {
  sceneElements: string[];
  colorAccents: string[];
  textureNotes: string[];
  atmosphere: string;
}

/** 灯光师 Agent — 分析场景, 输出灯光方案和美术设定, 失败抛错 */
export class LightingAgent extends FilmAgent {
  readonly descriptor: AgentDescriptor = {
    id: "lighting", name: "灯光美术 Agent", role: "lighting",
    capabilities: ["lighting", "text-generation"], version: "2.0",
    factory: async (ctx: AgentContext) => { const a = new LightingAgent(); await a.init(ctx); return a; },
  };

  getSystemPrompt(): string {
    const rules = this.rules?.getRulesForAgent("lighting") || "";
    return `你是资深影视灯光美术指导。分析场景需求, 输出结构化的灯光方案和美术设定。

输出格式必须严格遵循 JSON:
{
  "lighting": {
    "lightSource": "natural|artificial|mixed",
    "lightType": "key|fill|rim|ambient",
    "intensity": "low|medium|high",
    "colorTemp": 5600,
    "shadowHardness": "hard|soft|mixed",
    "direction": "top-right-45deg"
  },
  "artDirection": {
    "sceneElements": ["元素1", "元素2"],
    "colorAccents": ["#COLOR1"],
    "textureNotes": ["质感说明"],
    "atmosphere": "氛围描述"
  }
}

禁止返回 default 方案, 失败时抛错。

${rules}`;
  }

  getTools(): ToolDefinition[] { return []; }

  async execute(ctx: AgentContext): Promise<AgentResult> {
    const { shot, style, scene } = ctx.input;
    const desc = typeof shot === "string" ? shot : (shot?.description || JSON.stringify(shot || scene || {}));
    const styleRef = style ? JSON.stringify(style) : "";

    try {
      const result = await this.generateText(
        `设计光影方案。\n场景: ${desc}\n风格参考: ${styleRef}\n\n请只输出 JSON:`,
        { temperature: 0.5, maxTokens: 2048 },
      );
      const cleaned = result.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) {
        throw new ParseError("JSON 灯光方案", result, { agentRole: "lighting" });
      }
      const parsed = JSON.parse(match[0]);
      if (!parsed.lighting && !parsed.artDirection) {
        throw new ParseError("包含 lighting/artDirection 的 JSON", result, { agentRole: "lighting" });
      }
      return {
        success: true,
        data: {
          lightingSpec: parsed.lighting || parsed,
          artDirectionSpec: parsed.artDirection || parsed.artDirectionSpec || {},
        },
      };
    } catch (err) {
      if (err instanceof ParseError) throw err;
      throw wrapAsAgentError(err, { agentRole: "lighting" });
    }
  }
}
export const descriptor: AgentDescriptor = new LightingAgent().descriptor;
