import fs from "fs";
import axios from "axios";
import { normalizeWorkflow } from "../src/services/comfyui/workflow-normalizer";

const FILE = "E:\\ComfyUI\\COMFYUI_dapaopao\\ComfyUI\\user\\default\\workflows\\minimax_h3\\地表最强开源视频！Minimax-h3 首尾帧版 26-08-03.json";
const baseUrl = "http://127.0.0.1:8188";

async function main() {
  const raw = JSON.parse(fs.readFileSync(FILE, "utf-8"));
  console.log("顶层 keys:", Object.keys(raw).join(","));
  console.log("nodes 是数组?", Array.isArray(raw.nodes), "节点数:", raw.nodes?.length);

  const objectInfo = (await axios.get(`${baseUrl}/object_info`, { timeout: 60000 })).data;

  // 缺失的节点类型
  const types = [...new Set(raw.nodes.map((n: any) => n.type))];
  const missing = types.filter((t: string) => !objectInfo[t]);
  console.log("缺失节点类型:", JSON.stringify(missing));

  // 转换
  const norm = normalizeWorkflow(raw, objectInfo);
  const nodes = norm.nodes as Record<string, any>;
  console.log("转换后节点数:", Object.keys(nodes).length);

  // 检查缺失 required 输入
  const missingInputs: string[] = [];
  for (const [id, n] of Object.entries(nodes)) {
    const info = objectInfo[n.class_type];
    if (!info) continue;
    for (const [k, spec] of Object.entries(info.input?.required || {})) {
      if (typeof spec?.[0] === "string" && spec[0].startsWith("COMFY_")) continue;
      if (n.inputs?.[k] === undefined || n.inputs?.[k] === null) missingInputs.push(`${id}:${n.class_type}.${k}`);
    }
  }
  console.log("缺失 required 输入:", missingInputs.length ? missingInputs.join(", ") : "(none)");

  // 打印关键节点 inputs
  for (const [id, n] of Object.entries(nodes)) {
    if (/MiniMaxH3|LoadImage|UNETLoader|CLIPLoader|VAELoader|SaveVideo|CreateVideo/.test(n.class_type)) {
      console.log(`  [${id}] ${n.class_type} = ${JSON.stringify(n.inputs).slice(0, 300)}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
