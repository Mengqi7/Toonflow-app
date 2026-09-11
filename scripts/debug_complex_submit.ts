import fs from "fs";
import axios from "axios";
import { normalizeWorkflow } from "../src/services/comfyui/workflow-normalizer";

const FILE = "E:\\ComfyUI\\COMFYUI_dapaopao\\ComfyUI\\user\\default\\workflows\\minimax_h3\\地表最强开源视频！Minimax-h3 首尾帧版 26-08-03.json";
const baseUrl = "http://127.0.0.1:8188";

async function main() {
  const raw = JSON.parse(fs.readFileSync(FILE, "utf-8"));
  const objectInfo = (await axios.get(`${baseUrl}/object_info`, { timeout: 60000 })).data;
  const norm = normalizeWorkflow(raw, objectInfo);
  const nodes = norm.nodes as Record<string, any>;

  const apiWorkflow: Record<string, any> = {};
  for (const [id, n] of Object.entries(nodes)) {
    apiWorkflow[id] = { class_type: n.class_type, inputs: n.inputs || {} };
    if (n._meta) apiWorkflow[id]._meta = n._meta;
  }

  // 检查引用的图片文件是否存在
  for (const [id, n] of Object.entries(nodes)) {
    if (n.class_type === "LoadImage") {
      const img = n.inputs?.image;
      const url = `${baseUrl}/view?filename=${encodeURIComponent(img)}&type=input`;
      try {
        const r = await axios.get(url, { timeout: 10000, validateStatus: () => true });
        console.log(`LoadImage[${id}] "${img}" -> HTTP ${r.status}`);
      } catch (e: any) {
        console.log(`LoadImage[${id}] "${img}" -> 请求失败 ${e.message}`);
      }
    }
  }

  console.log("提交节点数:", Object.keys(apiWorkflow).length);
  try {
    const resp = await axios.post(`${baseUrl}/prompt`, { prompt: apiWorkflow, client_id: "toonflow_debug2" }, { timeout: 30000 });
    const d = resp.data;
    if (d.node_errors && Object.keys(d.node_errors).length) {
      console.log("NODE ERRORS:", JSON.stringify(d.node_errors, null, 2).slice(0, 3000));
    } else if (d.prompt_id) {
      console.log("SUCCESS prompt_id =", d.prompt_id);
      try { await axios.post(`${baseUrl}/interrupt`, {}, { timeout: 5000 }); } catch {}
    } else {
      console.log("RESPONSE:", JSON.stringify(d).slice(0, 500));
    }
  } catch (e: any) {
    console.log("HTTP ERROR:", e.response?.status, JSON.stringify(e.response?.data).slice(0, 3000));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
