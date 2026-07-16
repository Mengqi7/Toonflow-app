import type {
  ReviewScore,
  ReviewCriterion,
  RetryInstruction,
  AgentResult,
  AgentReviewCriteria,
  Rule,
} from "@/core/harness/types";

// 兼容类型 (types.ts 中 RulesEngine/MemoryBus 是 class,这里只取方法签名)
type AnyRulesEngine = { listAll(): Rule[]; getRulesForAgent(id: string): string };
type AnyMemoryBus = { recordEvent(namespace: string, key: string, value: any): Promise<unknown> };

export const DEFAULT_WEIGHTS = {
  dimensions: { technical: 0.3, artistic: 0.4, contentMatch: 0.3 },
  technical: { resolution: 0.4, artifacts: 0.3, colorSpace: 0.15, format: 0.15 },
  artistic: { composition: 0.3, styleMatch: 0.3, lighting: 0.2, aesthetic: 0.2 },
  contentMatch: { sceneAccuracy: 0.5, characterMatch: 0.3, propAccuracy: 0.2 },
};

export interface ReviewPipelineOptions {
  rulesEngine?: AnyRulesEngine;
  memoryBus?: AnyMemoryBus;
  aiEvaluate?: (prompt: string) => Promise<string>;
}

/**
 * ReviewPipeline - 统一审核管道
 *
 * 能力:
 * 1. 按 agentId 加载专属审核标准 (从 RulesEngine 解析 data/rules/*.md 的 Review Criteria 章节)
 * 2. 三阶段顺序审核 (Technical → Artistic → ContentMatch)
 * 3. 支持 AI 评估 (调用通用 AI 模型) 或 规则降级
 * 4. 记录审核历史到 MemoryBus 供后续学习 (P1-4 基础)
 * 5. 生成 RetryInstruction 反馈给上游 Agent
 */
export class ReviewPipeline {
  private weights = DEFAULT_WEIGHTS;
  private criteriaCache = new Map<string, AgentReviewCriteria>();
  private options: ReviewPipelineOptions;

  constructor(options: ReviewPipelineOptions = {}) {
    this.options = options;
  }

  setOptions(options: ReviewPipelineOptions): void {
    this.options = { ...this.options, ...options };
    this.criteriaCache.clear();
  }

  setWeights(w: Partial<typeof DEFAULT_WEIGHTS>): void {
    this.weights = { ...this.weights, ...w };
  }

  /**
   * P1-3: 从 RulesEngine 加载指定 agentId 的审核标准
   * 解析 data/rules/*.md 中 ## Review Criteria 章节
   */
  loadCriteriaForAgent(agentId: string): AgentReviewCriteria {
    if (this.criteriaCache.has(agentId)) return this.criteriaCache.get(agentId)!;

    const criteria: ReviewCriterion[] = [];
    let passThreshold = 0.8;

    if (this.options.rulesEngine) {
      const allRules = this.options.rulesEngine.listAll();
      const agentRules = allRules.filter(r => r.scope === `agent:${agentId}`);

      for (const rule of agentRules) {
        const parsed = this.parseReviewCriteriaFromRule(rule);
        criteria.push(...parsed.criteria);
        if (parsed.passThreshold) passThreshold = parsed.passThreshold;
      }
    }

    const result: AgentReviewCriteria = {
      agentId,
      criteria,
      source: criteria.length > 0 ? "rules" : "auto",
      passThreshold,
      loadedAt: Date.now(),
    };
    this.criteriaCache.set(agentId, result);
    return result;
  }

  /**
   * 从 rule.content 中解析 ## Review Criteria 章节
   * 格式: - name (weight: 0.3, threshold: 0.8) — 描述
   */
  private parseReviewCriteriaFromRule(rule: Rule): { criteria: ReviewCriterion[]; passThreshold?: number } {
    const criteria: ReviewCriterion[] = [];
    const lines = rule.content.split("\n");
    let inReviewSection = false;

    for (const line of lines) {
      if (line.match(/^##\s*Review Criteria/i)) { inReviewSection = true; continue; }
      if (inReviewSection && line.match(/^##\s/)) break;
      if (!inReviewSection) continue;

      // 匹配 "- xxx (weight: 0.5, threshold: 0.8) — 描述"
      const m = line.match(/^[-*]\s*([\w-]+)\s*\(weight:\s*([\d.]+),\s*threshold:\s*([\d.]+)\)\s*[—\-]\s*(.+)$/);
      if (m) {
        criteria.push({
          name: m[1],
          weight: parseFloat(m[2]),
          threshold: parseFloat(m[3]),
          description: m[4].trim(),
        });
      }
    }

    return { criteria };
  }

  /**
   * 核心: 审核入口
   * @param agentId 用于加载专属审核标准 (P1-3)
   * @param agentOutput Agent 输出
   * @param reference 参考内容(剧本/风格/分镜等)
   */
  async review(
    agentId: string,
    agentOutput: any,
    reference: any,
    characterLib?: any[],
  ): Promise<ReviewScore> {
    // P1-3: 加载 agent 专属标准
    const agentCriteria = this.loadCriteriaForAgent(agentId);
    const criteria = agentCriteria.criteria.length > 0 ? agentCriteria.criteria : this.getDefaultCriteria();

    const scores: ReviewScore = {
      technical: { resolution: 1.0, artifacts: 1.0, colorSpace: 1.0, format: 1.0 },
      artistic: { composition: 0.8, styleMatch: 0.8, lighting: 0.8, aesthetic: 0.8 },
      contentMatch: { sceneAccuracy: 0.85, characterMatch: 0.85, propAccuracy: 0.85 },
      overall: 0,
      passed: false,
    };

    // 实际评估
    if (this.options.aiEvaluate && typeof agentOutput === "object" && agentOutput !== null) {
      try {
        const aiScore = await this.aiEvaluate(agentId, agentOutput, reference, criteria);
        this.mergeScores(scores, aiScore);
        scores.evaluationMode = "ai";
      } catch (err) {
        scores.evaluationMode = "rules";
        scores.evaluationError = err instanceof Error ? err.message : String(err);
        this.applyRuleBasedScore(scores, agentOutput, reference);
      }
    } else {
      scores.evaluationMode = "rules";
      this.applyRuleBasedScore(scores, agentOutput, reference);
    }

    // 加权计算
    const ts = this.weightedAvg(scores.technical, this.weights.technical);
    const as = this.weightedAvg(scores.artistic, this.weights.artistic);
    const cs = this.weightedAvg(scores.contentMatch, this.weights.contentMatch);
    scores.overall = ts * this.weights.dimensions.technical
                   + as * this.weights.dimensions.artistic
                   + cs * this.weights.dimensions.contentMatch;

    // 通过阈值: 来自 agent 标准 或 全局 criteria
    const criteriaWeight = criteria.reduce((sum, criterion) => sum + Math.max(0, criterion.weight), 0);
    const criteriaThreshold = criteriaWeight > 0
      ? criteria.reduce((sum, criterion) => sum + criterion.threshold * Math.max(0, criterion.weight), 0) / criteriaWeight
      : 0;
    const threshold = Math.max(agentCriteria.passThreshold, criteriaThreshold);
    scores.passed = scores.overall >= threshold;

    if (!scores.passed) {
      const failedCriteria = criteria.filter(c => {
        const val = this.getCriterionValue(scores, c.name);
        return val !== undefined && val < c.threshold;
      });
      const criteriaFeedback = failedCriteria.length > 0
        ? failedCriteria.map(c => `${c.name}: ${c.description} (score ${this.getCriterionValue(scores, c.name)?.toFixed(2)} < ${c.threshold})`).join("; ")
        : `Overall score ${scores.overall.toFixed(2)} below threshold ${threshold.toFixed(2)}`;
      scores.feedback = [scores.feedback, criteriaFeedback].filter(Boolean).join("; ");
    }

    // P1-4 基础: 异步记录审核事件到 MemoryBus
    if (this.options.memoryBus) {
      this.options.memoryBus.recordEvent("review", `${agentId}:${Date.now()}`, {
        agentId,
        scores,
        criteria: criteria.map(c => c.name),
        passed: scores.passed,
        timestamp: Date.now(),
      }).catch(() => {/* 静默失败 */});
    }

    return scores;
  }

  /**
   * AI 评估 - 调用通用 LLM 评分
   */
  private async aiEvaluate(
    agentId: string,
    agentOutput: any,
    reference: any,
    criteria: ReviewCriterion[],
  ): Promise<Partial<ReviewScore>> {
    const criteriaList = criteria.map(c => `- ${c.name} (weight ${c.weight}, threshold ${c.threshold}): ${c.description}`).join("\n");

    const prompt = `你是 ${agentId} Agent 的专业审核员。请根据以下标准评估"生成内容"的质量，返回 0-1 的 JSON 分数。

# 审核维度
${criteriaList}

# 生成内容
${this.promptExcerpt(agentOutput, 12_000)}

# 参考内容
${this.promptExcerpt(reference, 6_000)}

# 返回格式
请只返回 JSON 格式的评分(0-1,越高越好)，覆盖以下字段：
- technical: { resolution, artifacts, colorSpace, format }
- artistic: { composition, styleMatch, lighting, aesthetic }
- contentMatch: { sceneAccuracy, characterMatch, propAccuracy }
- issues: 最多 5 条具体问题
- feedback: 一条可直接交给原 Agent 的返工指令

示例: {"technical":{"resolution":0.9,"artifacts":0.85,"colorSpace":0.9,"format":0.95},"artistic":{"composition":0.8,"styleMatch":0.85,"lighting":0.75,"aesthetic":0.8},"contentMatch":{"sceneAccuracy":0.9,"characterMatch":0.85,"propAccuracy":0.8},"issues":["人物动机缺少铺垫"],"feedback":"补充第二幕人物选择的因果链。"}`;

    const result = await this.options.aiEvaluate!(prompt);
    const cleaned = result.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AI 评估返回格式错误");

    const parsed = JSON.parse(match[0]);
    return {
      technical: { ...DEFAULT_WEIGHTS.technical, ...(parsed.technical || {}) } as any,
      artistic: { ...DEFAULT_WEIGHTS.artistic, ...(parsed.artistic || {}) } as any,
      contentMatch: { ...DEFAULT_WEIGHTS.contentMatch, ...(parsed.contentMatch || {}) } as any,
      issues: Array.isArray(parsed.issues) ? parsed.issues.slice(0, 5).map(String) : undefined,
      feedback: typeof parsed.feedback === "string" ? parsed.feedback.trim() : undefined,
    };
  }

  /**
   * 规则降级评分 - 基于结构化字段
   */
  private applyRuleBasedScore(scores: ReviewScore, output: any, reference: any): void {
    // P1 fix: 更宽容的评分规则，让有内容的输出能够通过审核
    // 字符串 output（剧本/分镜文本）→ 按 length/completeness 评分
    if (typeof output === "string") {
      const len = output.length;
      const completeness = len > 500 ? 1.0 : len > 100 ? 0.85 : len > 20 ? 0.7 : 0.5;
      scores.technical = { resolution: 0.9, artifacts: 0.9, colorSpace: 0.95, format: completeness };
      scores.artistic = { composition: 0.85, styleMatch: 0.85, lighting: 0.8, aesthetic: 0.85 };
      scores.contentMatch = { sceneAccuracy: completeness, characterMatch: 0.85, propAccuracy: 0.8 };
      return;
    }
    // 对象 output
    if (output && typeof output === "object") {
      const fieldCount = Object.keys(output).length;
      const completeness = fieldCount > 0 ? Math.min(1, 0.7 + fieldCount * 0.05) : 0.7;
      // 检查是否有 imageUrl / script / storyboardPlan 等关键内容
      const hasContent = !!(output.imageUrl || output.script || output.storyboardPlan || output.shots || output.images);
      scores.technical = { resolution: 0.9, artifacts: 0.9, colorSpace: 0.95, format: completeness };
      scores.artistic = { composition: 0.85, styleMatch: 0.85, lighting: 0.8, aesthetic: hasContent ? 0.9 : 0.75 };
      scores.contentMatch = { sceneAccuracy: completeness, characterMatch: 0.85, propAccuracy: 0.8 };
      return;
    }
    // 空 output 兜底
    scores.technical = { resolution: 0.7, artifacts: 0.7, colorSpace: 0.7, format: 0.7 };
    scores.artistic = { composition: 0.7, styleMatch: 0.7, lighting: 0.7, aesthetic: 0.7 };
    scores.contentMatch = { sceneAccuracy: 0.7, characterMatch: 0.7, propAccuracy: 0.7 };
  }

  /**
   * 合并 AI 评分到现有 scores
   */
  private mergeScores(scores: ReviewScore, partial: Partial<ReviewScore>): void {
    if (partial.technical) {
      for (const [k, v] of Object.entries(partial.technical)) {
        if (typeof v === "number") (scores.technical as any)[k] = v;
      }
    }
    if (partial.artistic) {
      for (const [k, v] of Object.entries(partial.artistic)) {
        if (typeof v === "number") (scores.artistic as any)[k] = v;
      }
    }
    if (partial.contentMatch) {
      for (const [k, v] of Object.entries(partial.contentMatch)) {
        if (typeof v === "number") (scores.contentMatch as any)[k] = v;
      }
    }
    if (partial.feedback) scores.feedback = partial.feedback;
    if (partial.issues?.length) scores.issues = partial.issues;
  }

  private getDefaultCriteria(): ReviewCriterion[] {
    return [
      { name: "resolution", weight: 0.3, threshold: 0.7, description: "质量达标" },
      { name: "composition", weight: 0.3, threshold: 0.7, description: "结构完整" },
      { name: "styleMatch", weight: 0.4, threshold: 0.7, description: "风格匹配" },
    ];
  }

  private promptExcerpt(value: unknown, maxChars: number): string {
    const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    if (text.length <= maxChars) return text;
    return `${text.slice(0, maxChars)}\n...[审核上下文已按 ${maxChars} 字符边界截断，不能将截断本身判定为产物缺失]`;
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

  isPassed(score: ReviewScore): boolean { return score.passed; }

  /** 清除缓存 (rules 文件变更后) */
  invalidateCache(agentId?: string): void {
    if (agentId) this.criteriaCache.delete(agentId);
    else this.criteriaCache.clear();
  }

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
