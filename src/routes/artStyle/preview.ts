import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success } from "@/lib/responseFormat";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const body = req.body as any;
    const input = z.object({ id: z.coerce.number().optional(), prompt: z.string().optional(), model: z.string().optional(), projectId: z.coerce.number().optional() }).parse({ ...body, id: body.id || (req.params as any).id }) as { id?: number; prompt?: string; model?: string; projectId?: number };
    const style = input.id ? await u.db("o_artStyle").where("id", input.id).first() as { prompt?: string } | undefined : undefined;
    const prompt = input.prompt || style?.prompt;
    if (!prompt) return res.status(400).json({ code: 400, message: "style prompt required" });
    const model = input.model || "1:default";
    const image = await u.Ai.Image(model as `${string}:${string}`).run({ prompt, size: "1K", aspectRatio: "16:9" }, { taskClass: "art-style-preview", describe: prompt, relatedObjects: JSON.stringify({ styleId: input.id }), projectId: input.projectId || 0 });
    const path = `/artStyle/preview-${u.uuid()}.jpg`;
    await image.save(path);
    res.json({ code: 200, data: { url: await u.oss.getFileUrl(path), prompt } });
  } catch (error) {
    res.status(400).json({ code: 400, message: error instanceof Error ? error.message : String(error) });
  }
});

export default router;
