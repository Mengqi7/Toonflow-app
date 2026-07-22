 import express from "express";
 import { v4 as uuid } from "uuid";
 import { harness } from "@/core/harness/init";
 import type { WorkflowInstance } from "@/core/harness/types";
import { db } from "@/utils/db";
import Ai from "@/utils/ai";
import { WorkflowGenerator } from "../../../toonflow-comfyui-agent/src/WorkflowGenerator";

const router = express.Router();

router.post("/workflow/generate", async (req, res) => {
  try {
    const description = String(req.body.description || "").trim();
    if (!description) return res.status(400).json({ code: 400, message: "description required" });
    const generator = new WorkflowGenerator();
    const workflow = await generator.generate(description, req.body.template, async prompt => (await Ai.Text("universalAi", false, 0).invoke({ messages: [{ role: "user", content: prompt }] })).text);
    const type = req.body.type === "video" ? "video" : "image";
    const now = Date.now();
    const [id] = await db("o_comfyui_workflow").insert({ name: String(req.body.name || description.slice(0, 80)), description, type, workflow_json: JSON.stringify(workflow), parameters: "[]", createdBy: "agent", createTime: now, updateTime: now });
    res.json({ code: 200, data: { id, type, workflow } });
  } catch (error) {
    res.status(400).json({ code: 400, message: error instanceof Error ? error.message : String(error) });
  }
});

// Start the default film workflow directly from the project's persisted novel.
router.post("/workflow/start-from-novel", async (req, res) => {
  try {
    const projectId = Number(req.body.projectId);
    if (!Number.isFinite(projectId) || projectId <= 0) return res.status(400).json({ code: 400, message: "projectId required" });
    const definitionId = String(req.body.workflowTemplate || "film-production");
    if (!harness.workflowRunner.getDefinitions().has(definitionId)) return res.status(404).json({ code: 404, message: `Workflow '${definitionId}' not found` });
    const rows = await db("o_novel").where({ projectId }).orderBy("chapterIndex", "asc");
    const novel = String(req.body.novelText || rows.map((row: any) => row.chapterData || row.content || "").filter(Boolean).join("\n\n")).trim();
    if (!novel) return res.status(400).json({ code: 400, message: "No novel content found for project" });
    const instance: WorkflowInstance = {
      id: uuid(), definitionId, status: "pending", nodeStates: new Map(), startedAt: Date.now(),
      context: { data: new Map([["screenwriter.analyze", { novel, stage: "analyze" }]]), projectId, userId: (req as any).user?.id || 1, config: { ...req.body.configOverride, novel } },
    };
    res.json({ code: 200, data: { instanceId: instance.id, definitionId, status: "pending", novelLength: novel.length } });
    void harness.workflowRunner.execute(instance).catch(async error => {
      console.error(`[Harness] start-from-novel ${instance.id} failed:`, error);
      instance.status = "failed";
      await harness.workflowRunner.saveInstanceState(instance);
    });
  } catch (error) {
    res.status(400).json({ code: 400, message: error instanceof Error ? error.message : String(error) });
  }
});

// 启动工作流
router.post("/workflow/start", async (req, res) => {
  try {
    const { workflowId, projectId } = req.body;
    if (!workflowId) return res.status(400).json({ code: 400, message: "workflowId required" });
    const userId = (req as any).user?.id || 1;
    const project = projectId || 0;

    const instance: WorkflowInstance = {
      id: uuid(),
      definitionId: workflowId,
      status: "pending",
      nodeStates: new Map(),
      context: {
        data: new Map(),
        projectId: project,
        userId,
        config: req.body.config || {},
      },
      startedAt: Date.now(),
    };

    // 注入 novel 数据到 context (screenwriter.analyze 会读取)
    if (req.body.novel) {
      instance.context.data.set("screenwriter.analyze", { novelAnalysis: null, novel: req.body.novel, stage: "analyze" });
      // 同时注入到根级别供第一个节点作为 fallback
      instance.context.config = { ...instance.context.config, novel: req.body.novel };
    }

    res.json({ code: 200, data: { instanceId: instance.id, status: "pending" } });

    // 异步执行（不阻塞响应）
    harness.workflowRunner.execute(instance).then(async (result) => {
      console.log(`[Harness] Workflow ${instance.id} completed: ${result.status}`);
      await harness.workflowRunner.saveInstanceState(instance);
    }).catch(async (err) => {
      console.error(`[Harness] Workflow ${instance.id} failed:`, err);
      instance.status = "failed";
      await harness.workflowRunner.saveInstanceState(instance);
    });
  } catch (e: any) {
    res.status(400).json({ code: 400, message: e.message });
  }
});

// 查询工作流状态
router.get("/workflow/:id/status", async (req, res) => {
  try {
    // 先查内存
    const inst = await harness.workflowRunner.loadInstanceState(req.params.id);
    if (!inst) return res.status(404).json({ code: 404, message: "Instance not found" });

    const nodeStates: Record<string, string> = {};
    inst.nodeStates.forEach((v, k) => { nodeStates[k] = v; });

    res.json({
      code: 200,
      data: {
        id: inst.id, definitionId: inst.definitionId, status: inst.status,
        nodeStates, startedAt: inst.startedAt, completedAt: inst.completedAt,
      },
    });
  } catch (e: any) {
    res.status(400).json({ code: 400, message: e.message });
  }
});

// 暂停工作流
router.post("/workflow/:id/pause", async (req, res) => {
  try {
    await harness.workflowRunner.pause(req.params.id);
    res.json({ code: 200, data: { status: "paused" } });
  } catch (e: any) {
    res.status(400).json({ code: 400, message: e.message });
  }
});

// 恢复工作流
router.post("/workflow/:id/resume", async (req, res) => {
  try {
    await harness.workflowRunner.resume(req.params.id);
    res.json({ code: 200, data: { status: "running" } });
  } catch (e: any) {
    res.status(400).json({ code: 400, message: e.message });
  }
});

// 取消工作流
router.post("/workflow/:id/cancel", async (req, res) => {
  try {
    await harness.workflowRunner.cancel(req.params.id);
    res.json({ code: 200, data: { status: "cancelled" } });
  } catch (e: any) {
    res.status(400).json({ code: 400, message: e.message });
  }
});

// 列出可用工作流模板
router.get("/workflows", async (_req, res) => {
  try {
    // 从注册的 workflow definitions 中获取
    const defs = harness.workflowRunner.getDefinitions();
    const workflows: any[] = [];
    if (defs) {
      for (const [id, def] of defs) {
        workflows.push({ id, version: def.version, nodeCount: def.nodes?.length });
      }
    }
    res.json({ code: 200, data: workflows });
  } catch (e: any) {
    res.status(400).json({ code: 400, message: e.message });
  }
});

// 列出已注册 Agent
router.get("/agents", async (_req, res) => {
  try {
    const agents = harness.agentRegistry.listAll().map(a => ({
      id: a.id, name: a.name, role: a.role, capabilities: a.capabilities, version: a.version,
      contract: harness.agentRegistry.getContract(a.id),
    }));
    res.json({ code: 200, data: agents });
  } catch (e: any) {
    res.status(400).json({ code: 400, message: e.message });
  }
});

router.get("/agents/:id/contract", async (req, res) => {
  try {
    res.json({ code: 200, data: harness.agentRegistry.getContract(req.params.id) });
  } catch (error) {
    res.status(404).json({ code: 404, message: error instanceof Error ? error.message : String(error) });
  }
});


// 获取工作流定义详情 (供前端DAG渲染)
router.get("/workflow/:id/definition", async (req: any, res: any) => {
  try {
    const defs = harness.workflowRunner.getDefinitions();
    const def = defs.get(req.params.id);
    if (!def) return res.status(404).json({ code: 404, message: "Workflow definition not found" });
    res.json({
      code: 200,
      data: {
        id: def.id, version: def.version,
        nodes: def.nodes.map((n: any) => ({
          id: n.id, type: n.type, agentRole: n.agentRole,
          config: { timeoutMs: n.config.timeoutMs, parallelDegree: n.config.parallelDegree },
          outputKeys: n.output?.keys || [],
        })),
        edges: def.edges.map((e: any) => ({ from: e.from, to: e.to })),
      },
    });
  } catch (e: any) {
    res.status(400).json({ code: 400, message: e.message });
  }
});

// 获取实例列表 (从 DB 读取 ALL instances)
router.get("/instances", async (_req, res) => {
  try {
    const rows = await db("o_workflow_state").orderBy("startedAt", "desc").limit(50);
    const list = rows.map((row: any) => ({
      id: row.id,
      definitionId: row.definitionId,
      status: row.status,
      nodeStates: row.nodeStates ? JSON.parse(row.nodeStates) : {},
      startedAt: row.startedAt,
      completedAt: row.completedAt,
    }));
    res.json({ code: 200, data: list });
  } catch (e: any) {
    res.json({ code: 200, data: [] });
  }
});

export default router;
