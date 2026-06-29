import { FilmAgent } from "@/agents/FilmAgent";
import type { AgentDescriptor, AgentContext, AgentResult, ToolDefinition } from "@/core/harness/types";

export interface EditClip {
  shotId: string;
  inPoint: number;
  outPoint: number;
  transition: "cut" | "dissolve" | "fade" | "wipe";
  transitionDuration: number;
  effects?: { name: string; params: Record<string, any> }[];
}

export interface EditTrack { clips: EditClip[]; }

export interface EditTimeline {
  tracks: EditTrack[];
  totalDuration: number;
  bpm?: number;
}

export class EditorAgent extends FilmAgent {
  readonly descriptor: AgentDescriptor = {
    id: "editor", name: "剪辑 Agent", role: "editor",
    capabilities: ["editing", "analysis"], version: "1.0",
    factory: async (ctx: AgentContext) => { const ag = new EditorAgent(); await ag.init(ctx); return ag; },
  };

  getSystemPrompt(): string {
    return `你是专业影视剪辑师。根据分镜和素材，生成 EditTimeline。
输出格式:

{
  "editTimeline": {
    "tracks": [{
      "clips": [
        {"shotId":"shot_1","inPoint":0,"outPoint":3,"transition":"cut","transitionDuration":0}
      ]
    }],
    "totalDuration": 60,
    "bpm": 120
  }
}

转场类型: cut(切)/dissolve(叠化)/fade(淡入淡出)/wipe(划像)
节奏规则: 动作戏 0.5-2s/shot, 对话戏 3-8s/shot, 抒情戏 5-15s/shot`;
  }

  getTools(): ToolDefinition[] { return []; }

  async execute(ctx: AgentContext): Promise<AgentResult> {
    const { shots, plan } = ctx.input;
    const shotsText = typeof shots === "string" ? shots : JSON.stringify(shots);
    const planText = plan ? (typeof plan === "string" ? plan.slice(0, 2000) : JSON.stringify(plan).slice(0, 2000)) : "";

    try {
      const result = await this.generateText(
        `生成剪辑方案。\n素材: ${shotsText.slice(0, 3000)}\n分镜计划: ${planText}\n\n请只输出 JSON：`,
        { temperature: 0.4, maxTokens: 4096 }
      );
      const cleaned = result.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      const parsed = match ? JSON.parse(match[0]) : {};

      const timeline = parsed.editTimeline || parsed;
      if (timeline.tracks) {
        return { success: true, data: { editTimeline: timeline } };
      }
      return { success: true, data: { editTimeline: this.defaultTimeline(shotsText) } };
    } catch {
      return { success: true, data: { editTimeline: this.defaultTimeline(shotsText) } };
    }
  }

  private defaultTimeline(shotsText: string): EditTimeline {
    // 尝试从 shots 中解析出 shot 列表
    let shotIds: string[] = [];
    try {
      const data = typeof shotsText === "string" ? JSON.parse(shotsText) : shotsText;
      if (Array.isArray(data)) shotIds = data.map((_: any, i: number) => `shot_${i + 1}`);
      else if (data.results) shotIds = data.results.map((_: any, i: number) => `shot_${i + 1}`);
    } catch { shotIds = ["shot_1", "shot_2", "shot_3"]; }

    const clips: EditClip[] = shotIds.map((id, i) => ({
      shotId: id,
      inPoint: i * 3,
      outPoint: (i + 1) * 3,
      transition: i === 0 ? "fade" : "cut" as const,
      transitionDuration: i === 0 ? 1 : 0,
    }));

    return {
      tracks: [{ clips }],
      totalDuration: clips.length * 3,
      bpm: 120,
    };
  }
}
export const descriptor: AgentDescriptor = new EditorAgent().descriptor;
