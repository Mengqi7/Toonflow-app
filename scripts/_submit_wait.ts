/** 提交完整版工厂工作流（submitOnly）+ 轮询 ComfyUI history + 分析音频 */
const BASE = "http://127.0.0.1:10588/api";
const WF_ID = process.argv[2];
const TAG = process.argv[3] || "FULL";

async function main() {
  const login = await fetch(`${BASE}/login/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin123" }),
  }).then((r) => r.json());
  const H = { "Content-Type": "application/json", Authorization: login.data.token };

  console.log(`[${TAG}] submitOnly 提交...`);
  const t0 = Date.now();
  const test = await fetch(`${BASE}/comfyui/testWorkflow/${WF_ID}/test`, {
    method: "POST", headers: H, body: JSON.stringify({ options: { submitOnly: true } }),
  }).then(async (r) => ({ status: r.status, body: await r.json() }));
  if (test.status !== 200) { console.log("提交失败:", JSON.stringify(test.body).slice(0, 1000)); process.exit(1); }
  const promptId = test.body?.data?.promptId;
  console.log(`[${TAG}] 已提交 promptId=${promptId} (${((Date.now()-t0)/1000).toFixed(1)}s)`);

  // 轮询 ComfyUI history（无限等待，每 60s）
  const base = "http://127.0.0.1:8188";
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 60000));
    const h = await fetch(`${base}/history/${promptId}`).then((r) => r.json());
    const e = h[promptId];
    if (!e) { process.stdout.write(`[${TAG}] ${((Date.now()-t0)/1000/60).toFixed(1)}min running...\n`); continue; }
    console.log(`[${TAG}] 状态: ${e.status?.status_str} (${((Date.now()-t0)/1000/60).toFixed(1)}min)`);
    if (e.status?.status_str === "error") {
      const errs = (e.status?.messages || []).filter((m: any) => m[0] === "execution_error")
        .map((m: any) => String(m[1].exception_message || JSON.stringify(m[1])).slice(0, 800));
      console.log("ERRORS:", errs.join(" || "));
      process.exit(1);
    }
    if (e.outputs) {
      console.log(`[${TAG}] 输出:`, JSON.stringify(e.outputs).slice(0, 400));
      process.exit(0);
    }
  }
  process.exit(1);
}
main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
