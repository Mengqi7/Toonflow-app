/**
 * 测试 / 执行 ComfyUI 工作流
 *
 * 使用 ComfyUIService 的统一执行引擎：
 * 1. 自动分析工作流
 * 2. 动态注入参数
 * 3. 提交 → 轮询 → 下载产物
 */
import express from "express";
import { success, error } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import u from "@/utils";
import { z } from "zod";
import { ComfyUIService } from "@/services/comfyui";

const router = express.Router();

export default router.post(
  "/:id/test",
  validateFields({
    prompt: z.string().optional(),
    referenceImage: z.string().optional(),
    negative: z.string().optional(),
    options: z.any().optional(),
  }),
  async (req, res) => {
    try {
      const service = new ComfyUIService(u);
      const workflowId = String(req.params.id);
      const prompt = req.body.prompt as string | undefined;
      const referenceImage = req.body.referenceImage as string | undefined;
      const negative = req.body.negative as string | undefined;
      const options = req.body.options as any;

      // 获取工作流信息
      const info = await service.getWorkflowInfo(workflowId);
      if (!info) {
        return res.status(404).json(error("工作流不存在"));
      }

      // 构建执行配置
      const config = {
        prompt,
        negativePrompt: negative,
        referenceImage,
        ...(options || {}),
      };

      // 获取进度回调（SSE 可用时）
      const onProgress = (progress: any) => {
        // 进度通过 WebSocket 或 SSE 推送，此处仅日志
      };

      // 执行工作流（提交 + 轮询等待 + 自动下载）
      const result = await service.executeById(workflowId, config, onProgress);

      if (!result.success) {
        return res.status(500).json(error(result.error || "执行失败"));
      }

      res.json(
        success({
          promptId: result.promptId,
          outputs: result.outputs?.map(o => ({
            type: o.type,
            filename: o.filename,
            dataUrl: o.dataUrl,
          })),
          duration: result.duration,
        }, "工作流执行完成")
      );
    } catch (err: any) {
      console.error("[ComfyUI] 测试工作流失败:", err);
      res.status(500).json(error(err.message));
    }
  }
);
