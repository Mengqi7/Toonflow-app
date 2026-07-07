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

const router = express.Router();

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
    const result = await directorOrchestrator.handleUserMessage(req.params.id, message);
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
    const messages = directorOrchestrator.getMessages(req.params.id);
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
    const status = directorOrchestrator.getStatus(req.params.id);
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
    const graph = directorOrchestrator.getTaskGraph(req.params.id);
    if (!graph) {
      return res.status(404).json({ code: 404, message: "任务图不存在" });
    }
    res.json({ code: 200, data: { tasks: graph.getAllTasks(), stats: graph.getStats() } });
  } catch (e: any) {
    res.status(400).json({ code: 400, message: e.message });
  }
});

// 暂停 (占位)
router.post("/:id/pause", async (_req: express.Request, res: express.Response) => {
  res.json({ code: 200, data: { status: "paused" } });
});

// 恢复 (占位)
router.post("/:id/resume", async (_req: express.Request, res: express.Response) => {
  res.json({ code: 200, data: { status: "running" } });
});

// 取消 (占位)
router.post("/:id/cancel", async (_req: express.Request, res: express.Response) => {
  res.json({ code: 200, data: { status: "cancelled" } });
});

// 用户决策回复 (占位)
router.post("/:id/user-input", async (req: express.Request, res: express.Response) => {
  const { choice } = req.body;
  res.json({ code: 200, data: { acknowledged: true, choice } });
});

// 版本历史
router.get("/:id/versions/:type/:key", async (req: express.Request, res: express.Response) => {
  try {
    const { type, key } = req.params;
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

// 回滚版本
router.post("/:id/versions/:type/:key/rollback", async (req: express.Request, res: express.Response) => {
  try {
    const { type, key } = req.params;
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
