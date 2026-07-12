import { db } from "@/utils/db";
import type { ActionRun, ActionRunStatus, ToolFailure, ToolCallRecord } from "../workbench/contracts";

export class ActionRunStore {
  async ensureTable(): Promise<void> {
    if (await db.schema.hasTable("o_action_run")) return;
    await db.schema.createTable("o_action_run", table => {
      table.string("id").primary();
      table.string("idempotencyKey").notNullable().unique();
      table.string("instanceId").notNullable().index();
      table.integer("projectId").notNullable().index();
      table.integer("episodeId");
      table.text("userInstruction").notNullable();
      table.text("contextSnapshot").notNullable();
      table.text("plan").notNullable();
      table.text("toolCalls").notNullable();
      table.string("status").notNullable().index();
      table.string("reviewState");
      table.text("result");
      table.text("error");
      table.integer("createdAt").notNullable();
      table.integer("updatedAt").notNullable();
    });
  }

  async create(run: ActionRun): Promise<ActionRun> {
    await this.ensureTable();
    const existing = await this.findByIdempotencyKey(run.idempotencyKey);
    if (existing) return existing;
    await db("o_action_run").insert(this.serialize(run));
    return run;
  }

  async get(id: string): Promise<ActionRun | undefined> {
    await this.ensureTable();
    const row = await db("o_action_run").where("id", id).first();
    return row ? this.deserialize(row) : undefined;
  }

  async findByIdempotencyKey(key: string): Promise<ActionRun | undefined> {
    await this.ensureTable();
    const row = await db("o_action_run").where("idempotencyKey", key).first();
    return row ? this.deserialize(row) : undefined;
  }

  async update(id: string, patch: {
    status?: ActionRunStatus;
    toolCalls?: ToolCallRecord[];
    reviewState?: ActionRun["reviewState"];
    result?: unknown;
    error?: ToolFailure | null;
  }): Promise<ActionRun> {
    await this.ensureTable();
    const values: Record<string, unknown> = { updatedAt: Date.now() };
    if (patch.status) values.status = patch.status;
    if (patch.toolCalls) values.toolCalls = JSON.stringify(patch.toolCalls);
    if (patch.reviewState) values.reviewState = patch.reviewState;
    if (patch.result !== undefined) values.result = JSON.stringify(patch.result);
    if (patch.error !== undefined) values.error = patch.error ? JSON.stringify(patch.error) : null;
    await db("o_action_run").where("id", id).update(values);
    const updated = await this.get(id);
    if (!updated) throw new Error(`ActionRun not found after update: ${id}`);
    return updated;
  }

  private serialize(run: ActionRun): Record<string, unknown> {
    return {
      id: run.id,
      idempotencyKey: run.idempotencyKey,
      instanceId: run.instanceId,
      projectId: Number(String(run.projectId).split(":")[1]),
      episodeId: run.episodeId ? Number(String(run.episodeId).split(":")[1]) : null,
      userInstruction: run.userInstruction,
      contextSnapshot: JSON.stringify(run.contextSnapshot),
      plan: JSON.stringify(run.plan),
      toolCalls: JSON.stringify(run.toolCalls),
      status: run.status,
      reviewState: run.reviewState || null,
      result: run.result === undefined ? null : JSON.stringify(run.result),
      error: run.error ? JSON.stringify(run.error) : null,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
    };
  }

  private deserialize(row: any): ActionRun {
    return {
      id: row.id,
      idempotencyKey: row.idempotencyKey,
      instanceId: row.instanceId,
      projectId: `project:${row.projectId}` as ActionRun["projectId"],
      episodeId: row.episodeId == null ? undefined : `episode:${row.episodeId}` as ActionRun["episodeId"],
      userInstruction: row.userInstruction,
      contextSnapshot: JSON.parse(row.contextSnapshot),
      plan: JSON.parse(row.plan),
      toolCalls: JSON.parse(row.toolCalls),
      status: row.status,
      reviewState: row.reviewState || undefined,
      result: row.result ? JSON.parse(row.result) : undefined,
      error: row.error ? JSON.parse(row.error) : undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

export const actionRunStore = new ActionRunStore();
