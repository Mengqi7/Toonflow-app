import { FilmAgent } from "@/agents/FilmAgent";
import type { AgentDescriptor, AgentContext, AgentResult, ToolDefinition } from "@/core/harness/types";
import type { VisualStyleSpec } from "@/agents/director/DirectorAgent";

export interface LightingSpec {
  lightSource: "natural" | "artificial" | "mixed";
  lightType: "key" | "fill" | "rim" | "ambient";
  intensity: "low" | "medium" | "high";
  colorTemp: number;  // Kelvin
  shadowHardness: "hard" | "soft" | "mixed";
  direction: string;  // e.g. "top-right-45deg"
}

export interface ArtDirectionSpec {
  sceneElements: string[];
  colorAccents: string[];
  textureNotes: string[];
  atmosphere: string;
}

export class LightingAgent extends FilmAgent {
  readonly descriptor: AgentDescriptor = {
    id: "lighting", name: "灯光美术 Agent", role: "lighting",
    capabilities: ["lighting", "text-generation"], version: "1.0",
    factory: async (ctx: AgentContext) => { const ag = new LightingAgent(); await ag.init(ctx); return ag; },
  };

  getSystemPrompt(): string {
    return `你是资深影视灯光美术指导。分析场景需求，输出结构化的灯光方案和美术设定。
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
}`;
  }

  getTools(): ToolDefinition[] { return []; }

  async execute(ctx: AgentContext): Promise<AgentResult> {
    const { shot, style, scene } = ctx.input;
    const desc = typeof shot === "string" ? shot : (shot?.description || JSON.stringify(shot));
    const styleRef = style ? JSON.stringify(style) : "";

    try {
      const result = await this.generateText(
        `设计光影方案。\n场景: ${desc}\n风格参考: ${styleRef}\n\n请只输出 JSON：`,
        { temperature: 0.5, maxTokens: 2048 }
      );
      const cleaned = result.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleaned.match(/\{[\s\S]*\}/)?.[0] || cleaned);

      return {
        success: true,
        data: {
          lightingSpec: parsed.lighting || this.defaultLighting(styleRef),
          artDirectionSpec: parsed.artDirection || this.defaultArtDirection(desc),
        },
      };
    } catch {
      return {
        success: true,
        data: {
          lightingSpec: this.defaultLighting(styleRef),
          artDirectionSpec: this.defaultArtDirection(desc),
        },
      };
    }
  }

  private defaultLighting(styleRef: string): LightingSpec {
    const isWarm = styleRef.includes("warm");
    return {
      lightSource: "mixed",
      lightType: "key",
      intensity: "medium",
      colorTemp: isWarm ? 3200 : 5600,
      shadowHardness: "soft",
      direction: "top-right-45deg",
    };
  }

  private defaultArtDirection(desc: string): ArtDirectionSpec {
    const elements = desc.slice(0, 100).split(/[，,。]/).filter(Boolean).slice(0, 3);
    return {
      sceneElements: elements.length ? elements : ["主体", "环境"],
      colorAccents: ["#E74C3C", "#3498DB"],
      textureNotes: ["细腻质感", "层次丰富"],
      atmosphere: "根据场景氛围自动适配",
    };
  }
}
export const descriptor: AgentDescriptor = new LightingAgent().descriptor;
