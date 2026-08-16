import express from "express";
import { success, error } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import u from "@/utils";
import { z } from "zod";

const router = express.Router();

export default router.post(
  "/",
  validateFields({
    id: z.string().optional(),
    name: z.string().min(1, "服务名称不能为空"),
    baseUrl: z.string().min(1, "服务地址不能为空"),
    enabled: z.union([z.boolean(), z.number()]).optional(),
  }),
  async (req, res) => {
    try {
      const { name, baseUrl } = req.body;
      const enabled = req.body.enabled === undefined ? true : !!req.body.enabled;
      let id = req.body.id;

      // 规范化 baseUrl：去掉末尾斜杠
      const normalizedUrl = baseUrl.replace(/\/+$/, "");

      if (id) {
        // 有 id：尝试更新，不存在则新建
        const existing = await u.db("o_comfyui_server").where("id", id).first();
        if (existing) {
          await u.db("o_comfyui_server").where("id", id).update({
            name,
            baseUrl: normalizedUrl,
            enabled,
            status: enabled ? "active" : "inactive",
            updateTime: Date.now(),
          });
        } else {
          await u.db("o_comfyui_server").insert({
            id,
            name,
            baseUrl: normalizedUrl,
            enabled,
            status: enabled ? "active" : "inactive",
            createTime: Date.now(),
          });
        }
      } else {
        // 无 id：自动生成
        id = u.uuid?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
        await u.db("o_comfyui_server").insert({
          id,
          name,
          baseUrl: normalizedUrl,
          enabled,
          status: enabled ? "active" : "inactive",
          createTime: Date.now(),
        });
      }

      const record = await u.db("o_comfyui_server").where("id", id).first();
      res.json(success(record, "保存成功"));
    } catch (err: any) {
      res.status(500).json(error(err.message));
    }
  }
);
