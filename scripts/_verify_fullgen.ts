/** 工厂工作流完整生成验证：不注入 prompt，使用工作流内置六段式模板 + 默认参考素材 */
const BASE = "http://127.0.0.1:10588/api";
const WF_ID = process.argv[2] || "81940dd6-9dde-49dd-8493-eeebeb1efdd0";

async function main() {
  const login = await fetch(`${BASE}/login/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin123" }),
  }).then((r) => r.json());
  const H = { "Content-Type": "application/json", Authorization: login.data.token };

  console.log("== 工厂工作流完整生成（默认六段式提示词 + 默认参考素材）==", new Date().toLocaleTimeString());
  const t0 = Date.now();
  const gen = await fetch(`${BASE}/comfyui/testWorkflow/${WF_ID}/test`, {
    method: "POST", headers: H,
    body: JSON.stringify({}),
  }).then(async (r) => ({ status: r.status, body: await r.json() })).catch((e) => ({ status: 0, body: { error: e.message } }));
  console.log(`== 完成 (${((Date.now() - t0) / 1000).toFixed(0)}s) ==`, new Date().toLocaleTimeString());
  console.log("status:", gen.status, "code:", gen.body?.code, "msg:", gen.body?.message);
  const outs = gen.body?.data?.outputs || [];
  for (const o of outs) console.log(`  产物: ${o.type} ${o.filename} base64=${o.dataUrl?.length || 0} mime=${o.mimeType}`);
  if (gen.status !== 200) console.log("  详情:", JSON.stringify(gen.body).slice(0, 1500));
  process.exit(0);
}
main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
