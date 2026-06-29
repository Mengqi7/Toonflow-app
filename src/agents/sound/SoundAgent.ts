import { FilmAgent } from "@/agents/FilmAgent";
import type { AgentDescriptor, AgentContext, AgentResult, ToolDefinition } from "@/core/harness/types";

export interface SoundPlan {
  voiceActors: { character: string; gender: string; age: string; emotion: string }[];
  bgm: { scene: string; mood: string; tempo: "slow" | "medium" | "fast"; genre: string }[];
  sfx: { scene: string; type: string; description: string; timing: string }[];
  audioTimeline: { time: number; audioType: "voice" | "bgm" | "sfx"; description: string }[];
}

export class SoundAgent extends FilmAgent {
  readonly descriptor: AgentDescriptor = {
    id: "sound", name: "录音配音 Agent", role: "sound",
    capabilities: ["audio-generation", "analysis"], version: "1.0",
    factory: async (ctx: AgentContext) => { const ag = new SoundAgent(); await ag.init(ctx); return ag; },
  };

  getSystemPrompt(): string {
    return `你是专业影视录音师/声音设计师。分析剧本和分镜，生成声音方案。
输出格式必须严格遵循 JSON:

{
  "soundPlan": {
    "voiceActors": [{"character":"角色名","gender":"男/女","age":"青年/中年","emotion":"平静/愤怒/悲伤/开心"}],
    "bgm": [{"scene":"场景描述","mood":"情绪","tempo":"slow/medium/fast","genre":"风格"}],
    "sfx": [{"scene":"场景","type":"环境/动作/过渡","description":"音效描述","timing":"开始时/进行中/结束时"}],
    "audioTimeline": [{"time":0,"audioType":"voice/bgm/sfx","description":"说明"}]
  }
}`;
  }

  getTools(): ToolDefinition[] { return []; }

  async execute(ctx: AgentContext): Promise<AgentResult> {
    const { script, timeline } = ctx.input;
    const scriptText = typeof script === "string" ? script : JSON.stringify(script);
    const timelineRef = timeline ? JSON.stringify(timeline) : "";

    try {
      const result = await this.generateText(
        `分析剧本情绪并设计声音方案。\n剧本: ${scriptText.slice(0, 4000)}\n分镜: ${timelineRef.slice(0, 2000)}\n\n请只输出 JSON：`,
        { temperature: 0.5, maxTokens: 4096 }
      );
      const cleaned = result.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      const parsed = match ? JSON.parse(match[0]) : {};

      return {
        success: true,
        data: {
          soundPlan: parsed.soundPlan || this.defaultSoundPlan(scriptText),
        },
      };
    } catch {
      return {
        success: true,
        data: { soundPlan: this.defaultSoundPlan(scriptText) },
      };
    }
  }

  private defaultSoundPlan(script: string): SoundPlan {
    const keywords = script.toLowerCase();
    const mood = keywords.includes("悲") ? "悲伤" : keywords.includes("怒") ? "愤怒" : keywords.includes("喜") ? "欢快" : "中性";
    const tempo: "slow" | "medium" | "fast" = mood === "愤怒" ? "fast" : mood === "悲伤" ? "slow" : "medium";

    return {
      voiceActors: [
        { character: "主角", gender: "男", age: "青年", emotion: mood },
        { character: "配角", gender: "女", age: "青年", emotion: "中性" },
      ],
      bgm: [{ scene: "主要场景", mood, tempo, genre: "影视配乐" }],
      sfx: [
        { scene: "环境", type: "环境", description: "环境音/白噪音", timing: "进行中" },
        { scene: "过渡", type: "过渡", description: "转场音效", timing: "结束时" },
      ],
      audioTimeline: [
        { time: 0, audioType: "bgm", description: "背景音乐开始" },
        { time: 5, audioType: "voice", description: "角色对白" },
        { time: 30, audioType: "sfx", description: "环境音效" },
      ],
    };
  }
}
export const descriptor: AgentDescriptor = new SoundAgent().descriptor;
