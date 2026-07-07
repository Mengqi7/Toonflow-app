import { FilmAgent } from "@/agents/FilmAgent";
import type { AgentDescriptor, AgentContext, AgentResult, ToolDefinition } from "@/core/harness/types";

export interface SoundPlan {
  bgm: { scene: string; mood: string; tempo: "slow" | "medium" | "fast"; genre: string }[];
  sfx: { scene: string; type: string; description: string; timing: string }[];
  audioTimeline: { time: number; audioType: "bgm" | "sfx"; description: string }[];
}

/** 声音设计师 Agent — 分析剧本情绪, 生成 BGM/SFX 方案 */
export class SoundDesignerAgent extends FilmAgent {
  readonly descriptor: AgentDescriptor = {
    id: "sound_designer", name: "声音设计师 Agent", role: "sound_designer",
    capabilities: ["audio-generation", "analysis", "text-generation"], version: "1.0",
    factory: async (ctx: AgentContext) => { const a = new SoundDesignerAgent(); await a.init(ctx); return a; },
  };

  getSystemPrompt(): string {
    return `你是影视声音设计师。分析剧本情绪, 生成 BGM 和 SFX 方案。

输出 JSON:
{
  "soundPlan": {
    "bgm": [{ "scene": "...", "mood": "...", "tempo": "slow|medium|fast", "genre": "..." }],
    "sfx": [{ "scene": "...", "type": "环境|动作|过渡", "description": "...", "timing": "开始时|进行中|结束时" }],
    "audioTimeline": [{ "time": 0, "audioType": "bgm|sfx", "description": "..." }]
  }
}`;
  }

  getTools(): ToolDefinition[] { return []; }

  async execute(ctx: AgentContext): Promise<AgentResult> {
    const { script, timeline } = ctx.input;
    const scriptText = typeof script === "string" ? script : (script?.script || JSON.stringify(script));
    try {
      const result = await this.generateText(
        `分析剧本情绪并设计声音方案。\n剧本: ${scriptText.slice(0, 4000)}\n时间轴: ${JSON.stringify(timeline || {}).slice(0, 2000)}\n\n请只输出 JSON:`,
        { temperature: 0.5, maxTokens: 4096 },
      );
      const cleaned = result.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      const parsed = match ? JSON.parse(match[0]) : {};
      return { success: true, data: { soundPlan: parsed.soundPlan || parsed } };
    } catch (err) {
      return { success: false, data: { error: err instanceof Error ? err.message : String(err) } };
    }
  }
}
export const descriptor: AgentDescriptor = new SoundDesignerAgent().descriptor;
