import { FilmAgent } from "@/agents/FilmAgent";
import type { AgentDescriptor, AgentContext, AgentResult, ToolDefinition } from "@/core/harness/types";
import { ParseError } from "@/core/harness/errors";

/** 编剧 Agent — 接收小说, 输出标准格式剧本, 由导演 Agent 调度 */
export class ScreenwriterAgent extends FilmAgent {
  readonly descriptor: AgentDescriptor = {
    id: "screenwriter", name: "编剧 Agent", role: "screenwriter",
    capabilities: ["text-generation", "analysis"], version: "2.0",
    factory: async (ctx: AgentContext) => { const a = new ScreenwriterAgent(); await a.init(ctx); return a; },
  };

  getSystemPrompt(): string {
    const rules = this.rules?.getRulesForAgent("screenwriter") || "";
    return `你是 Toonflow 影视项目的编剧。接收小说原文, 输出标准剧本格式。

## 输出格式
场号|场景|人物|对白|动作|时长

每场戏格式:
场 X | 场景描述 | 人物列表
对白: 角色名: 台词
动作: 动作描述
时长: Xs

## 要求
- 每场戏 30 秒 - 3 分钟
- 保留核心情节和人物弧光
- 将内心独白转化为动作/对白
- 接收 retryInstruction 时, 仅重写指定场次
- 失败时显式抛错, 禁止返回默认剧本

${rules}`;
  }

  getTools(): ToolDefinition[] { return this.skills?.getToolsForAgent("screenwriter") || []; }

  async execute(ctx: AgentContext): Promise<AgentResult> {
    const stage = ctx.input.stage || "generate";
    switch (stage) {
      case "analyze": return this.doAnalyze(ctx.input.novel || ctx.config.novel || "");
      case "adapt": return this.doAdapt(ctx.input.analysis || ctx.input.novelAnalysis || "");
      case "revise": return this.doRevise(ctx.input.novel || ctx.config.novel || "", ctx.input.retryInstruction);
      default: return this.doGenerate(ctx.input.novel || ctx.config.novel || "", ctx.input.retryInstruction);
    }
  }

  /** 分析小说结构 */
  private async doAnalyze(novel: string): Promise<AgentResult> {
    if (!novel || novel.trim().length < 100) {
      return { success: false, data: { error: "小说内容过短, 至少需要 100 字符" } };
    }
    const analysis = await this.generateText(
      `分析小说结构/情节点/角色关系/主题。小说: ${novel.slice(0, 8000)}`,
      { temperature: 0.5, maxTokens: 4096 },
    );
    return { success: true, data: { novelAnalysis: analysis } };
  }

  /** 生成改编策略 */
  private async doAdapt(analysis: string): Promise<AgentResult> {
    if (!analysis) {
      return { success: false, data: { error: "缺少分析结果" } };
    }
    const strategy = await this.generateText(
      `基于分析生成改编策略 (影视类型/取舍/视觉元素):\n${analysis}`,
      { temperature: 0.6, maxTokens: 4096 },
    );
    return { success: true, data: { adaptationStrategy: strategy } };
  }

  /** 从小说直接生成标准格式剧本 */
  private async doGenerate(novel: string, retryInstruction?: any): Promise<AgentResult> {
    if (!novel || novel.trim().length < 100) {
      return { success: false, data: { error: "小说内容过短, 至少需要 100 字符" } };
    }

    const retryHint = retryInstruction?.suggestions?.join("\n") || "";
    const retrySection = retryHint ? `\n\n## 修改要求\n${retryHint}` : "";

    const prompt = `将以下小说改编为标准格式剧本。

## 小说原文
${novel.slice(0, 10000)}
${retrySection}

请输出标准格式剧本 (场号|场景|人物|对白|动作|时长):`;

    const script = await this.generateText(prompt, { temperature: 0.7, maxTokens: 8192 });

    // 验证剧本格式 (至少包含 "场" 字)
    if (!script.includes("场")) {
      throw new ParseError("标准剧本格式", script, { agentRole: "screenwriter" });
    }

    return { success: true, data: { script } };
  }

  /** 重写指定场次 (保留其他场不变) */
  private async doRevise(novel: string, retryInstruction: any): Promise<AgentResult> {
    if (!retryInstruction?.suggestions?.length) {
      return this.doGenerate(novel);
    }

    const suggestions = retryInstruction.suggestions.join("\n");
    const prompt = `基于修改要求重写剧本。

## 修改要求
${suggestions}

## 原小说
${novel.slice(0, 8000)}

请输出修改后的完整剧本 (场号|场景|人物|对白|动作|时长):`;

    const script = await this.generateText(prompt, { temperature: 0.7, maxTokens: 8192 });

    if (!script.includes("场")) {
      throw new ParseError("标准剧本格式", script, { agentRole: "screenwriter" });
    }

    return { success: true, data: { script } };
  }
}
export const descriptor: AgentDescriptor = new ScreenwriterAgent().descriptor;
