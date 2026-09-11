/** 生产环境最终验证：导入 + 启动测试(submitOnly) + 完整生成 */
import fs from "fs";

const BASE = "http://127.0.0.1:10588/api";
const FILE = "E:\\ComfyUI\\COMFYUI_dapaopao\\ComfyUI\\user\\default\\workflows\\minimax_h3\\地表最强开源视频！Minimax-h3 首尾帧版 26-08-03.json";

async function main() {
  const login = await fetch(`${BASE}/login/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin123" }),
  }).then((r) => r.json());
  const token = login.data?.token || "";
  const H = { "Content-Type": "application/json", Authorization: token };

  // 1) 导入（与 UI 相同）
  const text = fs.readFileSync(FILE, "utf-8");
  const name = "生产验证-首尾帧-" + Date.now();
  const imp = await fetch(`${BASE}/comfyui/importWorkflow`, {
    method: "POST", headers: H,
    body: JSON.stringify({ name, workflowJson: text }),
  }).then(async (r) => ({ status: r.status, body: await r.json() }));
  console.log("== 1.导入 ==", imp.status, imp.body?.code, JSON.stringify(imp.body?.data?.analysis || {}).slice(0, 200));
  if (imp.status !== 200) { console.log(JSON.stringify(imp.body).slice(0, 800)); return; }
  const wfId = imp.body.data.record.id;
  console.log("   workflowId =", wfId, " modelKey =", imp.body.data.modelKey);

  // 2) 启动测试（新版 UI 行为：submitOnly，立即返回）
  const t0 = Date.now();
  const test = await fetch(`${BASE}/comfyui/testWorkflow/${wfId}/test`, {
    method: "POST", headers: H,
    body: JSON.stringify({ prompt: "测试提示词", options: { submitOnly: true } }),
  }).then(async (r) => ({ status: r.status, body: await r.json() }));
  console.log(`== 2.启动测试 ==${((Date.now() - t0) / 1000).toFixed(1)}s`, test.status, test.body?.code, test.body?.message);
  console.log("   promptId =", test.body?.data?.promptId);
  if (test.status !== 200) { console.log(JSON.stringify(test.body).slice(0, 800)); process.exit(1); }

  // 3) 完整生成（真实跑一次，验证生成+下载全链路）
  console.log("== 3.完整生成（真实视频生成，最长 15 分钟）==");
  const g0 = Date.now();
  const gen = await fetch(`${BASE}/comfyui/testWorkflow/${wfId}/test`, {
    method: "POST", headers: H,
    body: JSON.stringify({ prompt: "一段缓慢的测试镜头" }),
  }).then(async (r) => ({ status: r.status, body: await r.json() })).catch((e) => ({ status: 0, body: { error: e.message } }));
  console.log(`== 3.完整生成 结束 (${((Date.now() - g0) / 1000).toFixed(0)}s) ==`, gen.status, gen.body?.code, gen.body?.message);
  const outs = gen.body?.data?.outputs || [];
  for (const o of outs) console.log(`   产物: ${o.type} ${o.filename} base64长度=${o.dataUrl?.length || 0}`);
  if (gen.status !== 200) console.log("   详情:", JSON.stringify(gen.body).slice(0, 1200));

  // 4) 清理诊断记录
  await fetch(`${BASE}/comfyui/deleteWorkflow/${wfId}`, { method: "DELETE", headers: H }).catch(() => {});
  console.log("== 4.已清理诊断工作流 ==", wfId);
  console.log("\nDONE");
  process.exit(0);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
