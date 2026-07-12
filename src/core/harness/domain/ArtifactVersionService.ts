import { v4 as uuid } from "uuid";
import { db } from "@/utils/db";
import { harnessEventBus } from "../HarnessEventBus";
import { entityId, numericEntityId, type EntityKind } from "./ids";
import type { ActionRun, ContextEntityRef, UiPatch, WorkbenchDomain } from "../workbench/contracts";

export interface ArtifactProvenance {
  actionRunId: string;
  sourceAgent?: string;
  provider?: string;
  model?: string;
  promptVersion?: string;
  inputReferences?: string[];
  reviewResult?: unknown;
  reason?: string;
}

export interface SaveArtifactVersionInput {
  projectId: number;
  artifactType: EntityKind | "image" | "video" | "audio" | "timeline";
  artifactKey: string;
  instanceId: string;
  content?: unknown;
  filePath?: string | null;
  source?: string;
  provenance: ArtifactProvenance;
}

export class ArtifactVersionService {
  async ensureSchema(): Promise<void> {
    if (!(await db.schema.hasTable("o_artifact_version"))) {
      await db.schema.createTable("o_artifact_version", table => {
        table.increments("id").primary();
        table.string("artifactType").notNullable();
        table.string("artifactKey").notNullable();
        table.integer("projectId").notNullable().index();
        table.string("instanceId").notNullable();
        table.integer("version").notNullable();
        table.text("content");
        table.text("filePath");
        table.text("reviewScore");
        table.text("reviewFeedback");
        table.string("source").defaultTo("harness");
        table.integer("createdAt").notNullable();
        table.unique(["artifactType", "artifactKey", "projectId", "version"]);
      });
    }
    const columns: Array<[string, (table: any) => void]> = [
      ["actionRunId", table => table.string("actionRunId").index()],
      ["sourceAgent", table => table.string("sourceAgent")],
      ["provider", table => table.string("provider")],
      ["model", table => table.string("model")],
      ["promptVersion", table => table.string("promptVersion")],
      ["inputReferences", table => table.text("inputReferences")],
      ["reviewResult", table => table.text("reviewResult")],
      ["reason", table => table.text("reason")],
      ["derivedFromVersion", table => table.integer("derivedFromVersion")],
    ];
    for (const [name, add] of columns) {
      if (!(await db.schema.hasColumn("o_artifact_version", name))) {
        await db.schema.alterTable("o_artifact_version", add);
      }
    }
  }

  async save(input: SaveArtifactVersionInput, derivedFromVersion?: number): Promise<number> {
    await this.ensureSchema();
    const current = await db("o_artifact_version")
      .where({ projectId: input.projectId, artifactType: input.artifactType, artifactKey: input.artifactKey })
      .max("version as version")
      .first();
    const version = Number(current?.version || 0) + 1;
    await db("o_artifact_version").insert({
      artifactType: input.artifactType,
      artifactKey: input.artifactKey,
      projectId: input.projectId,
      instanceId: input.instanceId,
      version,
      content: input.content === undefined ? null : JSON.stringify(input.content),
      filePath: input.filePath || null,
      source: input.source || "harness-v3",
      createdAt: Date.now(),
      actionRunId: input.provenance.actionRunId,
      sourceAgent: input.provenance.sourceAgent || "ai-director",
      provider: input.provenance.provider || null,
      model: input.provenance.model || null,
      promptVersion: input.provenance.promptVersion || null,
      inputReferences: JSON.stringify(input.provenance.inputReferences || []),
      reviewResult: input.provenance.reviewResult === undefined ? null : JSON.stringify(input.provenance.reviewResult),
      reason: input.provenance.reason || null,
      derivedFromVersion: derivedFromVersion || null,
    });
    return version;
  }

  async list(projectId: number, artifactType: string, artifactKey: string): Promise<any[]> {
    await this.ensureSchema();
    const rows = await db("o_artifact_version")
      .where({ projectId, artifactType, artifactKey })
      .orderBy("version", "desc");
    return rows.map((row: any) => ({
      ...row,
      content: this.parse(row.content),
      inputReferences: this.parse(row.inputReferences, []),
      reviewResult: this.parse(row.reviewResult),
    }));
  }

  async rollback(input: {
    actionRun: ActionRun;
    artifactType: EntityKind;
    artifactId: string;
    version: number;
    reason: string;
  }): Promise<{ version: number; content: unknown; uiPatch: UiPatch }> {
    await this.ensureSchema();
    const projectId = numericEntityId(input.actionRun.projectId, "project");
    const artifactKey = `${input.artifactType}:${input.artifactId}`;
    const target = await db("o_artifact_version")
      .where({ projectId, artifactType: input.artifactType, artifactKey, version: input.version })
      .first();
    if (!target) throw new Error(`Artifact version not found: ${artifactKey}@${input.version}`);
    const content = this.parse(target.content, {});
    await this.restoreDomainObject(projectId, input.artifactType, input.artifactId, content);
    const version = await this.save({
      projectId,
      artifactType: input.artifactType,
      artifactKey,
      instanceId: input.actionRun.instanceId,
      content,
      filePath: target.filePath,
      source: "rollback",
      provenance: {
        actionRunId: input.actionRun.id,
        sourceAgent: "ai-director",
        inputReferences: [artifactKey],
        reason: input.reason,
      },
    }, input.version);
    const ref = { type: input.artifactType, id: entityId(input.artifactType, input.artifactId), version } as ContextEntityRef;
    const uiPatch: UiPatch = {
      id: `patch-${uuid()}`,
      actionRunId: input.actionRun.id,
      domain: this.domainFor(input.artifactType),
      operation: "replace",
      target: ref,
      changes: content as Record<string, unknown>,
      version,
      timestamp: Date.now(),
    };
    await harnessEventBus.emitWorkbenchEvent({
      kind: "artifact.rolled_back",
      actionRunId: input.actionRun.id,
      instanceId: input.actionRun.instanceId,
      projectId: input.actionRun.projectId,
      entity: ref,
      payload: { fromVersion: input.version, version, reason: input.reason },
    });
    return { version, content, uiPatch };
  }

  private async restoreDomainObject(projectId: number, type: EntityKind, id: string, content: any): Promise<void> {
    const numericId = Number(id);
    const mappings: Partial<Record<EntityKind, { table: string; allowed: string[]; typeValue?: string }>> = {
      script: { table: "o_script", allowed: ["name", "content", "extractState", "errorReason"] },
      beat: { table: "o_beat", allowed: ["title", "summary", "orderIndex", "status"] },
      scene: { table: "o_scene", allowed: ["title", "summary", "description", "locationId", "characterIds", "propIds", "orderIndex", "status"] },
      shot: { table: "o_storyboard", allowed: ["prompt", "videoDesc", "duration", "shotSize", "cameraMovement", "state", "filePath"] },
      character: { table: "o_assets", allowed: ["name", "prompt", "describe", "remark", "imageId"], typeValue: "role" },
      prop: { table: "o_assets", allowed: ["name", "prompt", "describe", "remark", "imageId"], typeValue: "tool" },
      location: { table: "o_assets", allowed: ["name", "prompt", "describe", "remark", "imageId"], typeValue: "scene" },
    };
    const mapping = mappings[type];
    if (!mapping || !Number.isSafeInteger(numericId)) throw new Error(`Rollback is not supported for ${type}:${id}`);
    const patch = Object.fromEntries(mapping.allowed.filter(key => content[key] !== undefined).map(key => [key, content[key]]));
    const query = (db as any)(mapping.table).where({ id: numericId, projectId });
    if (mapping.typeValue) query.andWhere("type", mapping.typeValue);
    const updated = await query.update({ ...patch, updateTime: Date.now() });
    if (!updated) throw new Error(`Domain object not found for rollback: ${type}:${id}`);
  }

  private domainFor(type: EntityKind): WorkbenchDomain {
    if (type === "script") return "script";
    if (type === "beat") return "beats";
    if (type === "scene") return "scenes";
    if (type === "shot") return "storyboard";
    if (type === "character") return "characters";
    if (type === "prop") return "props";
    if (type === "location") return "locations";
    return "assets";
  }

  private parse<T = unknown>(value: string | null | undefined, fallback?: T): T {
    if (!value) return fallback as T;
    try { return JSON.parse(value) as T; } catch { return value as T; }
  }
}

export const artifactVersionService = new ArtifactVersionService();
