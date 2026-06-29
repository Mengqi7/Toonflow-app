import express from "express";
import u from "@/utils";
const router = express.Router();
router.get("/:id/params", async (req, res) => {
  const wf = await u.db("o_comfyui_workflow").where("id", req.params.id).first();
  if (!wf) return res.status(404).json({ code: 400, message: "Not found" });
  res.json({ code: 200, data: JSON.parse(wf.parameters || "[]") });
});
export default router;
