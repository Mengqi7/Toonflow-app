import { db } from "@/utils/db";
import type { GenerationJobStatus, GenerationRequest, ProviderOperation } from "./types";

export interface GenerationJob {
  id: string;
  providerId: string;
  operationId?: string;
  request: GenerationRequest;
  status: GenerationJobStatus;
  progress: number;
  result?: ProviderOperation["result"];
  error?: ProviderOperation["error"];
  createdAt: number;
  updatedAt: number;
}

export class GenerationJobStore {
  async ensureTable(): Promise<void> {
    if (await db.schema.hasTable("o_generation_job")) return;
    await db.schema.createTable("o_generation_job", table => {
      table.string("id").primary();
      table.integer("projectId").notNullable().index();
      table.string("actionRunId").notNullable().index();
      table.string("providerId").notNullable();
      table.string("operationId").index();
      table.string("capability").notNullable();
      table.text("request").notNullable();
      table.string("status").notNullable().index();
      table.float("progress").notNullable().defaultTo(0);
      table.text("result");
      table.text("error");
      table.integer("createdAt").notNullable();
      table.integer("updatedAt").notNullable();
    });
  }

  async save(job: GenerationJob): Promise<void> {
    await this.ensureTable();
    const row = {
      id: job.id,
      projectId: job.request.projectId,
      actionRunId: job.request.actionRunId,
      providerId: job.providerId,
      operationId: job.operationId || null,
      capability: job.request.capability,
      request: JSON.stringify(job.request),
      status: job.status,
      progress: job.progress,
      result: job.result ? JSON.stringify(job.result) : null,
      error: job.error ? JSON.stringify(job.error) : null,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
    const existing = await db("o_generation_job").where("id", job.id).first();
    if (existing) await db("o_generation_job").where("id", job.id).update(row);
    else await db("o_generation_job").insert(row);
  }

  async get(id: string): Promise<GenerationJob | undefined> {
    await this.ensureTable();
    const row = await db("o_generation_job").where("id", id).first();
    if (!row) return undefined;
    return {
      id: row.id,
      providerId: row.providerId,
      operationId: row.operationId || undefined,
      request: JSON.parse(row.request),
      status: row.status,
      progress: row.progress,
      result: row.result ? JSON.parse(row.result) : undefined,
      error: row.error ? JSON.parse(row.error) : undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
