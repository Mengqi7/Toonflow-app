/** 验证库中已导入的第三方工作流能否直接提交适配 */
const BASE = "http://127.0.0.1:10588/api";

async function main() {
  const login = await fetch(`${BASE}/login/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin123" }),
  }).then((r) => r.json());
  const token = login.data?.token;
  const H = { "Content-Type": "application/json", Authorization: token };

  const wf = await fetch(`${BASE}/comfyui/getWorkflows`, { headers: H }).then((r) => r.json());
  console.log("库中工作流:");
  for (const w of wf.data || []) console.log(`  ${w.id} | ${w.name} | ${w.type} | 节点=${w.nodeCount}`);

  const targets = (wf.data || []).filter((w: any) => w.name !== "MiniMax-H3 视频工厂 (Ref2VA 多参考加速版)" && !w.name.startsWith("诊断"));
  for (const w of targets) {
    const t0 = Date.now();
    const r = await fetch(`${BASE}/comfyui/testWorkflow/${w.id}/test`, {
      method: "POST", headers: H,
      body: JSON.stringify({ prompt: "适配性验证", options: { submitOnly: true } }),
    }).then(async (res) => ({ status: res.status, body: await res.json() }));
    const b = r.body;
    console.log(`\n[${w.name}] ${((Date.now() - t0) / 1000).toFixed(1)}s -> HTTP ${r.status} code=${b?.code} msg=${String(b?.message).slice(0, 220)}`);
    if (r.status === 200) console.log("   ✅ 可直接适配 (promptId =", b?.data?.promptId, ")");
    else console.log("   ❌ 失败");
  }
  process.exit(0);
}
main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
