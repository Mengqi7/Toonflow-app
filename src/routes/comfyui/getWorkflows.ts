import express from "express";
import u from "@/utils";
const router = express.Router();
router.get("/", async (req, res) => {
  const workflows = await u.db("o_comfyui_workflow").select("*").orderBy("updateTime", "desc");
  res.json({ code: 200, data: workflows });
});
export default router;
