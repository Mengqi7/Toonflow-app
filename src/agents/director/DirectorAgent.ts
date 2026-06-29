import { FilmAgent } from "@/agents/FilmAgent";
import type { AgentDescriptor, AgentContext, AgentResult, ToolDefinition } from "@/core/harness/types";
import { StyleInferenceChain } from "./StyleInferenceChain";

export interface VisualStyleSpec {
  colorPalette: { primary: string; secondary: string; accent: string; temperature: string; saturation: string };
  lighting: { style: string; keyLightDirection: string; contrastRatio: string };
  composition: { preferredShotTypes: string[]; ruleOfThirds: boolean; symmetry: boolean; depthOfField: string };
  camera: { movement: string[]; preferredAngles: string[]; lensPreference: string[] };
  referenceImages?: string[];
}

export interface ShotItem {
  id: string;
  scene: number;
  shotType: string;       // e.g. "close-up", "medium", "wide"
  angle: string;          // e.g. "eye-level", "low-angle", "high-angle"
  movement: string;       // e.g. "static", "dolly", "handheld"
  duration: number;       // seconds
  description: string;
  dialogue?: string;
  characters: string[];
}

export class DirectorAgent extends FilmAgent {
  readonly descriptor: AgentDescriptor = {
    id: "director", name: "导演 Agent", role: "director",
    capabilities: ["style-design", "review", "text-generation"], version: "1.0",
    factory: async (ctx: AgentContext) => { const a = new DirectorAgent(); await a.init(ctx); return a; },
  };

  getSystemPrompt(): string {
    return "你是资深影视导演。分析剧本题材/情绪/时代→推断色调/光影/镜头语言。\n" + (this.rules?.getRulesForAgent("director") || "");
  }

  getTools(): ToolDefinition[] { return []; }

  async execute(ctx: AgentContext): Promise<AgentResult> {
    switch (ctx.input.stage) {
      case "storyboard": return this.doStoryboard(ctx.input.script, ctx.input.style);
      case "review": return this.doReview(ctx.input.content, ctx.input.criteria);
      default: return this.doStyle(ctx.input.script || ctx.input.novel);
    }
  }

  async doStyle(script: string): Promise<AgentResult> {
    const style = await StyleInferenceChain.infer(
      (p, o) => this.generateText(p, o),
      script
    );
    return { success: true, data: { visualStyle: style } };
  }

  async doStoryboard(script: string, style?: any): Promise<AgentResult> {
    const styleDesc = style ? `视觉风格: ${JSON.stringify(style)}` : "";
    try {
      const result = await this.generateText(
        `将剧本拆解为分镜表。每个 shot 返回 JSON 数组:
[
  {"id":"shot_1","scene":1,"shotType":"close-up","angle":"eye-level","movement":"static","duration":3,"description":"...","characters":["角色名"]}
]
${styleDesc}
剧本: ${script.slice(0, 6000)}
请只输出 JSON 数组:`,
        { temperature: 0.5, maxTokens: 8192 }
      );
      const cleaned = result.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
      const match = cleaned.match(/\[[\s\S]*\]/);
      const shots: ShotItem[] = match ? JSON.parse(match[0]) : [];
      return {
        success: true,
        data: {
          storyboardPlan: {
            shots: shots.length > 0 ? shots : this.defaultShots(script),
            totalShots: shots.length,
          },
        },
      };
    } catch {
      return {
        success: true,
        data: {
          storyboardPlan: {
            shots: this.defaultShots(script),
            totalShots: 3,
          },
        },
      };
    }
  }

  async doReview(content: any, criteria?: any[]): Promise<AgentResult> {
    const score = await this.reviewOutput(content, criteria || []);
    return { success: score.passed, data: { reviewScore: score } };
  }

  private defaultShots(script: string): ShotItem[] {
    const lines = script.split("\n").filter(l => l.trim()).slice(0, 5);
    return lines.map((line, i) => ({
      id: `shot_${i + 1}`,
      scene: 1,
      shotType: i === 0 ? "wide" : i === lines.length - 1 ? "close-up" : "medium",
      angle: "eye-level",
      movement: "static",
      duration: 3,
      description: line.slice(0, 100),
      characters: ["主角"],
    }));
  }
}
export const descriptor: AgentDescriptor = new DirectorAgent().descriptor;
