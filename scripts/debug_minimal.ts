import axios from "axios";

const baseUrl = "http://127.0.0.1:8188";

// 最小 MiniMax H3 图生视频工作流（使用本机已安装的模型 + example.png）
function buildPrompt() {
  return {
    "1": { class_type: "UNETLoader", inputs: { unet_name: "Minimax-h3\\minimax_h3_ref2va_pruned_int8_convrot.safetensors", weight_dtype: "default" } },
    "2": { class_type: "CLIPLoader", inputs: { clip_name: "qwen3vl_32b_minimax_h3_int8_convrot.safetensors", type: "minimax", device: "default" } },
    "3": { class_type: "VAELoader", inputs: { vae_name: "Minimax-h3\\minimax_h3_video_vae_fp16.safetensors" } },
    "4": { class_type: "LoadImage", inputs: { image: "example.png" } },
    "5": { class_type: "MiniMaxH3ImageToVideo", inputs: { clip: ["2", 0], vae: ["3", 0], first_frame: ["4", 0], prompt: "a cinematic shot of a cat walking through a misty garden, soft golden light", width: 768, height: 768, length: 22 } },
    "6": { class_type: "BasicGuider", inputs: { model: ["1", 0], conditioning: ["5", 0] } },
    "7": { class_type: "KSamplerSelect", inputs: { sampler_name: "euler" } },
    "8": { class_type: "BasicScheduler", inputs: { model: ["1", 0], scheduler: "simple", steps: 8, denoise: 1 } },
    "9": { class_type: "RandomNoise", inputs: { noise_seed: 12345 } },
    "10": { class_type: "SamplerCustomAdvanced", inputs: { noise: ["9", 0], guider: ["6", 0], sampler: ["7", 0], sigmas: ["8", 0], latent_image: ["5", 1] } },
    "11": { class_type: "VAEDecode", inputs: { samples: ["10", 0], vae: ["3", 0] } },
    "12": { class_type: "CreateVideo", inputs: { images: ["11", 0], fps: 24 } },
    "13": { class_type: "SaveVideo", inputs: { video: ["12", 0], filename_prefix: "toonflow_debug", format: "auto", codec: "auto" } },
  };
}

async function main() {
  const prompt = buildPrompt();
  console.log("提交节点数:", Object.keys(prompt).length);
  const resp = await axios.post(`${baseUrl}/prompt`, { prompt, client_id: "toonflow_debug" }, { timeout: 30000 });
  const d = resp.data;
  if (d.node_errors && Object.keys(d.node_errors).length) {
    console.log("NODE ERRORS:", JSON.stringify(d.node_errors, null, 2).slice(0, 3000));
    return;
  }
  if (!d.prompt_id) {
    console.log("无 prompt_id:", JSON.stringify(d).slice(0, 500));
    return;
  }
  const pid = d.prompt_id;
  console.log("prompt_id =", pid, "，开始轮询...");

  const start = Date.now();
  while (Date.now() - start < 10 * 60 * 1000) {
    await new Promise((r) => setTimeout(r, 3000));
    try {
      const h = (await axios.get(`${baseUrl}/history/${pid}`, { timeout: 10000 })).data;
      const entry = h[pid];
      if (entry?.status?.status_str === "error") {
        const msgs = (entry.status.messages || []).map((m: any) => (typeof m[1] === "string" ? m[1] : JSON.stringify(m[1]))).join("; ");
        console.log("执行错误:", msgs.slice(0, 2000));
        return;
      }
      if (entry?.outputs && Object.keys(entry.outputs).length > 0) {
        console.log("✅ 生成成功! 输出:", JSON.stringify(entry.outputs, null, 2).slice(0, 1500));
        return;
      }
      const sec = Math.floor((Date.now() - start) / 1000);
      if (sec % 15 === 0) console.log(`  等待中... (${sec}s)`);
    } catch (e: any) {
      // 404 表示还没完成，继续
    }
  }
  console.log("超时");
}

main().catch((e) => { console.error("HTTP ERROR:", e.response?.status, JSON.stringify(e.response?.data).slice(0, 2000)); process.exit(1); });
