import { v4 as uuid } from "uuid";
import { db } from "@/utils/db";
import { entityId, type EntityKind } from "../domain/ids";
import type { ContextEntityRef } from "./contracts";

export type ArtifactRelation =
  | "contains"
  | "derived_from"
  | "references"
  | "generated_from"
  | "review_of"
  | "version_of";

export interface ArtifactLinkInput {
  projectId: number;
  sourceType: EntityKind;
  sourceId: string | number;
  targetType: EntityKind;
  targetId: string | number;
  relation: ArtifactRelation;
  actionRunId?: string;
  metadata?: Record<string, unknown>;
}

export class ArtifactGraph {
  async ensureTable(): Promise<void> {
    if (await db.schema.hasTable("o_artifact_link")) return;
    await db.schema.createTable("o_artifact_link", table => {
      table.string("id").primary();
      table.integer("projectId").notNullable().index();
      table.string("sourceType").notNullable();
      table.string("sourceId").notNullable();
      table.string("targetType").notNullable();
      table.string("targetId").notNullable();
      table.string("relation").notNullable();
      table.string("actionRunId").index();
      table.text("metadata");
      table.integer("createdAt").notNullable();
      table.unique(["projectId", "sourceType", "sourceId", "targetType", "targetId", "relation"]);
    });
  }

  async link(input: ArtifactLinkInput): Promise<string> {
    await this.ensureTable();
    const existing = await db("o_artifact_link").where({
      projectId: input.projectId,
      sourceType: input.sourceType,
      sourceId: String(input.sourceId),
      targetType: input.targetType,
      targetId: String(input.targetId),
      relation: input.relation,
    }).first();
    if (existing) return existing.id;

    const id = `link-${uuid()}`;
    await db("o_artifact_link").insert({
      id,
      projectId: input.projectId,
      sourceType: input.sourceType,
      sourceId: String(input.sourceId),
      targetType: input.targetType,
      targetId: String(input.targetId),
      relation: input.relation,
      actionRunId: input.actionRunId || null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      createdAt: Date.now(),
    });
    return id;
  }

  async resolve(projectId: number, refs: ContextEntityRef[]): Promise<{
    related: ContextEntityRef[];
    upstream: ContextEntityRef[];
    downstream: ContextEntityRef[];
  }> {
    await this.ensureTable();
    if (!refs.length) return { related: [], upstream: [], downstream: [] };

    const pairs = refs.map(ref => ({ type: ref.type, id: String(ref.id).split(":").slice(1).join(":") }));
    const rows = await db("o_artifact_link").where("projectId", projectId).andWhere(builder => {
      for (const pair of pairs) {
        builder.orWhere({ sourceType: pair.type, sourceId: pair.id }).orWhere({ targetType: pair.type, targetId: pair.id });
      }
    });

    const related = new Map<string, ContextEntityRef>();
    const upstream = new Map<string, ContextEntityRef>();
    const downstream = new Map<string, ContextEntityRef>();
    for (const row of rows) {
      const source = { type: row.sourceType, id: entityId(row.sourceType, row.sourceId) } as ContextEntityRef;
      const target = { type: row.targetType, id: entityId(row.targetType, row.targetId) } as ContextEntityRef;
      related.set(String(source.id), source);
      related.set(String(target.id), target);
      downstream.set(String(target.id), target);
      upstream.set(String(source.id), source);
    }
    for (const ref of refs) related.delete(String(ref.id));
    return { related: [...related.values()], upstream: [...upstream.values()], downstream: [...downstream.values()] };
  }
}

export const artifactGraph = new ArtifactGraph();
