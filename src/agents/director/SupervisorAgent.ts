import { FilmAgent } from "@/agents/FilmAgent";
import type { AgentDescriptor, AgentContext, AgentResult, ToolDefinition, ReviewScore, RetryInstruction } from "@/core/harness/types";
import type { MemoryBus } from "@/core/harness/MemoryBus";
import type { ReviewPipeline } from "@/review/ReviewPipeline";
import { db } from "@/utils/db";

/** 监制 Agent — 审核所有工种产出, 决定通过/打回/升级用户 */
export class SupervisorAgent extends FilmAgent {
  readonly descriptor: AgentDescriptor = {
    id: "supervisor", name: "监制 Agent", role: "supervisor",
    capabilities: ["review", "text-generation", "analysis"], version: "1.0",
    factory: async (ctx: AgentContext) => { const a = new SupervisorAgent(); await a.init(ctx); return a; },
  };

  getSystemPrompt(): string {
    return `你是 Toonflow 影视项目的监制。审核所有工种产出, 决定通过/打回/升级用户。

决策必须是结构化 JSON:
{
  "action": "approve" | "reroute" | "ask_user",
  "targetAgent": "<role>",
  "retryInstruction": { "failedCriterion": "...", "suggestions": ["..."], "userInputRequired": false },
  "userPrompt": "...",
  "userOptions": ["A", "B"]
}

决策原则:
- 技术问题 (分辨率/格式) → 自动 reroute 给原工种
- 艺术问题 (构图/风格) → reroute 给原工种, 重写 prompt
- 内容问题 (与剧本不符) → ask_user (涉及剧本修改)
- 角色不一致 → reroute 给服装/化妆
- 视频质量差 → ask_user (换模型需要用户决策)`;
  }

  getTools(): ToolDefinition[] { return []; }

  async learnFromHistory(memory: MemoryBus, agentIds: string[], pipeline?: ReviewPipeline): Promise<void> {
    const entries = await memory.get({ namespaces: ["review"], type: "event", limit: 100 });
    for (const agentId of agentIds) {
      const samples = entries
        .map(entry => typeof entry.value === "string" ? this.parseHistory(entry.value) : entry.value)
        .filter((value: any) => value?.agentId === agentId);
      if (samples.length < 5) continue;
      const scores = samples.map((value: any) => Number(value.scores?.overall)).filter(Number.isFinite);
      const failures = samples.filter((value: any) => value.passed === false).length;
      const failureRate = failures / samples.length;
      const averageScore = scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0;
      if (pipeline && failureRate > 0.5) pipeline.setWeights({ dimensions: { technical: 0.3, artistic: 0.45, contentMatch: 0.25 } });
      if (await db.schema.hasTable("o_review_preference")) {
        await db("o_review_preference").insert({
          agentId,
          weights: JSON.stringify({ failureRate, averageScore }),
          thresholds: JSON.stringify({ pass: Math.max(0.6, Math.min(0.9, averageScore - (failureRate > 0.4 ? 0.05 : 0))) }),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    }
  }

  async execute(ctx: AgentContext): Promise<AgentResult> {
    const { agentId, agentOutput, reviewScore, reference } = ctx.input;
    const score = reviewScore as ReviewScore;

    // 用 LLM 决策
    try {
      const prompt = `你是监制 Agent。请根据以下审核结果决策:

审核目标: ${agentId}
评分: ${JSON.stringify(score)}
产出: ${JSON.stringify(agentOutput).slice(0, 1000)}
参考: ${JSON.stringify(reference).slice(0, 500)}

请输出 JSON 决策 (action/targetAgent/retryInstruction/userPrompt/userOptions):`;

      const result = await this.generateText(prompt, { temperature: 0.3, maxTokens: 1024 });
      const cleaned = result.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      const decision = match ? JSON.parse(match[0]) : { action: "approve" };

      return { success: true, data: { decision } };
    } catch {
      // 决策失败时默认 ask_user
      return {
        success: true,
        data: {
          decision: {
            action: "ask_user",
            userPrompt: `审核决策失败, 请人工确认 ${agentId} 的产出`,
            userOptions: ["通过", "打回重做"],
          },
        },
      };
    }
  }

  private parseHistory(value: string): any {
    try { return JSON.parse(value); } catch { return {}; }
  }
}
export const descriptor: AgentDescriptor = new SupervisorAgent().descriptor;
