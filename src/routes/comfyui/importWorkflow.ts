/**
 * 导入 ComfyUI 工作流
 *
 * 使用 ComfyUIService 的智能分析引擎，自动识别工作流中的所有节点类型、
 * 可注入参数和输出结构。用户只需导入 JSON，无需手动配置。
 */
import express from "express";
import { success, error } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import u from "@/utils";
import { z } from "zod";
import { ComfyUIService, getAnalysisSummary } from "@/services/comfyui";
import { syncWorkflowModel } from "@/services/comfyui/workflow-model-sync";

const router = express.Router();

export default router.post(
  "/",
  validateFields({
    serverId: z.string().optional(),
    name: z.string().min(1, "工作流名称不能为空"),
    type: z.enum(["image", "video"], { message: "类型必须是 image 或 video" }).optional(),
    workflowJson: z.any().refine((val) => val !== null && val !== undefined, "工作流 JSON 不能为空"),
  }),
  async (req, res) => {
    try {
      const { serverId, name, workflowJson: rawWf } = req.body;

      // 规范化工作流 JSON
      let workflowJsonStr: string;
      if (typeof rawWf === "string") {
        try {
          JSON.parse(rawWf); // 验证格式
          workflowJsonStr = rawWf;
        } catch {
          return res.status(400).json(error("工作流 JSON 格式错误"));
        }
      } else if (typeof rawWf === "object" && rawWf !== null) {
        workflowJsonStr = JSON.stringify(rawWf);
      } else {
        return res.status(400).json(error("工作流 JSON 不能为空或格式不正确"));
      }

      // 使用 ComfyUIService 导入并分析
      const service = new ComfyUIService(u);
      const { record, analysis } = await service.importWorkflow(name, workflowJsonStr, serverId);

      // 将工作流同步注册为「ComfyUI」虚拟供应商下的模型，使其可在模型选择器中使用
      try {
        await syncWorkflowModel(u, record, "add");
      } catch (syncErr: any) {
        console.warn("[ComfyUI] 同步工作流到模型列表失败:", syncErr?.message);
      }

      // 生成摘要
      const summary = getAnalysisSummary(analysis);

      res.json(
        success(
          {
            record: { ...record, workflowJson: undefined }, // 不返回完整 JSON，太大
            // 该工作流已注册为「ComfyUI」虚拟供应商下的模型，模型键为 comfyui:<workflowId>
            modelKey: `comfyui:${record.id}`,
            analysis: {
              totalNodes: analysis.totalNodes,
              promptNodes: analysis.promptNodes.map(n => ({ id: n.id, title: n.title })),
              imageInputNodes: analysis.imageInputNodes.map(n => ({ id: n.id, title: n.title })),
              samplerNodes: analysis.samplerNodes.map(n => ({ id: n.id, title: n.title })),
              outputNodes: analysis.outputNodes.map(n => ({ id: n.id, title: n.title, classType: n.classType })),
              derivedParams: analysis.derivedParams.map(p => ({
                name: p.name,
                label: p.label,
                type: p.type,
                required: p.required,
              })),
              derivedOutputs: analysis.derivedOutputs,
              suggestion: analysis.suggestion,
            },
          },
          summary || "工作流导入成功"
        )
      );
    } catch (err: any) {
      console.error("[ComfyUI] 导入工作流失败:", err);
      res.status(500).json(error(err.message));
    }
  }
);
