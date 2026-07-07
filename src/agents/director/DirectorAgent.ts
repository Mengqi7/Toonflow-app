import { FilmAgent } from "@/agents/FilmAgent";
import type { AgentDescriptor, AgentContext, AgentResult, ToolDefinition } from "@/core/harness/types";
import { StyleInferenceChain } from "./StyleInferenceChain";
import { ParseError, wrapAsAgentError } from "@/core/harness/errors";

export interface VisualStyleSpec {
  colorPalette: { primary: string; secondary: string; accent: string; temperature: string; saturation: string };
  lighting: { style: string; keyLightDirection: string; contrastRatio: string };
  composition: { preferredShotTypes: string[]; ruleOfThirds: boolean; symmetry: boolean; depthOfField: string };
  camera: { movement: string[]; preferredAngles: string[]; lensPreference: string[] };
  referenceImages?: string[];
}

export interface ShotItem {
  id: string; scene: number; shotType: string; angle: string;
  movement: string; duration: number; description: string;
  dialogue?: string; characters: string[];
}

/** 导演 Agent — 风格推理 + 分镜 + 审核 (调度逻辑在 DirectorOrchestrator) */
export class DirectorAgent extends FilmAgent {
  readonly descriptor: AgentDescriptor = {
    id: "director", name: "导演 Agent", role: "director",
    capabilities: ["style-design", "review", "text-generation"], version: "2.0",
    factory: async (ctx: AgentContext) => { const a = new DirectorAgent(); await a.init(ctx); return a; },
  };

  getSystemPrompt(): string {
    const rules = this.rules?.getRulesForAgent("director") || "";
    return `你是资深影视导演。分析剧本题材/情绪/时代 → 推断色调/光影/镜头语言。

## 职责
1. 风格推理 (stage=style): 分析剧本, 输出 VisualStyleSpec
2. 分镜规划 (stage=storyboard): 拆解剧本为 ShotItem[]
3. 审核 (stage=review): 审核产出质量

## 禁止 default fallback
失败时抛错, 不返回默认风格或默认分镜。

${rules}`;
  }

  getTools(): ToolDefinition[] { return []; }

  async execute(ctx: AgentContext): Promise<AgentResult> {
    try {
      switch (ctx.input.stage) {
        case "storyboard": return await this.doStoryboard(ctx.input.script, ctx.input.style);
        case "review": return await this.doReview(ctx.input.content, ctx.input.criteria);
        default: return await this.doStyle(ctx.input.script || ctx.input.novel);
      }
    } catch (err) {
      throw wrapAsAgentError(err, { agentRole: "director", stage: ctx.input.stage });
    }
  }

  /** 风格推理 */
  async doStyle(script: string): Promise<AgentResult> {
    const scriptText = typeof script === "string" ? script : JSON.stringify(script);
    if (!scriptText || scriptText.length < 10) {
      return { success: false, data: { error: "剧本内容不足, 无法推理风格" } };
    }
    const style = await StyleInferenceChain.infer(
      (p, o) => this.generateText(p, o),
      scriptText,
    );
    return { success: true, data: { visualStyle: style } };
  }

  /** 分镜规划 (无 default fallback) */
  async doStoryboard(script: any, style?: any): Promise<AgentResult> {
    const scriptText = typeof script === "string" ? script : (script?.script || JSON.stringify(script));
    if (!scriptText || scriptText.length < 10) {
      return { success: false, data: { error: "剧本内容不足, 无法生成分镜" } };
    }
    const styleDesc = style ? `视觉风格: ${JSON.stringify(style)}` : "";

    const result = await this.generateText(
      `将剧本拆解为分镜表。每个 shot 返回 JSON 数组:
[
  {"id":"shot_1","scene":1,"shotType":"close-up","angle":"eye-level","movement":"static","duration":3,"description":"...","characters":["角色名"]}
]
${styleDesc}
剧本: ${scriptText.slice(0, 6000)}
请只输出 JSON 数组:`,
      { temperature: 0.5, maxTokens: 8192 },
    );

    const cleaned = result.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (!match) {
      throw new ParseError("JSON 分镜数组", result, { agentRole: "director" });
    }
    const shots: ShotItem[] = JSON.parse(match[0]);
    if (shots.length === 0) {
      throw new ParseError("非空分镜数组", result, { agentRole: "director" });
    }
    return { success: true, data: { storyboardPlan: { shots, totalShots: shots.length } } };
  }

  /** 审核 */
  async doReview(content: any, criteria?: any[]): Promise<AgentResult> {
    const score = await this.reviewOutput(content, criteria || []);
    return { success: score.passed, data: { reviewScore: score } };
  }
}
export const descriptor: AgentDescriptor = new DirectorAgent().descriptor;
