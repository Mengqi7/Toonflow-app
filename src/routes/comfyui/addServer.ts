import express from "express";
import u from "@/utils";
const router = express.Router();
router.post("/", async (req, res) => {
  try {
    const { name, baseUrl, wsUrl } = req.body;
    const id = Date.now();
    await u.db("o_comfyui_server").insert({ id, name, baseUrl, wsUrl: wsUrl || "", enabled: 1, createTime: Date.now() });
    res.json({ code: 200, data: { id }, message: "ComfyUI server added" });
  } catch (e: any) { res.status(400).json({ code: 400, message: e.message }); }
});
export default router;
