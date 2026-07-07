import { FilmAgent } from "@/agents/FilmAgent";
import type { AgentDescriptor, AgentContext, AgentResult, ToolDefinition } from "@/core/harness/types";

export interface ShotItem {
  id: string; scene: number; shotType: string; angle: string;
  movement: string; duration: number; description: string; characters: string[];
}

/** 副导演 Agent (AD) — 接收剧本, 拆解为分镜表 */
export class AssistantDirectorAgent extends FilmAgent {
  readonly descriptor: AgentDescriptor = {
    id: "assistant_director", name: "副导演 Agent", role: "assistant_director",
    capabilities: ["text-generation", "analysis"], version: "1.0",
    factory: async (ctx: AgentContext) => { const a = new AssistantDirectorAgent(); await a.init(ctx); return a; },
  };

  getSystemPrompt(): string {
    return `你是 Toonflow 影视项目的副导演 (AD)。接收剧本, 输出分镜表。

输出格式 (JSON):
{
  "storyboardPlan": {
    "shots": [
      { "id": "shot_1", "scene": 1, "shotType": "close-up", "angle": "eye-level",
        "movement": "static", "duration": 3, "description": "...", "characters": ["角色名"] }
    ]
  }
}

要求:
- 每场戏 2-6 个分镜
- 镜头类型多样 (wide/medium/close-up/over-shoulder)
- 运镜多样 (static/dolly/pan/handheld)
- 必须参考 VisualStyleSpec`;
  }

  getTools(): ToolDefinition[] { return []; }

  async execute(ctx: AgentContext): Promise<AgentResult> {
    const { script, visualStyle } = ctx.input;
    const scriptText = typeof script === "string" ? script : (script?.script || JSON.stringify(script));
    const styleDesc = visualStyle ? `视觉风格: ${JSON.stringify(visualStyle)}` : "";

    try {
      const result = await this.generateText(
        `将剧本拆解为分镜表。每个 shot 返回 JSON 数组:\n${styleDesc}\n剧本: ${scriptText.slice(0, 6000)}\n请只输出 JSON:`,
        { temperature: 0.5, maxTokens: 8192 },
      );
      const cleaned = result.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
      const match = cleaned.match(/\[[\s\S]*\]/);
      const shots: ShotItem[] = match ? JSON.parse(match[0]) : [];
      return {
        success: true,
        data: { storyboardPlan: { shots, totalShots: shots.length } },
      };
    } catch (err) {
      return { success: false, data: { error: err instanceof Error ? err.message : String(err) } };
    }
  }
}
export const descriptor: AgentDescriptor = new AssistantDirectorAgent().descriptor;
