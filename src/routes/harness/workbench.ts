import express from "express";
import { z } from "zod";
import { directorOrchestrator } from "@/core/harness/DirectorOrchestrator";
import { actionRunStore } from "@/core/harness/tools/ActionRunStore";
import {
  workbenchContextResolver,
  workbenchToolRegistry,
  workbenchToolRuntime,
} from "@/core/harness/workbench";

const router = express.Router();

const entityRefSchema = z.object({
  type: z.enum(["project", "episode", "script", "beat", "scene", "shot", "character", "prop", "location", "artifact"]),
  id: z.union([z.string(), z.number()]),
  label: z.string().optional(),
});

const contextSchema = z.object({
  route: z.string().min(1),
  domain: z.enum(["script", "beats", "scenes", "characters", "props", "locations", "storyboard", "video", "assets"]),
  projectId: z.union([z.string(), z.number()]),
  episodeId: z.union([z.string(), z.number()]).optional(),
  selected: z.array(entityRefSchema).optional(),
  visible: z.array(entityRefSchema).optional(),
  maxTokens: z.number().int().positive().optional(),
});

router.post("/context", async (req, res) => {
  try {
    const input = contextSchema.parse(req.body);
    res.json({ code: 200, data: await workbenchContextResolver.resolve(input) });
  } catch (error) {
    res.status(400).json({ code: 400, message: error instanceof Error ? error.message : String(error) });
  }
});

router.get("/tools", (_req, res) => {
  res.json({ code: 200, data: workbenchToolRegistry.list() });
});

router.post("/:instanceId/instructions", async (req, res) => {
  try {
    if (!directorOrchestrator) return res.status(503).json({ code: 503, message: "DirectorOrchestrator 未初始化" });
    const body = z.object({
      message: z.string().min(1),
      context: contextSchema,
      confirmed: z.boolean().optional(),
    }).parse(req.body);
    const result = await directorOrchestrator.handleWorkbenchInstruction(
      req.params.instanceId,
      body.message,
      body.context,
      body.confirmed,
    );
    res.json({ code: 200, data: result });
  } catch (error) {
    res.status(400).json({ code: 400, message: error instanceof Error ? error.message : String(error) });
  }
});

router.get("/actions/:actionRunId", async (req, res) => {
  const run = await actionRunStore.get(req.params.actionRunId);
  if (!run) return res.status(404).json({ code: 404, message: "ActionRun 不存在" });
  res.json({ code: 200, data: run });
});

router.post("/actions/:actionRunId/retry", async (req, res) => {
  try {
    res.json({ code: 200, data: await workbenchToolRuntime.retry(req.params.actionRunId) });
  } catch (error) {
    res.status(400).json({ code: 400, message: error instanceof Error ? error.message : String(error) });
  }
});

router.post("/actions/:actionRunId/confirm", async (req, res) => {
  try {
    res.json({ code: 200, data: await workbenchToolRuntime.confirm(req.params.actionRunId) });
  } catch (error) {
    res.status(400).json({ code: 400, message: error instanceof Error ? error.message : String(error) });
  }
});

router.post("/actions/:actionRunId/cancel", async (req, res) => {
  const cancelled = await workbenchToolRuntime.cancel(req.params.actionRunId);
  res.status(cancelled ? 200 : 409).json({ code: cancelled ? 200 : 409, data: { cancelled } });
});

export default router;
