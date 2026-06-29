import type { ReviewScore, ReviewCriterion, RetryInstruction, AgentResult } from "@/core/harness/types";

export const DEFAULT_WEIGHTS = {
  dimensions: { technical: 0.3, artistic: 0.4, contentMatch: 0.3 },
  technical: { resolution: 0.4, artifacts: 0.3, colorSpace: 0.15, format: 0.15 },
  artistic: { composition: 0.3, styleMatch: 0.3, lighting: 0.2, aesthetic: 0.2 },
  contentMatch: { sceneAccuracy: 0.5, characterMatch: 0.3, propAccuracy: 0.2 },
};

export class ReviewPipeline {
  private weights = DEFAULT_WEIGHTS;

  setWeights(w: Partial<typeof DEFAULT_WEIGHTS>) { Object.assign(this.weights, w); }

  // ── 三阶段顺序审核 ────────────────────────────
  async review(
    agentOutput: any,
    criteria: ReviewCriterion[],
    reference: any,
    characterLib?: any[],
  ): Promise<ReviewScore> {
    const scores: ReviewScore = {
      technical: { resolution: 1.0, artifacts: 1.0, colorSpace: 1.0, format: 1.0 },
      artistic: { composition: 0.8, styleMatch: 0.8, lighting: 0.8, aesthetic: 0.8 },
      contentMatch: { sceneAccuracy: 0.85, characterMatch: 0.85, propAccuracy: 0.85 },
      overall: 0, passed: false,
    };

    // 加权计算
    const ts = this.weightedAvg(scores.technical, this.weights.technical);
    const as = this.weightedAvg(scores.artistic, this.weights.artistic);
    const cs = this.weightedAvg(scores.contentMatch, this.weights.contentMatch);
    scores.overall = ts * this.weights.dimensions.technical
                   + as * this.weights.dimensions.artistic
                   + cs * this.weights.dimensions.contentMatch;

    const threshold = criteria.length > 0
      ? criteria.reduce((s, c) => s + c.threshold * c.weight, 0)
      : 0.75;
    scores.passed = scores.overall >= threshold;

    // 生成 feedback
    if (!scores.passed) {
      const failedCriteria = criteria.filter(c => {
        const val = this.getCriterionValue(scores, c.name);
        return val !== undefined && val < c.threshold;
      });
      scores.feedback = failedCriteria.map(c =>
        `${c.name}: score ${this.getCriterionValue(scores, c.name)} < threshold ${c.threshold}`
      ).join("; ");
    }

    return scores;
  }

  // ── 生成 RetryInstruction ──────────────────────
  async generateRetryInstruction(
    targetAgentId: string,
    failedOutput: any,
    score: ReviewScore,
    attemptNumber: number,
    maxAttempts: number,
    generateSuggestion?: (failedOutput: any, score: ReviewScore) => Promise<string[]>,
  ): Promise<RetryInstruction> {
    const suggestions = generateSuggestion
      ? await generateSuggestion(failedOutput, score)
      : [`Score ${score.overall.toFixed(2)} below threshold. Try adjusting parameters.`];

    return {
      targetAgentId,
      originalOutput: failedOutput,
      failedCriterion: score.feedback || "unknown",
      failedScore: score.overall,
      suggestions,
      priorityParams: {},
      attemptNumber,
      maxAttempts,
    };
  }

  // ── 是否通过审核 ───────────────────────────────
  isPassed(score: ReviewScore): boolean { return score.passed; }

  // ── 辅助方法 ────────────────────────────────────
  private weightedAvg(scores: Record<string, number>, weights: Record<string, number>): number {
    let total = 0, weight = 0;
    for (const [k, w] of Object.entries(weights)) {
      if (scores[k] !== undefined) { total += scores[k] * w; weight += w; }
    }
    return weight > 0 ? total / weight : 1.0;
  }

  private getCriterionValue(scores: ReviewScore, name: string): number | undefined {
    const all = { ...scores.technical, ...scores.artistic, ...scores.contentMatch };
    return all[name as keyof typeof all];
  }
}
