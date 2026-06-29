import express from "express";
import u from "@/utils";
import { ComfyUIClient, WorkflowParser } from "@/comfyui";
const router = express.Router();
router.post("/:id/test", async (req, res) => {
  try {
    const wf = await u.db("o_comfyui_workflow").where("id", req.params.id).first();
    if (!wf) return res.status(404).json({ code: 400, message: "Not found" });
    const server = await u.db("o_comfyui_server").where("id", wf.serverId).first();
    if (!server || !server.baseUrl) return res.status(400).json({ code: 400, message: "Server not configured" });
    const client = new ComfyUIClient({ baseUrl: server.baseUrl });
    const promptId = await client.queuePrompt(JSON.parse(wf.workflow_json || "[]"));
    res.json({ code: 200, data: { promptId, message: "Submitted" } });
  } catch (e: any) { res.status(400).json({ code: 400, message: e.message }); }
});
export default router;
