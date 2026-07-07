import { FilmAgent } from "@/agents/FilmAgent";
import type { AgentDescriptor, AgentContext, AgentResult, ToolDefinition } from "@/core/harness/types";
import { ParseError, wrapAsAgentError } from "@/core/harness/errors";

export interface SoundPlan {
  voiceActors: { character: string; gender: string; age: string; emotion: string }[];
  bgm: { scene: string; mood: string; tempo: "slow" | "medium" | "fast"; genre: string }[];
  sfx: { scene: string; type: string; description: string; timing: string }[];
  audioTimeline: { time: number; audioType: "voice" | "bgm" | "sfx"; description: string }[];
}

/** 录音/配音 Agent — 调用 TTS 生成对白音频, 失败抛错 */
export class SoundAgent extends FilmAgent {
  readonly descriptor: AgentDescriptor = {
    id: "sound", name: "录音配音 Agent", role: "sound",
    capabilities: ["audio-generation", "analysis"], version: "2.0",
    factory: async (ctx: AgentContext) => { const ag = new SoundAgent(); await ag.init(ctx); return ag; },
  };

  getSystemPrompt(): string {
    const rules = this.rules?.getRulesForAgent("sound") || "";
    return `你是专业影视录音师。分析剧本和分镜, 生成声音方案。

输出格式必须严格遵循 JSON:
{
  "soundPlan": {
    "voiceActors": [{"character":"角色名","gender":"男/女","age":"青年/中年","emotion":"平静/愤怒/悲伤/开心"}],
    "bgm": [{"scene":"场景描述","mood":"情绪","tempo":"slow/medium/fast","genre":"风格"}],
    "sfx": [{"scene":"场景","type":"环境/动作/过渡","description":"音效描述","timing":"开始时/进行中/结束时"}],
    "audioTimeline": [{"time":0,"audioType":"voice/bgm/sfx","description":"说明"}]
  }
}

禁止返回 default sound plan, 失败时抛错。

${rules}`;
  }

  getTools(): ToolDefinition[] { return []; }

  async execute(ctx: AgentContext): Promise<AgentResult> {
    const { script, timeline } = ctx.input;
    const scriptText = typeof script === "string" ? script : (script?.script || JSON.stringify(script));
    const timelineRef = timeline ? JSON.stringify(timeline) : "";

    try {
      const result = await this.generateText(
        `分析剧本情绪并设计声音方案。\n剧本: ${scriptText.slice(0, 4000)}\n分镜: ${timelineRef.slice(0, 2000)}\n\n请只输出 JSON:`,
        { temperature: 0.5, maxTokens: 4096 },
      );
      const cleaned = result.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) {
        throw new ParseError("JSON 声音方案", result, { agentRole: "sound" });
      }
      const parsed = JSON.parse(match[0]);
      if (!parsed.soundPlan) {
        throw new ParseError("包含 soundPlan 字段的 JSON", result, { agentRole: "sound" });
      }
      return { success: true, data: { soundPlan: parsed.soundPlan } };
    } catch (err) {
      if (err instanceof ParseError) throw err;
      throw wrapAsAgentError(err, { agentRole: "sound" });
    }
  }
}
export const descriptor: AgentDescriptor = new SoundAgent().descriptor;
