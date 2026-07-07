import { FilmAgent } from "@/agents/FilmAgent";
import type { AgentDescriptor, AgentContext, AgentResult, ToolDefinition } from "@/core/harness/types";
import { ParseError, wrapAsAgentError } from "@/core/harness/errors";

export interface VFXPlan {
  requiredEffects: { name: string; description: string; scene: string; complexity: "low" | "medium" | "high" }[];
  technicalNotes: string[];
  estimatedWorkflow: string;
}

/** 视效师 Agent — 识别特效需求 + 调用视频生成 API/ComfyUI */
export class VFXAgent extends FilmAgent {
  readonly descriptor: AgentDescriptor = {
    id: "vfx", name: "视觉特效 Agent", role: "vfx",
    capabilities: ["video-generation", "analysis"], version: "2.0",
    factory: async (ctx: AgentContext) => { const ag = new VFXAgent(); await ag.init(ctx); return ag; },
  };

  getSystemPrompt(): string {
    const rules = this.rules?.getRulesForAgent("vfx") || "";
    return `你是影视视觉特效 (VFX) 指导。职责:
1. 识别需要特效的场景 (爆炸/魔法/变形等)
2. 生成 VFX 指导 (effectType, parameters, referenceImages)
3. 调用视频生成 API 或 ComfyUI 视频工作流 (Wan2.1 / SVD / AnimateDiff)
4. 输出 videoUrl 写入 o_assets

禁止返回 default VFX plan, 失败时抛错。

${rules}`;
  }

  getTools(): ToolDefinition[] { return []; }

  async execute(ctx: AgentContext): Promise<AgentResult> {
    const { clip, style, previousFrame, script, shots, retryInstruction } = ctx.input;
    const retryHint = retryInstruction?.suggestions?.join("; ") || "";

    try {
      // 如果有 clip, 生成视频
      if (clip) {
        return await this.generateVideoForClip(ctx, clip, style, previousFrame, retryHint);
      }

      // 否则生成 VFX 计划
      const content = typeof script === "string" ? script.slice(0, 4000) : JSON.stringify(script || shots || {}).slice(0, 4000);
      const result = await this.generateText(
        `分析场景识别 VFX 需求。\n内容: ${content}\n${retryHint ? `重试建议: ${retryHint}` : ""}\n\n请只输出 JSON:`,
        { temperature: 0.4, maxTokens: 2048 },
      );
      const cleaned = result.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) {
        throw new ParseError("JSON VFX 计划", result, { agentRole: "vfx" });
      }
      const parsed = JSON.parse(match[0]);
      if (!parsed.vfxPlan) {
        throw new ParseError("包含 vfxPlan 字段的 JSON", result, { agentRole: "vfx" });
      }
      return { success: true, data: { vfxPlan: parsed.vfxPlan } };
    } catch (err) {
      if (err instanceof ParseError) throw err;
      throw wrapAsAgentError(err, { agentRole: "vfx" });
    }
  }

  /** 为 clip 生成视频 */
  private async generateVideoForClip(
    ctx: AgentContext,
    clip: any,
    style: any,
    previousFrame: string,
    retryHint: string,
  ): Promise<AgentResult> {
    const clipDesc = typeof clip === "string" ? clip : (clip?.description || JSON.stringify(clip));
    const styleDesc = style ? `风格: ${JSON.stringify(style)}` : "";

    // 1. 生成视频 prompt
    const promptText = await this.generateText(
      `生成视频英文 prompt。\n镜头: ${clipDesc}\n${styleDesc}\n${retryHint ? `重试建议: ${retryHint}` : ""}\n\n请只输出英文 prompt:`,
      { temperature: 0.7, maxTokens: 512 },
    );

    // 2. 选择后端
    const backend = await this.chooseVideoBackend();

    // 3. 生成视频
    const videoUrls = await this.generateVideo(promptText, { backend, duration: clip?.duration || 5, style });
    const clipId = typeof clip === "object" ? (clip?.shotId || clip?.id) : `clip_${Date.now()}`;

    return {
      success: true,
      data: {
        videoUrl: videoUrls[0],
        videos: [{ clipId, videoUrl: videoUrls[0], prompt: promptText, backend }],
      },
      metrics: { apiCalls: 1, videosGenerated: 1, retryCount: retryHint ? 1 : 0 },
    };
  }

  /** 选择视频生成后端 */
  private async chooseVideoBackend(): Promise<"api" | "comfyui"> {
    try {
      const { db } = await import("@/utils/db");
      const server = await db("o_comfyui_server").where("enabled", 1).first();
      if (!server) return "api";

      // 检查是否有视频工作流
      const videoWorkflow = await db("o_comfyui_workflow")
        .where("type", "like", "%video%")
        .first();
      return videoWorkflow ? "comfyui" : "api";
    } catch {
      return "api";
    }
  }
}
export const descriptor: AgentDescriptor = new VFXAgent().descriptor;
