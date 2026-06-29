import express from "express";
import u from "@/utils";
import { WorkflowParser } from "@/comfyui";
const router = express.Router();
router.post("/", async (req, res) => {
  try {
    const { name, description, type, workflowJson, serverId } = req.body;
    const parser = new WorkflowParser();
    const wf = parser.parse(typeof workflowJson === "string" ? workflowJson : JSON.stringify(workflowJson));
    const params = parser.extractParameters(wf);
    const id = Date.now();
    await u.db("o_comfyui_workflow").insert({ id, serverId: serverId || 1, name, description: description || "", type: type || "image", workflow_json: JSON.stringify(wf), parameters: JSON.stringify(params), createdBy: "user", createTime: Date.now(), updateTime: Date.now() });
    res.json({ code: 200, data: { id, nodeCount: wf.nodes.length, paramCount: params.length } });
  } catch (e: any) { res.status(400).json({ code: 400, message: e.message }); }
});
export default router;
