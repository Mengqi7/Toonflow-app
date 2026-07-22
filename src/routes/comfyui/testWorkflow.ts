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

router.get("/:id/diagnose", async (req, res) => {
  try {
    const wf = await u.db("o_comfyui_workflow").where("id", req.params.id).first();
    if (!wf) return res.status(404).json({ code: 404, message: "Not found" });
    const server = await u.db("o_comfyui_server").where("id", wf.serverId).first();
    if (!server?.baseUrl) return res.status(400).json({ code: 400, message: "Server not configured" });
    const parser = new WorkflowParser();
    const workflow = parser.parse(wf.workflow_json || "{}");
    const refs = parser.getModelReferences(workflow);
    const objectInfo = await new ComfyUIClient({ baseUrl: server.baseUrl }).getObjectInfo();
    const missingNodes = [...new Set((workflow.nodes || []).map(node => node.type).filter(type => !objectInfo[type]))];
    res.json({ code: 200, data: { valid: missingNodes.length === 0, modelReferences: refs, missingNodes, suggestions: missingNodes.map(node => `Install or enable the ComfyUI custom node: ${node}`) } });
  } catch (error) {
    res.status(400).json({ code: 400, message: error instanceof Error ? error.message : String(error) });
  }
});
export default router;
