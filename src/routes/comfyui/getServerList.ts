import express from "express";
import { success, error } from "@/lib/responseFormat";
import u from "@/utils";

const router = express.Router();

export default router.get("/", async (req, res) => {
  try {
    const list = await u.db("o_comfyui_server").select("*").orderBy("createTime", "desc");
    res.json(success(list));
  } catch (err: any) {
    res.status(500).json(error(err.message));
  }
});
