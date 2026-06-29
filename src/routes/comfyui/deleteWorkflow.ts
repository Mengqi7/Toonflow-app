import express from "express";
import u from "@/utils";
const router = express.Router();
router.delete("/:id", async (req, res) => {
  await u.db("o_comfyui_workflow").where("id", req.params.id).del();
  res.json({ code: 200, message: "Deleted" });
});
export default router;
