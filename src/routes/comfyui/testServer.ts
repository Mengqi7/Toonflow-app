import express from "express";
import { success, error } from "@/lib/responseFormat";
import u from "@/utils";

const router = express.Router();

export default router.post("/:id/test", async (req, res) => {
  try {
    const server = await u.db("o_comfyui_server").where("id", req.params.id).first();
    if (!server) return res.status(404).json(error("服务不存在"));

    const { baseUrl } = server;

    // 尝试调用 ComfyUI 的 /system_stats 或 /queue 端点检测连接
    const checkEndpoints = [
      `${baseUrl}/system_stats`,
      `${baseUrl}/prompt`, // 如果 system_stats 不存在，测试 prompt 端点
      `${baseUrl}/queue`,
    ];

    let connected = false;
    let errorMsg = "";

    for (const endpoint of checkEndpoints) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        const response = await fetch(endpoint, {
          method: "GET",
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        clearTimeout(timeout);

        if (response.ok || response.status === 405) {
          // 405 Method Not Allowed 也算连接成功（比如 /prompt 只支持 POST）
          connected = true;
          break;
        }
      } catch (fetchErr: any) {
        errorMsg = fetchErr.message || "连接失败";
        // 继续尝试下一个端点
      }
    }

    if (connected) {
      // 自动更新状态
      await u.db("o_comfyui_server").where("id", server.id).update({
        status: "connected",
        lastCheckTime: Date.now(),
      });
      res.json(success({ connected: true }, "连接成功"));
    } else {
      await u.db("o_comfyui_server").where("id", server.id).update({
        status: "disconnected",
        lastCheckTime: Date.now(),
      });
      res.json(success({ connected: false, error: errorMsg }, "连接失败"));
    }
  } catch (err: any) {
    res.status(500).json(error(err.message));
  }
});
