import express from "express";
import { success, error } from "@/lib/responseFormat";
import u from "@/utils";
import { removeWorkflowModel } from "@/services/comfyui/workflow-model-sync";

const router = express.Router();

export default router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await u.db("o_comfyui_server").where("id", id).first();
    if (!existing) return res.status(404).json(error("服务不存在"));

    // 收集将被删除的工作流 id，用于同步移除对应的虚拟模型
    const linkedWorkflows = await u.db("o_comfyui_workflow").where("serverId", id).select("id");

    await u.db("o_comfyui_server").where("id", id).del();
    // 同时删除关联的工作流
    await u.db("o_comfyui_workflow").where("serverId", id).del();

    // 同步移除对应的虚拟模型
    for (const wf of linkedWorkflows) {
      if (!wf.id) continue;
      try {
        await removeWorkflowModel(u, wf.id);
      } catch (e: any) {
        console.warn("[ComfyUI] 移除工作流模型失败:", e?.message);
      }
    }

    res.json(success(null, "删除成功"));
  } catch (err: any) {
    res.status(500).json(error(err.message));
  }
});
