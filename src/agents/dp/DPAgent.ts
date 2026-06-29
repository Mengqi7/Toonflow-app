import { FilmAgent } from "@/agents/FilmAgent";
import type { AgentDescriptor, AgentContext, AgentResult, ToolDefinition } from "@/core/harness/types";

export class DPAgent extends FilmAgent {
  readonly descriptor: AgentDescriptor = {
    id: "dp", name: "摄影指导 Agent", role: "dp",
    capabilities: ["image-generation", "composition", "lighting"], version: "1.0",
    factory: async (ctx: AgentContext) => { const a = new DPAgent(); await a.init(ctx); return a; },
  };

  getSystemPrompt(): string { return "你是摄影指导(DP)，根据导演风格和分镜生成专业画面构图方案。"; }
  getTools(): ToolDefinition[] { return []; }

  async execute(ctx: AgentContext): Promise<AgentResult> {
    const { shot, style, retryInstruction } = ctx.input;
    const shotDesc = typeof shot === "string" ? shot : (shot?.description || JSON.stringify(shot));
    const retryHint = retryInstruction?.suggestions?.join("; ") || "";

    const backend = await this.chooseBackend(shot, style);

    // 生成构图 prompt
    const promptText = await this.generateText(
      `生成专业画面构图英文prompt。\n分镜: ${shotDesc}\n风格: ${JSON.stringify(style || {})}\n${retryHint ? "重试建议: " + retryHint : ""}`,
      { temperature: 0.7, maxTokens: 1024 }
    );

    // 生成图片
    try {
      const imageUrls = await this.generateImage(promptText, {
        backend,
        count: 1,
        workflowId: undefined,
      });

      return {
        success: true,
        data: { imageUrl: imageUrls[0], compositionPrompt: promptText, backend },
        metrics: { durationMs: 0, tokensUsed: 0, apiCalls: 1, imagesGenerated: 1, costEstimate: 0, retryCount: 0 },
      };
    } catch (err: any) {
      // ComfyUI 失败，降级到 API
      if (backend === "comfyui") {
        console.warn("[DPAgent] ComfyUI failed, falling back to API:", err.message);
        const imageUrls = await this.generateImage(promptText, { backend: "api", count: 1 });
        return {
          success: true,
          data: { imageUrl: imageUrls[0], compositionPrompt: promptText, backend: "api-fallback" },
          metrics: { durationMs: 0, tokensUsed: 0, apiCalls: 1, imagesGenerated: 1, costEstimate: 0, retryCount: 0 },
        };
      }
      throw err;
    }
  }

  private async chooseBackend(shot: any, style: any): Promise<"api" | "comfyui"> {
    // 检查 ComfyUI 是否可用
    try {
      const backend = await this.selectBackend();
      if (backend !== "comfyui") return "api";

      // 识别需要定制化生成的场景
      const shotType = shot?.shotType || shot?.type || "";
      const saturation = style?.colorPalette?.saturation || "";

      if (saturation === "desaturated" || shotType.includes("close-up") || shotType.includes("特写")) {
        return "comfyui";
      }
      return "api"; // 默认 API 更稳定
    } catch {
      return "api";
    }
  }
}
export const descriptor: AgentDescriptor = new DPAgent().descriptor;
