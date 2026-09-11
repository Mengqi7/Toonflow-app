/** 导入工厂工作流到 Toonflow + submitOnly 启动测试 + 完整生成验证 */
import fs from "fs";

const BASE = "http://127.0.0.1:10588/api";
const FILE = process.argv[2] || "data/workflows/Toonflow_MiniMaxH3_Ref2VA_工厂工作流.json";
const FULL_GEN = process.argv.includes("--full");
const name = process.argv[3] || "MiniMax-H3 视频工厂 (Ref2VA 多参考加速版)";

async function main() {
  const login = await fetch(`${BASE}/login/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin123" }),
  }).then((r) => r.json());
  const token = login.data?.token || "";
  const H = { "Content-Type": "application/json", Authorization: token };

  const text = fs.readFileSync(FILE, "utf-8");
  const imp = await fetch(`${BASE}/comfyui/importWorkflow`, {
    method: "POST", headers: H, body: JSON.stringify({ name, workflowJson: text }),
  }).then(async (r) => ({ status: r.status, body: await r.json() }));
  console.log("== 1.导入 ==", imp.status, imp.body?.code, imp.body?.message);
  if (imp.status !== 200) { console.log(JSON.stringify(imp.body).slice(0, 2000)); return; }
  const d = imp.body.data;
  console.log("   workflowId =", d.record.id);
  console.log("   analysis:", JSON.stringify(d.analysis).slice(0, 600));

  // submitOnly 启动测试
  const t0 = Date.now();
  const test = await fetch(`${BASE}/comfyui/testWorkflow/${d.record.id}/test`, {
    method: "POST", headers: H,
    body: JSON.stringify({ prompt: "保持默认提示词", options: { submitOnly: true } }),
  }).then(async (r) => ({ status: r.status, body: await r.json() }));
  console.log(`== 2.启动测试 == ${((Date.now() - t0) / 1000).toFixed(1)}s`, test.status, test.body?.code, test.body?.message);
  if (test.status !== 200) { console.log("   详情:", JSON.stringify(test.body).slice(0, 3000)); return; }
  console.log("   promptId =", test.body.data.promptId);

  if (FULL_GEN) {
    console.log("== 3.完整生成（真实视频生成）==");
    const g0 = Date.now();
    const gen = await fetch(`${BASE}/comfyui/testWorkflow/${d.record.id}/test`, {
      method: "POST", headers: H,
      body: JSON.stringify({ prompt: "保持默认提示词" }),
    }).then(async (r) => ({ status: r.status, body: await r.json() })).catch((e) => ({ status: 0, body: { error: e.message } }));
    console.log(`== 3.完成 (${((Date.now() - g0) / 1000).toFixed(0)}s) ==`, gen.status, gen.body?.code, gen.body?.message);
    const outs = gen.body?.data?.outputs || [];
    for (const o of outs) console.log(`   产物: ${o.type} ${o.filename} base64=${o.dataUrl?.length || 0}`);
    if (gen.status !== 200) console.log("   详情:", JSON.stringify(gen.body).slice(0, 1500));
  }

  console.log("\nDONE workflowId=", d.record.id);
  process.exit(0);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
