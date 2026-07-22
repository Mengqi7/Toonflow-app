import express from "express";
import { z } from "zod";
import { StyleReferenceMatcher } from "@/agents/director/StyleReferenceMatcher";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const input = z.object({ referenceImage: z.string().optional(), description: z.string().optional(), limit: z.coerce.number().int().min(1).max(20).optional() }).parse(req.body);
    const matches = await new StyleReferenceMatcher().match(input);
    res.json({ code: 200, data: { matches } });
  } catch (error) {
    res.status(400).json({ code: 400, message: error instanceof Error ? error.message : String(error) });
  }
});

export default router;
