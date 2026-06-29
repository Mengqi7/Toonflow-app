import express from "express";
import u from "@/utils";
const router = express.Router();
router.get("/", async (req, res) => {
  const servers = await u.db("o_comfyui_server").select("*");
  res.json({ code: 200, data: servers });
});
export default router;
