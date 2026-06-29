/**
 * Harness 引擎初始化模块 — 在 app 启动时调用
 *
 * 职责:
 * 1. 创建全局单例 (WorkflowRunner/AgentRegistry/RulesEngine/SkillsRegistry/MemoryBus/MCPConnector/ScriptExecutor)
 * 2. 自动创建缺失的数据库表 (o_workflow_state / o_review_report / o_review_preference / o_character_library / o_comfyui_server / o_comfyui_workflow / o_memory)
 * 3. YAML 工作流加载器
 * 4. AgentRegistry.scanAndRegister() → 启动时自动扫描并注册全部 Agent
 * 5. Rules/Skills/MemoryBus/ScriptExecutor 热加载初始化
 */
import { WorkflowRunner, AgentRegistry, RulesEngine, SkillsRegistry, MemoryBus, MCPConnector, ScriptExecutor } from "./index";
import type { WorkflowDefinition } from "./types";
import fs from "fs";
import path from "path";
import fg from "fast-glob";

// ── 全局单例 ────────────────────────────────────────
export const harness = {
  workflowRunner: new WorkflowRunner(),
  agentRegistry: new AgentRegistry(),
  rulesEngine: new RulesEngine(),
  skillsRegistry: new SkillsRegistry(),
  memoryBus: new MemoryBus(),
  mcpConnector: new MCPConnector(),
  scriptExecutor: new ScriptExecutor(),
  initialized: false,
};

/**
 * YAML 工作流加载器 — 从 data/workflows/*.yaml 解析 WorkflowDefinition
 */
async function loadYamlWorkflow(filePath: string): Promise<WorkflowDefinition | null> {
  try {
    const yaml = (await import("js-yaml")) as any;
    const raw = fs.readFileSync(filePath, "utf-8");
    const def = yaml.load(raw) as WorkflowDefinition;
    if (!def?.id || !Array.isArray(def.nodes)) {
      console.warn(`[Harness] Invalid workflow: ${filePath}`);
      return null;
    }
    // 补齐默认值
    if (!def.version) def.version = "1.0";
    if (!def.config) def.config = {};
    for (const node of def.nodes) {
      if (!node.config?.timeoutMs) node.config = { ...node.config, timeoutMs: 300000 };
      if (!node.config?.retry) node.config = { ...node.config, retry: { maxRetries: 2, backoffMs: 10000, backoffMultiplier: 2, retryableErrors: [] } as any };
    }
    return def;
  } catch (err) {
    console.warn(`[Harness] Failed to load workflow ${filePath}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * 自动创建缺失的数据库表
 */
async function ensureTables(): Promise<void> {
  try {
    const { db } = await import("@/utils/db");
    // @ts-ignore - raw knex access
    const knex = db.client;

    const tables: Record<string, string> = {
      o_workflow_state: `
        CREATE TABLE IF NOT EXISTS o_workflow_state (
          id TEXT PRIMARY KEY,
          definitionId TEXT NOT NULL,
          status TEXT DEFAULT 'pending',
          nodeStates TEXT NOT NULL DEFAULT '{}',
          contextRefs TEXT DEFAULT '{}',
          projectId INTEGER, userId INTEGER,
          startedAt INTEGER, completedAt INTEGER
        )`,
      o_review_report: `
        CREATE TABLE IF NOT EXISTS o_review_report (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          instanceId TEXT NOT NULL,
          nodeId TEXT NOT NULL,
          score TEXT NOT NULL,
          passed INTEGER DEFAULT 0,
          feedback TEXT,
          createdAt INTEGER
        )`,
      o_review_preference: `
        CREATE TABLE IF NOT EXISTS o_review_preference (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          projectId INTEGER,
          agentId TEXT,
          weights TEXT NOT NULL DEFAULT '{}',
          thresholds TEXT NOT NULL DEFAULT '{}',
          createdAt INTEGER, updatedAt INTEGER
        )`,
      o_character_library: `
        CREATE TABLE IF NOT EXISTS o_character_library (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          projectId INTEGER REFERENCES o_project(id),
          characterName TEXT NOT NULL,
          description TEXT, referenceImage TEXT, outfitStyle TEXT,
          hairStyle TEXT, accessories TEXT,
          embedding BLOB,
          createTime INTEGER, updateTime INTEGER
        )`,
      o_comfyui_server: `
        CREATE TABLE IF NOT EXISTS o_comfyui_server (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          baseUrl TEXT NOT NULL,
          wsUrl TEXT,
          enabled INTEGER DEFAULT 1,
          createTime INTEGER
        )`,
      o_comfyui_workflow: `
        CREATE TABLE IF NOT EXISTS o_comfyui_workflow (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          serverId INTEGER REFERENCES o_comfyui_server(id),
          name TEXT NOT NULL, description TEXT,
          type TEXT, -- image | video | both
          workflow_json TEXT NOT NULL,
          parameters TEXT,
          thumbnail TEXT,
          createdBy TEXT DEFAULT 'user',
          createTime INTEGER, updateTime INTEGER
        )`,
      o_memory: `
        CREATE TABLE IF NOT EXISTS o_memory (
          id TEXT PRIMARY KEY,
          namespace TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT NOT NULL,
          type TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          ttl INTEGER,
          embedding BLOB
        )
        CREATE INDEX IF NOT EXISTS idx_memory_ns ON o_memory(namespace)
        CREATE INDEX IF NOT EXISTS idx_memory_type ON o_memory(type)`,
    };

    for (const [tableName, ddl] of Object.entries(tables)) {
      // @ts-ignore
      const exists = await knex.raw(`SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`);
      if (!exists || !exists.length) {
        // @ts-ignore
        await knex.raw(ddl);
        console.log(`[Harness] Table created: ${tableName}`);
      }
    }
  } catch (err) {
    console.warn("[Harness] ensureTables skipped (DB may not be ready):", err instanceof Error ? err.message : err);
    // Non-fatal: DB might be initialized separately; init continues
  }
}

/**
 * 初始化 Harness 引擎 — 主入口
 */
export async function initHarness(): Promise<void> {
  if (harness.initialized) return;
  console.log("[Harness] Initializing...");

  // P0: 确保数据库表存在
  await ensureTables();

  // 1. MemoryBus
  await harness.memoryBus.init();

  // 2. RulesEngine (热加载 rules/*.md)
  try {
    await harness.rulesEngine.loadRules();
    harness.rulesEngine.watchRules();
    console.log(`[Harness] Rules loaded: ${harness.rulesEngine.listAll().length} rules`);
  } catch (err) {
    console.warn("[Harness] Rules init skipped:", err instanceof Error ? err.message : err);
  }

  // 3. SkillsRegistry (热加载 skills/*.md)
  try {
    await harness.skillsRegistry.scanSkills();
    harness.skillsRegistry.watchSkills();
    console.log(`[Harness] Skills loaded: ${harness.skillsRegistry.listAll().length} skills`);
  } catch (err) {
    console.warn("[Harness] Skills init skipped:", err instanceof Error ? err.message : err);
  }

  // 4. ScriptExecutor (加载 scripts/*.js)
  await harness.scriptExecutor.loadBuiltinScripts();

  // P0: AgentRegistry — 扫描并注册全部 Agent
  await harness.agentRegistry.scanAndRegister();
  const agentList = harness.agentRegistry.listAll();
  console.log(`[Harness] Registered ${agentList.length} agents:`);
  for (const a of agentList) {
    console.log(`  - ${a.id} (${a.name}) [${a.capabilities.join(", ")}]`);
  }

  // 5. WorkflowRunner — 注入 AgentRegistry 并加载 YAML 工作流
  harness.workflowRunner.setAgentRegistry(harness.agentRegistry);

  const wfDir = path.resolve("data/workflows");
  if (fs.existsSync(wfDir)) {
    const wfFiles = await fg(["data/workflows/**/*.yaml", "data/workflows/**/*.yml"]);
    for (const file of wfFiles) {
      const def = await loadYamlWorkflow(file);
      if (def) {
        await harness.workflowRunner.registerWorkflow(def);
        console.log(`[Harness] Workflow loaded: ${def.id} (${def.nodes.length} nodes)`);
      }
    }
  } else {
    console.warn("[Harness] data/workflows/ not found — creating...");
    fs.mkdirSync(wfDir, { recursive: true });
  }

  harness.initialized = true;
  console.log(`[Harness] ✅ Initialization complete (${agentList.length} agents, ${harness.workflowRunner.getDefinitions().size} workflows)`);
}

/**
 * 暴露全局单例给其他模块使用
 */
export function getHarness(): typeof harness {
  if (!harness.initialized) {
    console.warn("[Harness] Used before init! Calling initHarness()...");
    initHarness();
  }
  return harness;
}
