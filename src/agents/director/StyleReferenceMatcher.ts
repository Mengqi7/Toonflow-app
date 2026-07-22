import { cosineSimilarity, getEmbedding } from "@/utils/agent/embedding";
import { db } from "@/utils/db";

export interface StyleReferenceMatch { id: number; name: string; score: number; prompt?: string; fileUrl?: string; }

/** Semantic style matching using the project's local embedding model. */
export class StyleReferenceMatcher {
  async match(input: { referenceImage?: string; description?: string; limit?: number }): Promise<StyleReferenceMatch[]> {
    const referenceText = [input.description, input.referenceImage].filter(Boolean).join(" | ");
    if (!referenceText.trim()) return [];
    const query = await getEmbedding(referenceText);
    const rows = await db("o_artStyle").select("*");
    const matches: StyleReferenceMatch[] = [];
    for (const row of rows) {
      const text = [row.name, row.label, row.prompt, row.fileUrl].filter(Boolean).join(" | ");
      if (!text) continue;
      const embedding = await getEmbedding(text);
      const score = cosineSimilarity(query, embedding);
      matches.push({ id: row.id, name: row.name || row.label || `style-${row.id}`, score: Math.round(score * 1000) / 1000, prompt: row.prompt, fileUrl: row.fileUrl });
    }
    return matches.sort((a, b) => b.score - a.score).slice(0, input.limit ?? 5);
  }
}
