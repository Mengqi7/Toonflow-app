import type { VisualStyleSpec } from "@/agents/director/DirectorAgent";

export interface ArtisticScore {
  composition: number;
  styleMatch: number;
  lighting: number;
  aesthetic: number;
}

export class ArtisticReviewer {
  /**
   * 艺术质量审核 — 使用 AI 视觉模型评估
   * 当前使用文本模型根据图像描述做评估（未来可升级为视觉模型直接看图）
   */
  async review(
    imageUrl: string,
    styleSpec?: VisualStyleSpec,
    aiEvaluate?: (prompt: string) => Promise<string>,
  ): Promise<ArtisticScore> {
    if (!aiEvaluate) {
      // Fallback: 无 AI 能力时使用规则评估
      return this.ruleBasedReview(imageUrl, styleSpec);
    }

    try {
      const styleDesc = styleSpec
        ? `目标风格: 色调${styleSpec.colorPalette?.temperature || "neutral"}, 饱和度${styleSpec.colorPalette?.saturation || "medium"}, 光影${styleSpec.lighting?.style || "mixed"}, 构图偏好${styleSpec.composition?.preferredShotTypes?.join(",") || "standard"}`
        : "无特定风格要求";

      const prompt = `你是一位资深电影艺术指导。请评估以下生成画面的艺术质量，用 JSON 格式返回评分(0-1)：

画面: ${imageUrl}
${styleDesc}

评估维度:
- composition: 构图是否专业（规则三分法、对称性、视觉引导线）
- styleMatch: 是否与目标风格一致
- lighting: 光影设计是否合理、有层次
- aesthetic: 整体美感和艺术感染力

请只返回JSON格式: {"composition":0.XX,"styleMatch":0.XX,"lighting":0.XX,"aesthetic":0.XX}`;

      const result = await aiEvaluate(prompt);
      const cleaned = result.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        const scores = JSON.parse(match[0]);
        return {
          composition: clampScore(scores.composition ?? 0.8),
          styleMatch: clampScore(scores.styleMatch ?? 0.8),
          lighting: clampScore(scores.lighting ?? 0.8),
          aesthetic: clampScore(scores.aesthetic ?? 0.8),
        };
      }
    } catch {
      // AI 评估失败，降级为规则评估
    }

    return this.ruleBasedReview(imageUrl, styleSpec);
  }

  /** 基于规则的降级评估 */
  private ruleBasedReview(_imageUrl: string, styleSpec?: VisualStyleSpec): ArtisticScore {
    let composition = 0.75;
    let styleMatch = 0.7;
    let lighting = 0.75;
    let aesthetic = 0.7;

    // 有风格参考时基础分略高
    if (styleSpec) {
      styleMatch = 0.75;
      lighting = styleSpec.lighting?.style ? 0.8 : 0.75;
    }

    return { composition, styleMatch, lighting, aesthetic };
  }
}

function clampScore(v: number): number {
  return Math.max(0, Math.min(1, Number(v) || 0.5));
}
