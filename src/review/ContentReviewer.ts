export interface ContentScore {
  sceneAccuracy: number;
  characterMatch: number;
  propAccuracy: number;
}

export class ContentReviewer {
  /**
   * 内容匹配审核 — 对比生成结果与原始需求
   * 支持 AI 文本模型评估或规则降级
   */
  async review(
    generatedDescription: string,
    referenceDescription: string,
    aiEvaluate?: (prompt: string) => Promise<string>,
  ): Promise<ContentScore> {
    if (!aiEvaluate) {
      return this.ruleBasedReview(generatedDescription, referenceDescription);
    }

    try {
      const prompt = `你是内容审核专家。请对比"生成内容"与"原始需求"的匹配程度，用 JSON 返回评分(0-1)：

生成内容描述: ${generatedDescription.slice(0, 500)}
原始需求: ${referenceDescription.slice(0, 500)}

评估维度:
- sceneAccuracy: 场景设定是否准确（地点/时间/氛围）
- characterMatch: 角色描述是否一致（外貌/服装/动作）
- propAccuracy: 道具/环境细节是否匹配

请只返回JSON: {"sceneAccuracy":0.XX,"characterMatch":0.XX,"propAccuracy":0.XX}`;

      const result = await aiEvaluate(prompt);
      const cleaned = result.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        const scores = JSON.parse(match[0]);
        return {
          sceneAccuracy: clampScore(scores.sceneAccuracy ?? 0.85),
          characterMatch: clampScore(scores.characterMatch ?? 0.85),
          propAccuracy: clampScore(scores.propAccuracy ?? 0.85),
        };
      }
    } catch {
      // 降级
    }

    return this.ruleBasedReview(generatedDescription, referenceDescription);
  }

  /** 基于关键词的降级评估 */
  private ruleBasedReview(generated: string, reference: string): ContentScore {
    const genLower = generated.toLowerCase();
    const refLower = reference.toLowerCase();

    // 简单的关键词重叠检测
    const refWords = refLower.split(/[\s,，。、]+/).filter(w => w.length > 1);
    const overlap = refWords.filter(w => genLower.includes(w)).length;
    const ratio = refWords.length > 0 ? overlap / refWords.length : 0.5;

    const baseScore = 0.5 + ratio * 0.45; // 0.5 ~ 0.95
    return {
      sceneAccuracy: Math.min(0.95, baseScore + 0.05),
      characterMatch: Math.min(0.95, baseScore),
      propAccuracy: Math.min(0.95, baseScore - 0.05),
    };
  }
}

function clampScore(v: number): number {
  return Math.max(0, Math.min(1, Number(v) || 0.5));
}
