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
import { TemplateLibrary } from "../../../toonflow-comfyui-agent/src/TemplateLibrary";
import type { Template } from "../../../toonflow-comfyui-agent/src/TemplateLibrary";
import { ReviewPipeline } from "../../review/ReviewPipeline";
import { HarnessEventBus, harnessEventBus } from "./HarnessEventBus";
import { Hooks } from "./Hooks";
import { initDirectorOrchestrator } from "./DirectorOrchestrator";

// ── 全局单例 ────────────────────────────────────────
export const harness = {
  workflowRunner: new WorkflowRunner(),
  agentRegistry: new AgentRegistry(),
  rulesEngine: new RulesEngine(),
  skillsRegistry: new SkillsRegistry(),
  memoryBus: new MemoryBus(),
  mcpConnector: new MCPConnector(),
  scriptExecutor: new ScriptExecutor(),
  eventBus: harnessEventBus,
  hooks: new Hooks(),
  directorOrchestrator: null as any,
  reviewPipeline: null as ReviewPipeline | null,
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
 * P0-4: ComfyUI 模板自动导入 — 启动时将内置模板写入 o_comfyui_workflow 表
 * 从此用户无需手动导入工作流即可使用 ComfyUI 生图/生视频
 */
async function seedComfyUITemplates(): Promise<void> {
  try {
    const { db } = await import("@/utils/db");
    // db 本身就是 knex 查询函数 (src/utils/db.ts:47 export { db })
    const knex = db;

    const lib = new TemplateLibrary();
    const templates = lib.listAll();
    let count = 0;

    for (const tpl of templates) {
      // 检查模板是否已存在（按 name + type 去重）
      const existing = await knex("o_comfyui_workflow")
        .where({ name: tpl.name, type: tpl.category })
        .first();

      if (existing) continue;

      // 提取 workflow JSON 中可配置参数（{{xxx}} 模式）
      const params = extractWorkflowParams(tpl);

      const now = Date.now();
      await knex("o_comfyui_workflow").insert({
        name: tpl.name,
        description: tpl.description,
        type: tpl.category,
        workflow_json: JSON.stringify(tpl.workflow),
        parameters: JSON.stringify(params),
        createdBy: "system",
        createTime: now,
        updateTime: now,
      });
      count++;
    }

    console.log(`[Harness] ComfyUI templates seeded: ${count} new (total: ${templates.length})`);
  } catch (err) {
    console.warn("[Harness] ComfyUI template seeding skipped:", err instanceof Error ? err.message : err);
  }
}

/**
 * 从模板中提取可配置参数
 * 遍历所有 node 的 widgets_values，提取 {{paramName}} 模式
 */
function extractWorkflowParams(tpl: Template): Array<{ name: string; default: string; nodeId: number }> {
  const params: Array<{ name: string; default: string; nodeId: number }> = [];
  const seen = new Set<string>();

  for (const node of tpl.workflow.nodes) {
    if (!Array.isArray(node.widgets_values)) continue;
    // 将 widgets_values 转为字符串扫描 {{...}}
    const str = JSON.stringify(node.widgets_values);
    const re = /\{\{(\w+)\}\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(str)) !== null) {
      const name = m[1];
      if (!seen.has(name)) {
        seen.add(name);
        params.push({ name, default: "", nodeId: node.id });
      }
    }
  }

  return params;
}

/**
 * 自动创建缺失的数据库表
 */
async function ensureTables(): Promise<void> {
  try {
    const { db } = await import("@/utils/db");
    const knex = db;  // db 本身就是 knex 实例

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
      o_artifact_version: `
        CREATE TABLE IF NOT EXISTS o_artifact_version (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          artifactType TEXT NOT NULL,
          artifactKey TEXT NOT NULL,
          projectId INTEGER NOT NULL,
          instanceId TEXT NOT NULL,
          version INTEGER NOT NULL,
          content TEXT,
          filePath TEXT,
          reviewScore TEXT,
          reviewFeedback TEXT,
          source TEXT DEFAULT 'harness',
          createdAt INTEGER NOT NULL,
          UNIQUE(artifactType, artifactKey, projectId, version)
        )
        CREATE INDEX IF NOT EXISTS idx_artifact_version_key ON o_artifact_version(artifactType, artifactKey, projectId)`,
      o_scene_library: `
        CREATE TABLE IF NOT EXISTS o_scene_library (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          projectId INTEGER,
          sceneName TEXT NOT NULL,
          lightingSpec TEXT,
          artDirection TEXT,
          source TEXT DEFAULT 'manual',
          instanceId TEXT,
          createTime INTEGER, updateTime INTEGER
        )`,
      o_prop_library: `
        CREATE TABLE IF NOT EXISTS o_prop_library (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          projectId INTEGER,
          type TEXT NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          source TEXT DEFAULT 'manual',
          instanceId TEXT,
          createTime INTEGER
        )`,
    };

    for (const [tableName, ddl] of Object.entries(tables)) {
      const exists = await knex.raw(`SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`);
      if (!exists || !exists.length) {
        // 分割多条 SQL 语句 (SQLite 不支持一个 raw() 中执行多条)
        const statements = ddl.split(/(?<=\))\s+(?=CREATE)/).map(s => s.trim()).filter(Boolean);
        for (const stmt of statements) {
          await knex.raw(stmt);
        }
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

  // P0-4: ComfyUI 模板自动导入
  await seedComfyUITemplates();

  // 1. MemoryBus
  await harness.memoryBus.init();

  // 1.5 EventBus 注入 MemoryBus (用于事件持久化与 SSE 重放)
  harness.eventBus.setMemoryBus(harness.memoryBus);

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

  // 5. WorkflowRunner — 注入 AgentRegistry + harness 全局单例 + 加载 YAML 工作流
  harness.workflowRunner.setAgentRegistry(harness.agentRegistry);
  // P0-2 fix: 注入全局单例，确保 Agent 间共享记忆/规则/技能/MCP
  harness.workflowRunner.setHarnessDeps({
    memoryBus: harness.memoryBus,
    rulesEngine: harness.rulesEngine,
    skillsRegistry: harness.skillsRegistry,
    mcpConnector: harness.mcpConnector,
    scriptExecutor: harness.scriptExecutor,
  });

  // P1-3: 初始化共享 ReviewPipeline (注入 RulesEngine + MemoryBus)
  const reviewPipeline = new ReviewPipeline({
    rulesEngine: harness.rulesEngine,
    memoryBus: harness.memoryBus,
  });
  // @ts-ignore - 注入私有静态字段
  harness.workflowRunner.constructor.initReviewPipeline(reviewPipeline);
  harness.reviewPipeline = reviewPipeline;
  console.log(`[Harness] ReviewPipeline initialized`);

  // V2: 初始化 DirectorOrchestrator (导演 Agent 调度器)
  harness.directorOrchestrator = initDirectorOrchestrator({
    agentRegistry: harness.agentRegistry,
    memoryBus: harness.memoryBus,
    rulesEngine: harness.rulesEngine,
    skillsRegistry: harness.skillsRegistry,
    mcpConnector: harness.mcpConnector,
    workflowRunner: harness.workflowRunner,
  });
  console.log(`[Harness] DirectorOrchestrator initialized`);

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
