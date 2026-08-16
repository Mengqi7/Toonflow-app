import knex from "knex";
import { ComfyUIService } from "../src/services/comfyui";
import { syncWorkflowModel } from "../src/services/comfyui/workflow-model-sync";

const WF_ID = "debug-minimal-h3-image2video";

// 最小 MiniMax H3 图生视频工作流（已实测可在本机 ComfyUI 上跑通）
const workflowJson = {
  "1": { class_type: "UNETLoader", inputs: { unet_name: "Minimax-h3\\minimax_h3_ref2va_pruned_int8_convrot.safetensors", weight_dtype: "default" } },
  "2": { class_type: "CLIPLoader", inputs: { clip_name: "qwen3vl_32b_minimax_h3_int8_convrot.safetensors", type: "minimax", device: "default" } },
  "3": { class_type: "VAELoader", inputs: { vae_name: "Minimax-h3\\minimax_h3_video_vae_fp16.safetensors" } },
  "4": { class_type: "LoadImage", inputs: { image: "example.png" } },
  "5": { class_type: "MiniMaxH3ImageToVideo", inputs: { clip: ["2", 0], vae: ["3", 0], first_frame: ["4", 0], prompt: "a cinematic shot of a cat walking through a misty garden", width: 768, height: 768, length: 22 } },
  "6": { class_type: "BasicGuider", inputs: { model: ["1", 0], conditioning: ["5", 0] } },
  "7": { class_type: "KSamplerSelect", inputs: { sampler_name: "euler" } },
  "8": { class_type: "BasicScheduler", inputs: { model: ["1", 0], scheduler: "simple", steps: 8, denoise: 1 } },
  "9": { class_type: "RandomNoise", inputs: { noise_seed: 12345 } },
  "10": { class_type: "SamplerCustomAdvanced", inputs: { noise: ["9", 0], guider: ["6", 0], sampler: ["7", 0], sigmas: ["8", 0], latent_image: ["5", 1] } },
  "11": { class_type: "VAEDecode", inputs: { samples: ["10", 0], vae: ["3", 0] } },
  "12": { class_type: "CreateVideo", inputs: { images: ["11", 0], fps: 24 } },
  "13": { class_type: "SaveVideo", inputs: { video: ["12", 0], filename_prefix: "toonflow_debug", format: "auto", codec: "auto" } },
};

async function main() {
  const db = knex({ client: "better-sqlite3", connection: { filename: "data/db2.sqlite" }, useNullAsDefault: true });
  const u: any = { db };

  // 1. 写入工作流（模拟 importWorkflow 存储原始 JSON）
  await db("o_comfyui_workflow").insert({
    id: WF_ID,
    serverId: null,
    name: "调试-最小图生视频(MiniMax H3)",
    type: "video",
    workflowJson: JSON.stringify(workflowJson),
    analysis: null,
    schema: null,
    paramMapping: null,
    status: "active",
    createTime: Date.now(),
  }).onConflict("id").merge();

  // 2. 注册为模型
  await syncWorkflowModel(u, { id: WF_ID, name: "调试-最小图生视频(MiniMax H3)", type: "video" }, "add");

  // 3. 走 ComfyUIService 完整执行链路（与「测试」按钮一致）
  const service = new ComfyUIService(u);
  console.log("开始执行 ComfyUIService.executeById ...");
  const result = await service.executeById(WF_ID, { prompt: "一只猫在花园里漫步，电影感，柔和金光" });
  console.log("success:", result.success);
  if (result.success) {
    console.log("outputs:", result.outputs?.map((o) => ({ type: o.type, filename: o.filename, dataUrlLen: o.dataUrl?.length })));
    console.log("duration(ms):", result.duration);
  } else {
    console.log("error:", result.error);
  }

  await db.destroy();
}

main().catch((e) => { console.error(e); process.exit(1); });
