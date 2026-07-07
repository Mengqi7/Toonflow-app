import { FilmAgent } from "@/agents/FilmAgent";
import type { AgentDescriptor, AgentContext, AgentResult, ToolDefinition } from "@/core/harness/types";
import { wrapAsAgentError } from "@/core/harness/errors";

/** 摄影指导 Agent (DP) — 接收 ShotItem + VisualStyleSpec + 角色库, 生成镜头画面 */
export class DPAgent extends FilmAgent {
  readonly descriptor: AgentDescriptor = {
    id: "dp", name: "摄影指导 Agent", role: "dp",
    capabilities: ["image-generation", "composition", "lighting"], version: "2.0",
    factory: async (ctx: AgentContext) => { const a = new DPAgent(); await a.init(ctx); return a; },
  };

  getSystemPrompt(): string {
    const rules = this.rules?.getRulesForAgent("dp") || "";
    return `你是摄影指导 (DP)。接收 ShotItem, 生成专业画面构图方案并调用生图后端。

## 工作流
1. 根据 shot.shotType 和 style 选择后端 (BackendSelector)
2. 生成英文构图 prompt (含角色/场景/光影)
3. 调用 ai.Image() 或 ComfyUIExecutor.run()
4. 返回图片 URL 和 prompt

## 后端选择原则
- 风格化强 (saturation=desaturated) → ComfyUI
- close-up 特写 → ComfyUI (IP-Adapter)
- 标准场景 → API (速度快)
- 用户指定 workflow → ComfyUI

## 禁止 mock
失败时抛 AgentExecutionError, 由监制 Agent 决策重试或升级用户。

${rules}`;
  }

  getTools(): ToolDefinition[] { return []; }

  async execute(ctx: AgentContext): Promise<AgentResult> {
    const { shot, style, retryInstruction } = ctx.input;
    const shotDesc = typeof shot === "string" ? shot : (shot?.description || JSON.stringify(shot));
    const retryHint = retryInstruction?.suggestions?.join("; ") || "";

    // 从 MemoryBus 读取角色库参考
    const characterRefs = await this.loadCharacterRefs(ctx);

    try {
      // 1. 选择后端
      const backend = await this.chooseBackend(shot, style);

      // 2. 生成构图 prompt
      const charDesc = characterRefs.length > 0
        ? `\n角色参考: ${characterRefs.map(c => `${c.characterName}(${c.outfitStyle},${c.hairStyle})`).join("; ")}`
        : "";
      const styleDesc = style ? `\n视觉风格: ${JSON.stringify(style)}` : "";
      const retryDesc = retryHint ? `\n重试建议: ${retryHint}` : "";

      const promptText = await this.generateText(
        `生成专业画面构图英文 prompt。\n分镜: ${shotDesc}${charDesc}${styleDesc}${retryDesc}\n\n请只输出英文 prompt:`,
        { temperature: 0.7, maxTokens: 1024 },
      );

      // 3. 生成图片
      const imageUrls = await this.generateImage(promptText, { backend, count: 1 });
      const shotId = typeof shot === "object" ? shot?.id : `shot_${Date.now()}`;

      return {
        success: true,
        data: {
          images: [{
            shotId,
            imageUrl: imageUrls[0],
            compositionPrompt: promptText,
            backend,
            workflowId: undefined,
          }],
        },
        metrics: { apiCalls: 1, imagesGenerated: 1, retryCount: retryHint ? 1 : 0 },
      };
    } catch (err) {
      throw wrapAsAgentError(err, { shotId: shot?.id, agentRole: "dp" });
    }
  }

  /** 从 MemoryBus 加载角色库参考 */
  private async loadCharacterRefs(ctx: AgentContext): Promise<any[]> {
    try {
      const entries = await this.memory.get({
        namespaces: [`agent:costume`, `project:${ctx.projectId}`],
        type: "long-term",
        limit: 20,
      });
      return entries.map(e => {
        try { return typeof e.value === "string" ? JSON.parse(e.value) : e.value; }
        catch { return null; }
      }).filter(Boolean);
    } catch {
      return [];
    }
  }

  /** 选择后端: API 或 ComfyUI */
  private async chooseBackend(shot: any, style: any): Promise<"api" | "comfyui"> {
    try {
      // 检查 ComfyUI 是否可用
      const { db } = await import("@/utils/db");
      const server = await db("o_comfyui_server").where("enabled", 1).first();
      if (!server) return "api";

      // 识别需要定制化生成的场景
      const shotType = (shot?.shotType || shot?.type || "").toLowerCase();
      const saturation = style?.colorPalette?.saturation || "";

      if (saturation === "desaturated" || shotType.includes("close-up") || shotType.includes("特写")) {
        return "comfyui";
      }
      return "api";
    } catch {
      return "api";
    }
  }
}
export const descriptor: AgentDescriptor = new DPAgent().descriptor;
