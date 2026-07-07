import { FilmAgent } from "@/agents/FilmAgent";
import type { AgentDescriptor, AgentContext, AgentResult, ToolDefinition } from "@/core/harness/types";

/** 置景师 Agent — 设计场景陈设 */
export class SetDecoratorAgent extends FilmAgent {
  readonly descriptor: AgentDescriptor = {
    id: "set_decorator", name: "置景师 Agent", role: "set_decorator",
    capabilities: ["text-generation", "composition"], version: "1.0",
    factory: async (ctx: AgentContext) => { const a = new SetDecoratorAgent(); await a.init(ctx); return a; },
  };

  getSystemPrompt(): string {
    return `你是影视置景师。根据场景需求, 设计陈设方案。

输出 JSON:
{
  "setDecor": {
    "sceneName": "场景名",
    "elements": ["主背景元素1", "主背景元素2"],
    "props": [
      { "name": "书桌", "description": "红木, 左侧靠墙", "position": "左前" },
      { "name": "台灯", "description": "黄铜, 暖光", "position": "书桌右上" }
    ],
    "colorAccents": ["深棕", "暖黄"],
    "atmosphere": "氛围描述"
  }
}`;
  }

  getTools(): ToolDefinition[] { return []; }

  async execute(ctx: AgentContext): Promise<AgentResult> {
    const { scene, style } = ctx.input;
    const sceneDesc = typeof scene === "string" ? scene : JSON.stringify(scene);
    try {
      const result = await this.generateText(
        `设计场景陈设。\n场景: ${sceneDesc}\n风格: ${JSON.stringify(style || {})}\n\n请只输出 JSON:`,
        { temperature: 0.5, maxTokens: 2048 },
      );
      const cleaned = result.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      const setDecor = match ? JSON.parse(match[0]) : {};
      return { success: true, data: { setDecor: setDecor.setDecor || setDecor } };
    } catch (err) {
      return { success: false, data: { error: err instanceof Error ? err.message : String(err) } };
    }
  }
}
export const descriptor: AgentDescriptor = new SetDecoratorAgent().descriptor;
