import { cosineSimilarity, getEmbedding } from "@/utils/agent/embedding";
import { db } from "@/utils/db";

export interface CharacterConsistencyResult {
  characterName: string;
  similarity: number | null;
  threshold: number;
  passed: boolean;
  referenceId?: number;
  reason?: string;
}

/** Stores a text representation of character references and compares new designs against it. */
export class CharacterConsistencyReviewer {
  constructor(private readonly threshold = 0.72) {}

  async review(input: {
    projectId: number;
    characterName: string;
    description: string;
    costume: Record<string, any>;
    referenceImage?: string;
  }): Promise<CharacterConsistencyResult> {
    const currentText = this.toEmbeddingText(input.characterName, input.description, input.costume, input.referenceImage);
    try {
      const current = await getEmbedding(currentText);
      const references = await db("o_character_library")
        .where({ projectId: input.projectId, characterName: input.characterName })
        .whereNotNull("embedding")
        .orderBy("updateTime", "desc");
      const reference = references[0];
      if (!reference) {
        await this.updateEmbedding(input.projectId, input.characterName, current);
        return { characterName: input.characterName, similarity: null, threshold: this.threshold, passed: true, reason: "reference_initialized" };
      }

      const similarity = cosineSimilarity(current, this.decode(reference.embedding));
      await this.updateEmbedding(input.projectId, input.characterName, current);
      return {
        characterName: input.characterName,
        similarity: Math.round(similarity * 1000) / 1000,
        threshold: this.threshold,
        passed: similarity >= this.threshold,
        referenceId: reference.id,
        reason: similarity >= this.threshold ? undefined : "character_embedding_drift",
      };
    } catch (error) {
      return {
        characterName: input.characterName,
        similarity: null,
        threshold: this.threshold,
        passed: true,
        reason: `embedding_unavailable: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private async updateEmbedding(projectId: number, characterName: string, embedding: number[]): Promise<void> {
    await db("o_character_library").where({ projectId, characterName }).update({
      embedding: Buffer.from(new Float32Array(embedding).buffer),
      updateTime: Date.now(),
    });
  }

  private toEmbeddingText(name: string, description: string, costume: Record<string, any>, referenceImage?: string): string {
    return [name, description, costume.outfit, costume.hairStyle, costume.makeup,
      Array.isArray(costume.accessories) ? costume.accessories.join(", ") : costume.accessories,
      referenceImage].filter(Boolean).join(" | ");
  }

  private decode(value: unknown): number[] {
    if (Buffer.isBuffer(value)) return Array.from(new Float32Array(value.buffer, value.byteOffset, Math.floor(value.byteLength / 4)));
    if (typeof value === "string") {
      try { return JSON.parse(value).map(Number); } catch { return []; }
    }
    return Array.isArray(value) ? value.map(Number) : [];
  }
}
