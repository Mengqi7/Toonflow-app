import { v4 as uuid } from "uuid";
import type { MemoryNamespace, MemoryEntry, MemoryQuery } from "./types";
import { db } from "@/utils/db";

export class MemoryBus {
  private cache = new Map<string, MemoryEntry[]>();
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    await this.createTable();
    this.initialized = true;
  }

  private async createTable(): Promise<void> {
    const hasTable = await db.schema.hasTable("o_memory");
    if (!hasTable) {
      await db.schema.createTable("o_memory", table => {
        table.string("id").primary();
        table.string("namespace").notNullable().index();
        table.string("key").notNullable();
        table.text("value").notNullable();
        table.string("type").notNullable().index();
        table.integer("timestamp").notNullable();
        table.integer("ttl");
        table.binary("embedding");
      });
    }
  }

  async set(entry: Omit<MemoryEntry, "id" | "timestamp">): Promise<string> {
    await this.init();
    const id = uuid();
    const full: MemoryEntry = { ...entry, id, timestamp: Date.now() };
    await db("o_memory").insert({
      id, namespace: full.namespace, key: full.key,
      value: typeof full.value === "string" ? full.value : JSON.stringify(full.value),
      type: full.type, timestamp: full.timestamp, ttl: full.ttl,
      embedding: full.embedding ? Buffer.from(new Float32Array(full.embedding).buffer) : null,
    });
    const nsKey = full.namespace as string;
    const cached = this.cache.get(nsKey) || [];
    cached.push(full);
    this.cache.set(nsKey, cached.slice(-100));
    return id;
  }

  /**
   * P1-3 基础 / P1-4 基础: 记录事件到 MemoryBus
   * 用于 ReviewPipeline 记录审核历史
   */
  async recordEvent(namespace: string, key: string, value: any): Promise<string> {
    return this.set({
      namespace,
      key,
      value: typeof value === "string" ? value : JSON.stringify(value),
      type: "event",
    });
  }

  async get(query: MemoryQuery): Promise<MemoryEntry[]> {
    await this.init();
    let q = db("o_memory");
    if (query.namespaces?.length) q = q.whereIn("namespace", query.namespaces as string[]);
    if (query.keys?.length) q = q.whereIn("key", query.keys);
    if (query.type) q = q.where("type", query.type);
    if (query.limit) q = q.limit(query.limit);
    q = q.orderBy("timestamp", "desc");
    const rows = await q;
    return rows.map((r: any) => ({
      id: r.id, namespace: r.namespace, key: r.key,
      value: this.tryParse(r.value), type: r.type,
      timestamp: r.timestamp, ttl: r.ttl,
    }));
  }

  async getAgentContext(agentId: string, projectId: number): Promise<string> {
    const entries = await this.get({
      namespaces: [`agent:${agentId}`, `project:${projectId}`, "system"],
      limit: 50,
    });
    return entries.map(e => `[${e.type}] ${e.key}: ${typeof e.value === "string" ? e.value : JSON.stringify(e.value)}`).join("\n");
  }

  async semanticSearch(query: string, namespace: MemoryNamespace, limit = 5): Promise<MemoryEntry[]> {
    // Placeholder: 返回最近的条目。实际 RAG 需要调用 embedding 模型。
    return this.get({ namespaces: [namespace], limit });
  }

  async summarize(namespace: MemoryNamespace): Promise<string> {
    const entries = await this.get({ namespaces: [namespace], type: "long-term", limit: 20 });
    return entries.map(e => `${e.key}: ${typeof e.value === "string" ? e.value.slice(0, 200) : JSON.stringify(e.value).slice(0, 200)}`).join("\n---\n");
  }

  async cleanup(): Promise<void> {
    const now = Date.now();
    await db("o_memory").where("ttl", "<", now).whereNotNull("ttl").del();
  }

  private tryParse(v: string): any {
    try { return JSON.parse(v); } catch { return v; }
  }
}
