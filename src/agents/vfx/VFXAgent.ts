import { FilmAgent } from "@/agents/FilmAgent";
import type { AgentDescriptor, AgentContext, AgentResult, ToolDefinition } from "@/core/harness/types";

export interface VFXPlan {
  requiredEffects: { name: string; description: string; scene: string; complexity: "low" | "medium" | "high" }[];
  technicalNotes: string[];
  estimatedWorkflow: string;  // ComfyUI workflow suggestion
}

export class VFXAgent extends FilmAgent {
  readonly descriptor: AgentDescriptor = {
    id: "vfx", name: "视觉特效 Agent", role: "vfx",
    capabilities: ["video-generation", "analysis"], version: "1.0",
    factory: async (ctx: AgentContext) => { const ag = new VFXAgent(); await ag.init(ctx); return ag; },
  };

  getSystemPrompt(): string {
    return `你是影视视觉特效(VFX)指导。分析场景中的特效需求，推荐实现方案。
输出格式 (JSON):

{
  "vfxPlan": {
    "requiredEffects": [
      {"name":"特效名","description":"描述","scene":"场景","complexity":"low/medium/high"}
    ],
    "technicalNotes": ["技术建议"],
    "estimatedWorkflow": "ComfyUI工作流推荐"
  }
}`;
  }

  getTools(): ToolDefinition[] { return []; }

  async execute(ctx: AgentContext): Promise<AgentResult> {
    const { script, shots } = ctx.input;
    const content = typeof script === "string" ? script.slice(0, 4000) : JSON.stringify(script).slice(0, 4000);

    try {
      const result = await this.generateText(
        `分析场景识别VFX需求。\n内容: ${content}\n\n请只输出 JSON：`,
        { temperature: 0.4 }
      );
      const cleaned = result.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      const parsed = match ? JSON.parse(match[0]) : {};
      return { success: true, data: { vfxPlan: parsed.vfxPlan || this.defaultVFXPlan() } };
    } catch {
      return { success: true, data: { vfxPlan: this.defaultVFXPlan() } };
    }
  }

  private defaultVFXPlan(): VFXPlan {
    return {
      requiredEffects: [
        { name: "场景过渡", description: "标准转场效果", scene: "全场", complexity: "low" },
        { name: "色彩校正", description: "统一画面色调", scene: "全场", complexity: "low" },
      ],
      technicalNotes: ["使用 ComfyUI 或视频编辑软件实现"],
      estimatedWorkflow: "sdxl-txt2img (基础生图) + VHS_VideoCombine (视频合成)",
    };
  }
}
export const descriptor: AgentDescriptor = new VFXAgent().descriptor;
