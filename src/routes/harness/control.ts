/**
 * Harness V2 主控台 API
 *
 * 路由:
 * - POST /api/harness/control/start        启动 Harness 实例
 * - POST /api/harness/control/:id/message  用户对话
 * - GET  /api/harness/control/:id/messages 对话历史
 * - GET  /api/harness/control/:id/status   实例状态
 * - GET  /api/harness/control/:id/task-graph 任务图
 * - POST /api/harness/control/:id/pause    暂停
 * - POST /api/harness/control/:id/resume   恢复
 * - POST /api/harness/control/:id/cancel   取消
 * - POST /api/harness/control/:id/user-input 用户决策回复
 * - GET  /api/harness/control/:id/versions/:type/:key 版本历史
 * - POST /api/harness/control/:id/versions/:type/:key/rollback 回滚版本
 */
import express from "express";
import { harness } from "@/core/harness/init";
import { directorOrchestrator } from "@/core/harness/DirectorOrchestrator";
import { callbackBridge } from "@/core/harness/CallbackBridge";
import { harnessEventBus } from "@/core/harness/HarnessEventBus";
import { db } from "@/utils/db";

const router = express.Router();

function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] : value || "";
}

// 启动 Harness 实例
router.post("/start", async (req: express.Request, res: express.Response) => {
  try {
    const { projectId, novelText, workflowTemplate, configOverride } = req.body;
    if (!projectId) {
      return res.status(400).json({ code: 400, message: "projectId 必填" });
    }
    if (!directorOrchestrator) {
      return res.status(500).json({ code: 500, message: "DirectorOrchestrator 未初始化" });
    }
    const result = await directorOrchestrator.startFromNovel({
      projectId,
      novelText,
      workflowTemplate,
      configOverride,
    });
    res.json({ code: 200, data: result });
  } catch (e: any) {
    res.status(400).json({ code: 400, message: e.message });
  }
});

// 用户发送消息
router.post("/:id/message", async (req: express.Request, res: express.Response) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ code: 400, message: "message 必填" });
    }
    if (!directorOrchestrator) {
      return res.status(500).json({ code: 500, message: "DirectorOrchestrator 未初始化" });
    }
    const instanceId = routeParam(req.params.id);
    const result = await directorOrchestrator.handleUserMessage(instanceId, message);
    res.json({ code: 200, data: result });
  } catch (e: any) {
    res.status(400).json({ code: 400, message: e.message });
  }
});

// 获取对话历史
router.get("/:id/messages", async (req: express.Request, res: express.Response) => {
  try {
    if (!directorOrchestrator) {
      return res.status(500).json({ code: 500, message: "DirectorOrchestrator 未初始化" });
    }
    const instanceId = routeParam(req.params.id);
    const messages = directorOrchestrator.getMessages(instanceId);
    res.json({ code: 200, data: messages });
  } catch (e: any) {
    res.status(400).json({ code: 400, message: e.message });
  }
});

// 获取实例状态
router.get("/:id/status", async (req: express.Request, res: express.Response) => {
  try {
    if (!directorOrchestrator) {
      return res.status(500).json({ code: 500, message: "DirectorOrchestrator 未初始化" });
    }
    const instanceId = routeParam(req.params.id);
    const status = directorOrchestrator.getStatus(instanceId);
    if (!status) {
      return res.status(404).json({ code: 404, message: "实例不存在" });
    }
    res.json({ code: 200, data: status });
  } catch (e: any) {
    res.status(400).json({ code: 400, message: e.message });
  }
});

// 获取任务图
router.get("/:id/task-graph", async (req: express.Request, res: express.Response) => {
  try {
    if (!directorOrchestrator) {
      return res.status(500).json({ code: 500, message: "DirectorOrchestrator 未初始化" });
    }
    const instanceId = routeParam(req.params.id);
    const graph = directorOrchestrator.getTaskGraph(instanceId);
    if (!graph) {
      return res.status(404).json({ code: 404, message: "任务图不存在" });
    }
    res.json({ code: 200, data: { tasks: graph.getAllTasks(), stats: graph.getStats() } });
  } catch (e: any) {
    res.status(400).json({ code: 400, message: e.message });
  }
});

// 暂停
router.post("/:id/pause", async (req: express.Request, res: express.Response) => {
  try {
    const instanceId = routeParam(req.params.id);
    await harness.workflowRunner.pause(instanceId).catch(() => undefined);
    await harnessEventBus.emitEvent({
      kind: "director.message",
      instanceId,
      content: "Harness 实例已收到暂停请求，正在停止派发新的工位任务。",
      timestamp: Date.now(),
    } as any);
    res.json({ code: 200, data: { status: "paused" } });
  } catch (e: any) {
    res.status(400).json({ code: 400, message: e.message });
  }
});

// 恢复
router.post("/:id/resume", async (req: express.Request, res: express.Response) => {
  try {
    const instanceId = routeParam(req.params.id);
    harness.workflowRunner.resume(instanceId).catch(() => undefined);
    await harnessEventBus.emitEvent({
      kind: "director.message",
      instanceId,
      content: "Harness 实例已收到恢复请求，调度器将从已保存任务图继续推进。",
      timestamp: Date.now(),
    } as any);
    res.json({ code: 200, data: { status: "running" } });
  } catch (e: any) {
    res.status(400).json({ code: 400, message: e.message });
  }
});

// 取消
router.post("/:id/cancel", async (req: express.Request, res: express.Response) => {
  try {
    const instanceId = routeParam(req.params.id);
    await harness.workflowRunner.cancel(instanceId).catch(() => undefined);
    await harnessEventBus.emitEvent({
      kind: "harness.failed",
      instanceId,
      reason: "用户从 Harness 主控台取消实例。",
      timestamp: Date.now(),
    } as any);
    res.json({ code: 200, data: { status: "cancelled" } });
  } catch (e: any) {
    res.status(400).json({ code: 400, message: e.message });
  }
});

// 用户决策回复
router.post("/:id/user-input", async (req: express.Request, res: express.Response) => {
  try {
    const choice = req.body.choice || req.body.action;
    const taskId = req.body.taskId || "stage-gate-storyboard";
    const instanceId = routeParam(req.params.id);
    if (!choice) {
      return res.status(400).json({ code: 400, message: "choice 或 action 必填" });
    }

    await harnessEventBus.emitEvent({
      kind: "director.user_input",
      instanceId,
      action: choice,
      choice,
      taskId,
      timestamp: Date.now(),
    } as any);

    if (directorOrchestrator) {
      const resumed = await directorOrchestrator.handleUserInput(instanceId, String(choice));
      return res.json({ code: 200, data: { acknowledged: true, choice, ...resumed } });
    }

    if (String(choice).includes("approve")) {
      await harnessEventBus.emitEvent({
        kind: "director.message",
        instanceId,
        content: `人工终审已通过：${choice}。DirectorOrchestrator 将放行下游阶段。`,
        timestamp: Date.now(),
      } as any);
    } else {
      const toAgent = String(choice).includes("scene_concept") ? "lighting" : "dp";
      await harnessEventBus.emitEvent({
        kind: "review.reroute",
        taskId,
        fromAgent: "supervisor",
        toAgent,
        instanceId,
        reason: `人工终审选择 ${choice}，需要回到 ${toAgent} 工位重跑。`,
        retryInstruction: {
          action: choice,
          preserve: ["CHR-02", "SCN-04"],
          instruction: "保留已通过角色与场景约束，重写问题镜头的构图、视线和纵深提示。",
        },
        userInputRequired: false,
        timestamp: Date.now(),
      } as any);
      await harnessEventBus.emitEvent({
        kind: "task.started",
        taskId: `${taskId}-retry-${Date.now()}`,
        agentRole: toAgent,
        instanceId,
        input: { retryFrom: taskId, choice },
        timestamp: Date.now(),
      } as any);
    }

    res.json({ code: 200, data: { acknowledged: true, choice } });
  } catch (e: any) {
    res.status(400).json({ code: 400, message: e.message });
  }
});

// 版本历史
router.get("/:id/versions/:type/:key", async (req: express.Request, res: express.Response) => {
  try {
    const type = routeParam(req.params.type);
    const key = routeParam(req.params.key);
    const projectId = parseInt(req.query.projectId as string, 10);
    if (!projectId) {
      return res.status(400).json({ code: 400, message: "projectId 必填" });
    }
    const versions = await callbackBridge.listVersions(projectId, type, key);
    res.json({ code: 200, data: versions });
  } catch (e: any) {
    res.status(400).json({ code: 400, message: e.message });
  }
});

// Unified artifact warehouse for the three-layer control room.
router.get("/:id/warehouse", async (req: express.Request, res: express.Response) => {
  try {
    const projectId = Number(req.query.projectId);
    if (!projectId) return res.status(400).json({ code: 400, message: "projectId required" });
    let query = db("o_artifact_version").where("projectId", projectId).orderBy("createdAt", "desc");
    const artifactType = typeof req.query.artifactType === "string" ? req.query.artifactType : "";
    if (artifactType) query = query.where("artifactType", artifactType);
    const rows = await query.limit(100);
    res.json({ code: 200, data: rows });
  } catch (error) {
    res.status(400).json({ code: 400, message: error instanceof Error ? error.message : String(error) });
  }
});

// 回滚版本
router.post("/:id/versions/:type/:key/rollback", async (req: express.Request, res: express.Response) => {
  try {
    const type = routeParam(req.params.type);
    const key = routeParam(req.params.key);
    const { projectId, version } = req.body;
    if (!projectId || !version) {
      return res.status(400).json({ code: 400, message: "projectId 和 version 必填" });
    }
    const result = await callbackBridge.rollbackToVersion(projectId, type, key, version);
    res.json({ code: 200, data: result });
  } catch (e: any) {
    res.status(400).json({ code: 400, message: e.message });
  }
});

export default router;
