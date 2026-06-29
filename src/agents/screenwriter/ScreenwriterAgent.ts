import { FilmAgent } from "@/agents/FilmAgent";
import type { AgentDescriptor, AgentContext, AgentResult, ToolDefinition } from "@/core/harness/types";

export class ScreenwriterAgent extends FilmAgent {
  readonly descriptor: AgentDescriptor = {
    id: "screenwriter", name: "编剧 Agent", role: "screenwriter",
    capabilities: ["text-generation", "analysis"], version: "1.0",
    factory: async (ctx: AgentContext) => { const a = new ScreenwriterAgent(); await a.init(ctx); return a; },
  };

  getSystemPrompt(): string {
    const rules = this.rules?.getRulesForAgent("screenwriter") || "";
    return "你是资深影视编剧。每场戏格式: 场号|场景|人物|对白|动作。\n" + rules;
  }

  getTools(): ToolDefinition[] { return this.skills?.getToolsForAgent("screenwriter") || []; }

  async execute(ctx: AgentContext): Promise<AgentResult> {
    const stage = ctx.input.stage || "analyze";
    switch (stage) {
      case "adapt": return this.doAdapt(ctx.input.analysis);
      case "generate": return this.doGenerate(ctx.input.strategy);
      default: return this.doAnalyze(ctx.input.novel || ctx.config.novel || "");
    }
  }

  private async doAnalyze(novel: string): Promise<AgentResult> {
    const analysis = await this.generateText("分析小说结构/情节点/角色关系: " + novel.slice(0, 8000), { temperature: 0.5 });
    return { success: true, data: { novelAnalysis: analysis } };
  }

  private async doAdapt(analysis: string): Promise<AgentResult> {
    const strategy = await this.generateText("生成改编策略(影视类型/取舍/视觉元素): " + analysis, { temperature: 0.6 });
    return { success: true, data: { adaptationStrategy: strategy } };
  }

  private async doGenerate(strategy: string): Promise<AgentResult> {
    const script = await this.generateText("生成标准格式剧本: " + strategy, { temperature: 0.7, maxTokens: 8192 });
    return { success: true, data: { script } };
  }
}
export const descriptor: AgentDescriptor = new ScreenwriterAgent().descriptor;
