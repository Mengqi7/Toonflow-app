import { v4 as uuid } from "uuid";
import { db } from "@/utils/db";
import { harnessEventBus } from "../HarnessEventBus";
import { entityId, numericEntityId, type EntityKind } from "./ids";
import { artifactGraph } from "../workbench/ArtifactGraph";
import { artifactVersionService } from "./ArtifactVersionService";
import type { ActionRun, ContextEntityRef, UiPatch, WorkbenchDomain } from "../workbench/contracts";

type AssetKind = "character" | "prop" | "location";

export interface DomainMutationResult {
  entity: ContextEntityRef;
  record: Record<string, unknown>;
  changedFields: string[];
  version: number;
  uiPatch: UiPatch;
}

export class FilmDomainService {
  async ensureSchema(): Promise<void> {
    const knex = db as any;
    if (!(await db.schema.hasTable("o_beat"))) {
      await db.schema.createTable("o_beat", table => {
        table.increments("id").primary();
        table.integer("projectId").notNullable().index();
        table.integer("episodeId").notNullable().index();
        table.integer("scriptId").index();
        table.string("title").notNullable();
        table.text("summary");
        table.integer("orderIndex").defaultTo(0);
        table.string("status").defaultTo("draft");
        table.string("source").defaultTo("harness-v3");
        table.string("createdBy").defaultTo("ai-director");
        table.integer("createTime").notNullable();
        table.integer("updateTime").notNullable();
      });
    }
    if (!(await db.schema.hasTable("o_scene"))) {
      await db.schema.createTable("o_scene", table => {
        table.increments("id").primary();
        table.integer("projectId").notNullable().index();
        table.integer("episodeId").notNullable().index();
        table.integer("scriptId").index();
        table.integer("beatId").index();
        table.string("title").notNullable();
        table.text("summary");
        table.text("description");
        table.integer("locationId");
        table.text("characterIds").defaultTo("[]");
        table.text("propIds").defaultTo("[]");
        table.integer("orderIndex").defaultTo(0);
        table.string("status").defaultTo("draft");
        table.string("source").defaultTo("harness-v3");
        table.string("createdBy").defaultTo("ai-director");
        table.integer("createTime").notNullable();
        table.integer("updateTime").notNullable();
      });
    }
    const extensions: Array<[string, Array<[string, (table: any) => void]>]> = [
      ["o_script", [["source", t => t.string("source")], ["createdBy", t => t.string("createdBy")], ["updateTime", t => t.integer("updateTime")]]],
      ["o_assets", [["source", t => t.string("source")], ["createdBy", t => t.string("createdBy")], ["updateTime", t => t.integer("updateTime")]]],
      ["o_storyboard", [["sceneId", t => t.integer("sceneId").index()], ["shotSize", t => t.string("shotSize")], ["cameraMovement", t => t.string("cameraMovement")], ["lockedRefs", t => t.text("lockedRefs")], ["updateTime", t => t.integer("updateTime")]]],
    ];
    for (const [table, columns] of extensions) {
      if (!(await db.schema.hasTable(table))) continue;
      for (const [column, add] of columns) {
        if (!(await db.schema.hasColumn(table, column))) await db.schema.alterTable(table, add);
      }
    }
    await artifactGraph.ensureTable();
    await artifactVersionService.ensureSchema();
    void knex;
  }

  async readScript(actionRun: ActionRun, scriptId: string): Promise<Record<string, unknown>> {
    const projectId = numericEntityId(actionRun.projectId, "project");
    const id = Number(scriptId);
    const row = await db("o_script").where({ id, projectId }).first();
    if (!row) throw new Error(`Script not found: script:${scriptId}`);
    return row as Record<string, unknown>;
  }

  async createScript(actionRun: ActionRun, input: { name: string; content: string }): Promise<DomainMutationResult> {
    await this.ensureSchema();
    const projectId = numericEntityId(actionRun.projectId, "project");
    const now = Date.now();
    const [id] = await db("o_script").insert({
      name: input.name,
      content: input.content,
      projectId,
      extractState: 1,
      createTime: now,
      updateTime: now,
      source: "harness-v3",
      createdBy: "ai-director",
    } as any);
    const record = await db("o_script").where({ id, projectId }).first();
    await artifactGraph.link({ projectId, sourceType: "project", sourceId: projectId, targetType: "script", targetId: id, relation: "contains", actionRunId: actionRun.id });
    return this.finishMutation(actionRun, "script", id, record, Object.keys(input), "script", "insert");
  }

  async updateScript(actionRun: ActionRun, scriptId: string, patch: { name?: string; content?: string }): Promise<DomainMutationResult> {
    return this.updateRecord(actionRun, "script", "o_script", scriptId, patch, ["name", "content"], "script");
  }

  async listBeats(actionRun: ActionRun): Promise<Record<string, unknown>[]> {
    await this.ensureSchema();
    const projectId = numericEntityId(actionRun.projectId, "project");
    const episodeId = this.episodeId(actionRun);
    return (db as any)("o_beat").where({ projectId, episodeId }).orderBy("orderIndex", "asc");
  }

  async createBeat(actionRun: ActionRun, input: { title: string; summary?: string; orderIndex?: number; scriptId?: string }): Promise<DomainMutationResult> {
    await this.ensureSchema();
    const projectId = numericEntityId(actionRun.projectId, "project");
    const episodeId = this.episodeId(actionRun);
    const now = Date.now();
    const [id] = await (db as any)("o_beat").insert({
      projectId,
      episodeId,
      scriptId: input.scriptId ? Number(input.scriptId) : episodeId,
      title: input.title,
      summary: input.summary || "",
      orderIndex: input.orderIndex || 0,
      status: "draft",
      source: "harness-v3",
      createdBy: "ai-director",
      createTime: now,
      updateTime: now,
    });
    const record = await (db as any)("o_beat").where({ id, projectId }).first();
    await artifactGraph.link({ projectId, sourceType: "script", sourceId: record.scriptId, targetType: "beat", targetId: id, relation: "contains", actionRunId: actionRun.id });
    return this.finishMutation(actionRun, "beat", id, record, Object.keys(input), "beats", "insert");
  }

  async updateBeat(actionRun: ActionRun, beatId: string, patch: Record<string, unknown>): Promise<DomainMutationResult> {
    return this.updateRecord(actionRun, "beat", "o_beat", beatId, patch, ["title", "summary", "orderIndex", "status"], "beats");
  }

  async readScene(actionRun: ActionRun, sceneId: string): Promise<Record<string, unknown>> {
    await this.ensureSchema();
    const projectId = numericEntityId(actionRun.projectId, "project");
    const row = await (db as any)("o_scene").where({ id: Number(sceneId), projectId }).first();
    if (!row) throw new Error(`Scene not found: scene:${sceneId}`);
    return this.deserializeScene(row);
  }

  async createScene(actionRun: ActionRun, input: {
    title: string;
    summary?: string;
    description?: string;
    beatId?: string;
    locationId?: string;
    characterIds?: string[];
    propIds?: string[];
    orderIndex?: number;
  }): Promise<DomainMutationResult> {
    await this.ensureSchema();
    const projectId = numericEntityId(actionRun.projectId, "project");
    const episodeId = this.episodeId(actionRun);
    const now = Date.now();
    const [id] = await (db as any)("o_scene").insert({
      projectId,
      episodeId,
      scriptId: episodeId,
      beatId: input.beatId ? Number(input.beatId) : null,
      title: input.title,
      summary: input.summary || "",
      description: input.description || "",
      locationId: input.locationId ? Number(input.locationId) : null,
      characterIds: JSON.stringify(input.characterIds || []),
      propIds: JSON.stringify(input.propIds || []),
      orderIndex: input.orderIndex || 0,
      status: "draft",
      source: "harness-v3",
      createdBy: "ai-director",
      createTime: now,
      updateTime: now,
    });
    const record = this.deserializeScene(await (db as any)("o_scene").where({ id, projectId }).first());
    await artifactGraph.link({ projectId, sourceType: input.beatId ? "beat" : "script", sourceId: input.beatId || episodeId, targetType: "scene", targetId: id, relation: "contains", actionRunId: actionRun.id });
    await this.linkSceneReferences(projectId, id, input, actionRun.id);
    return this.finishMutation(actionRun, "scene", id, record, Object.keys(input), "scenes", "insert");
  }

  async updateScene(actionRun: ActionRun, sceneId: string, patch: Record<string, unknown>): Promise<DomainMutationResult> {
    const result = await this.updateRecord(actionRun, "scene", "o_scene", sceneId, {
      ...patch,
      characterIds: patch.characterIds ? JSON.stringify(patch.characterIds) : undefined,
      propIds: patch.propIds ? JSON.stringify(patch.propIds) : undefined,
      locationId: patch.locationId ? Number(String(patch.locationId).split(":").pop()) : patch.locationId,
    }, ["title", "summary", "description", "locationId", "characterIds", "propIds", "orderIndex", "status"], "scenes");
    result.record = this.deserializeScene(result.record);
    return result;
  }

  async listAssets(actionRun: ActionRun, kind?: AssetKind): Promise<Record<string, unknown>[]> {
    const projectId = numericEntityId(actionRun.projectId, "project");
    let query = db("o_assets").where({ projectId }).whereNull("assetsId");
    if (kind) query = query.where("type", this.assetType(kind));
    return query.orderBy("id", "asc") as any;
  }

  async createAsset(actionRun: ActionRun, kind: AssetKind, input: { name: string; description?: string; prompt?: string; scriptId?: string }): Promise<DomainMutationResult> {
    await this.ensureSchema();
    const projectId = numericEntityId(actionRun.projectId, "project");
    const now = Date.now();
    const [id] = await db("o_assets").insert({
      projectId,
      scriptId: input.scriptId ? Number(input.scriptId) : actionRun.episodeId ? this.episodeId(actionRun) : null,
      name: input.name,
      describe: input.description || "",
      prompt: input.prompt || "",
      type: this.assetType(kind),
      startTime: now,
      updateTime: now,
      source: "harness-v3",
      createdBy: "ai-director",
    } as any);
    const record = await db("o_assets").where({ id, projectId }).first();
    await artifactGraph.link({ projectId, sourceType: "project", sourceId: projectId, targetType: kind, targetId: id, relation: "contains", actionRunId: actionRun.id });
    return this.finishMutation(actionRun, kind, id, record, Object.keys(input), this.domainFor(kind), "insert");
  }

  async updateAsset(actionRun: ActionRun, kind: AssetKind, assetId: string, patch: Record<string, unknown>): Promise<DomainMutationResult> {
    return this.updateRecord(actionRun, kind, "o_assets", assetId, {
      name: patch.name,
      describe: patch.description ?? patch.describe,
      prompt: patch.prompt,
      remark: patch.remark,
    }, ["name", "describe", "prompt", "remark"], this.domainFor(kind), this.assetType(kind));
  }

  private async updateRecord(
    actionRun: ActionRun,
    kind: EntityKind,
    table: string,
    rawId: string,
    inputPatch: Record<string, unknown>,
    allowed: string[],
    domain: WorkbenchDomain,
    typeValue?: string,
  ): Promise<DomainMutationResult> {
    await this.ensureSchema();
    const projectId = numericEntityId(actionRun.projectId, "project");
    const id = Number(rawId);
    const patch = Object.fromEntries(Object.entries(inputPatch).filter(([key, value]) => allowed.includes(key) && value !== undefined));
    if (!Object.keys(patch).length) throw new Error(`No supported fields supplied for ${kind} update`);
    let query = (db as any)(table).where({ id, projectId });
    if (typeValue) query = query.andWhere("type", typeValue);
    const current = await query.clone().first();
    if (!current) throw new Error(`${kind} not found: ${kind}:${rawId}`);
    const existingVersions = await artifactVersionService.list(projectId, kind, `${kind}:${id}`);
    if (!existingVersions.length) {
      await artifactVersionService.save({ projectId, artifactType: kind, artifactKey: `${kind}:${id}`, instanceId: actionRun.instanceId, content: current, provenance: { actionRunId: actionRun.id, reason: "AI 修改前基线" } });
    }
    await query.clone().update({ ...patch, updateTime: Date.now() });
    const record = await query.clone().first();
    return this.finishMutation(actionRun, kind, id, record, Object.keys(patch), domain, "update");
  }

  private async finishMutation(
    actionRun: ActionRun,
    kind: EntityKind,
    id: number,
    record: Record<string, unknown>,
    changedFields: string[],
    domain: WorkbenchDomain,
    operation: "insert" | "update",
  ): Promise<DomainMutationResult> {
    const projectId = numericEntityId(actionRun.projectId, "project");
    const version = await artifactVersionService.save({
      projectId,
      artifactType: kind,
      artifactKey: `${kind}:${id}`,
      instanceId: actionRun.instanceId,
      content: record,
      source: "harness-v3",
      provenance: {
        actionRunId: actionRun.id,
        sourceAgent: "ai-director",
        inputReferences: actionRun.contextSnapshot.selected.map(ref => String(ref.id)),
        reason: actionRun.userInstruction,
      },
    });
    const entity = { type: kind, id: entityId(kind, id), label: String((record as any).name || (record as any).title || ""), version } as ContextEntityRef;
    const uiPatch: UiPatch = {
      id: `patch-${uuid()}`,
      actionRunId: actionRun.id,
      domain,
      operation,
      target: entity,
      changes: record,
      version,
      timestamp: Date.now(),
    };
    await harnessEventBus.emitWorkbenchEvent({
      kind: operation === "insert" ? "entity.created" : "entity.updated",
      actionRunId: actionRun.id,
      instanceId: actionRun.instanceId,
      projectId: actionRun.projectId,
      entity,
      payload: { changedFields, version },
    });
    return { entity, record, changedFields, version, uiPatch };
  }

  private async linkSceneReferences(projectId: number, sceneId: number, input: any, actionRunId: string): Promise<void> {
    for (const id of input.characterIds || []) await artifactGraph.link({ projectId, sourceType: "scene", sourceId: sceneId, targetType: "character", targetId: String(id).split(":").pop()!, relation: "references", actionRunId });
    for (const id of input.propIds || []) await artifactGraph.link({ projectId, sourceType: "scene", sourceId: sceneId, targetType: "prop", targetId: String(id).split(":").pop()!, relation: "references", actionRunId });
    if (input.locationId) await artifactGraph.link({ projectId, sourceType: "scene", sourceId: sceneId, targetType: "location", targetId: String(input.locationId).split(":").pop()!, relation: "references", actionRunId });
  }

  private deserializeScene(row: any): Record<string, unknown> {
    return { ...row, characterIds: this.parse(row.characterIds, []), propIds: this.parse(row.propIds, []) };
  }

  private episodeId(actionRun: ActionRun): number {
    if (!actionRun.episodeId) throw new Error("当前操作需要选择一个剧集/剧本");
    return numericEntityId(actionRun.episodeId, "episode");
  }

  private assetType(kind: AssetKind): string {
    return kind === "character" ? "role" : kind === "prop" ? "tool" : "scene";
  }

  private domainFor(kind: AssetKind): WorkbenchDomain {
    return kind === "character" ? "characters" : kind === "prop" ? "props" : "locations";
  }

  private parse<T>(value: string | null | undefined, fallback: T): T {
    if (!value) return fallback;
    try { return JSON.parse(value) as T; } catch { return fallback; }
  }
}

export const filmDomainService = new FilmDomainService();
