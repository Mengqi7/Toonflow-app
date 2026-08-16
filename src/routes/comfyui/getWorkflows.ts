import express from "express";
import { success, error } from "@/lib/responseFormat";
import u from "@/utils";

const router = express.Router();

export default router.get("/", async (req, res) => {
  try {
    const { serverId, type } = req.query;
    let query = u.db("o_comfyui_workflow").select("*");

    if (serverId) {
      query = query.where("serverId", serverId);
    }
    if (type) {
      query = query.where("type", type);
    }

    const list = await query.orderBy("createTime", "desc");

    // 附加前端展示所需字段（nodeCount / autoConfig / 参数摘要）
    const enriched = list.map((row: any) => {
      let nodeCount = 0;
      try {
        const analysis = row.analysis ? JSON.parse(row.analysis) : null;
        nodeCount = analysis?.totalNodes ?? 0;
      } catch {}
      return {
        ...row,
        workflowJson: undefined, // 列表不返回完整 JSON，避免响应过大
        analysis: undefined,
        schema: undefined,
        nodeCount,
        autoConfig: true,
      };
    });

    res.json(success(enriched));
  } catch (err: any) {
    res.status(500).json(error(err.message));
  }
});
