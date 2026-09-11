/** A/B 音频对比：导入工作流 + 完整生成 + 提取音频分析 */
import fs from "fs";
import { execFileSync } from "child_process";
import path from "path";

const BASE = "http://127.0.0.1:10588/api";
const FILE = process.argv[2];
const TAG = process.argv[3] || "AB";
const FFMPEG = "E:/ComfyUI/COMFYUI_dapaopao/python_dapao312/ffmpeg/bin/ffmpeg.exe";

async function main() {
  const login = await fetch(`${BASE}/login/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin123" }),
  }).then((r) => r.json());
  const H = { "Content-Type": "application/json", Authorization: login.data.token };

  const name = `${TAG}-${Date.now()}`;
  const text = fs.readFileSync(FILE, "utf-8");
  const imp = await fetch(`${BASE}/comfyui/importWorkflow`, {
    method: "POST", headers: H, body: JSON.stringify({ name, workflowJson: text }),
  }).then((r) => r.json());
  const wfId = imp.data?.record?.id;
  if (!wfId) { console.log("导入失败:", JSON.stringify(imp).slice(0, 500)); process.exit(1); }
  console.log(`[${TAG}] 导入成功 ${wfId}`);

  console.log(`[${TAG}] 完整生成开始`, new Date().toLocaleTimeString());
  const t0 = Date.now();
  const gen = await fetch(`${BASE}/comfyui/testWorkflow/${wfId}/test`, {
    method: "POST", headers: H, body: JSON.stringify({}),
  }).then(async (r) => ({ status: r.status, body: await r.json() })).catch((e) => ({ status: 0, body: { error: e.message } }));
  console.log(`[${TAG}] 生成结束 (${((Date.now() - t0) / 1000).toFixed(0)}s)`, gen.status, gen.body?.message);
  if (gen.status !== 200) { console.log(JSON.stringify(gen.body).slice(0, 1000)); process.exit(1); }
  const outs = gen.body?.data?.outputs || [];
  for (const o of outs) console.log(`[${TAG}] 产物: ${o.type} ${o.filename} base64=${o.dataUrl?.length}`);

  // 从产物 base64 提取音频
  const video = outs.find((o: any) => o.type === "video");
  if (video?.dataUrl) {
    const b64 = video.dataUrl.split(",")[1];
    const mp4 = `E:/workspace/Toonflow-app/temp/${TAG}_out.mp4`;
    fs.writeFileSync(mp4, Buffer.from(b64, "base64"));
    const wav = `E:/workspace/Toonflow-app/temp/${TAG}_out.wav`;
    execFileSync(FFMPEG, ["-y", "-v", "error", "-i", mp4, "-vn", "-acodec", "pcm_s16le", "-ar", "32000", wav]);
    console.log(`[${TAG}] 音频已提取 -> ${wav}`);
  }

  await fetch(`${BASE}/comfyui/deleteWorkflow/${wfId}`, { method: "DELETE", headers: H }).catch(() => {});
  console.log(`[${TAG}] DONE`);
  process.exit(0);
}
main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
