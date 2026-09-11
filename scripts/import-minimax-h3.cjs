/* 导入 MiniMax H3 / LTX2.5 供应商与工作流到 ToonFlow（走官方 API） */
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:10588';
const MATERIAL = 'D:/mengq/Documents';

async function api(method, url, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = token;
  const resp = await fetch(BASE + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await resp.json(); } catch { json = { raw: await resp.text().catch(() => '') }; }
  return { status: resp.status, json };
}

function readUtf8(p) { return fs.readFileSync(p, 'utf8'); }

async function main() {
  // 1. login
  const login = await api('POST', '/api/login/login', { username: 'admin', password: 'admin123' });
  const token = login.json?.data?.token;
  if (!token) { console.error('LOGIN FAILED', JSON.stringify(login.json)); process.exit(1); }
  console.log('✓ 登录成功');

  // 2. vendors
  const vendors = [
    { file: path.join(MATERIAL, 'Toonflaw工作流和模型/Toonflow工作流+配置文件适配minimaxH3和LTX2.5/H3全参生视频工作流和配置文件/minimaxH3全参考‑v6.3.ts'), label: 'MiniMax H3 R2V 全参考 (v6.4)' },
    { file: path.join(MATERIAL, 'Toonflaw工作流和模型/Toonflow工作流+配置文件适配minimaxH3和LTX2.5/H3图片生视频工作流和配置文件/minimax单图首尾帧.ts'), label: 'MiniMax H3 官方对齐版 I2V/FL2V (v7.1)' },
    { file: path.join(MATERIAL, 'Toonflaw工作流和模型/Toonflow工作流+配置文件适配minimaxH3和LTX2.5/LTX2.5工作流和配置i文件/LTX2.5图生视频 配置文件.ts'), label: 'LTX 2.5 图生视频 (v5.0)' },
  ];

  for (const v of vendors) {
    if (!fs.existsSync(v.file)) { console.error(`✗ 文件不存在: ${v.file}`); continue; }
    const tsCode = readUtf8(v.file);
    const add = await api('POST', '/api/setting/vendorConfig/addVendor', { tsCode }, token);
    if (add.status === 200) {
      const vendorId = add.json?.data?.id;
      console.log(`✓ 供应商已添加: ${v.label} -> ${vendorId}`);
      const en = await api('POST', '/api/setting/vendorConfig/enableVendor', { id: vendorId, enable: 1 }, token);
      console.log(`  enable: ${en.status === 200 ? 'OK' : JSON.stringify(en.json).slice(0, 200)}`);
    } else {
      console.error(`✗ 供应商添加失败 ${v.label}: ${JSON.stringify(add.json).slice(0, 500)}`);
    }
  }

  // 3. workflows
  const wfRoot = path.join(MATERIAL, 'MinimaxH3');
  const adaptRoot = path.join(MATERIAL, 'Toonflaw工作流和模型/Toonflow工作流+配置文件适配minimaxH3和LTX2.5');
  const workflows = [
    { file: path.join(wfRoot, 'minimaxH3官方工作流/video_minimax_h3_t2v.json'), name: 'MiniMax H3 官方 T2V 文生视频' },
    { file: path.join(wfRoot, 'minimaxH3官方工作流/video_minimax_h3_i2v.json'), name: 'MiniMax H3 官方 I2V 图生视频' },
    { file: path.join(wfRoot, 'minimaxH3官方工作流/video_minimax_h3_r2v.json'), name: 'MiniMax H3 官方 R2V 参考生视频' },
    { file: path.join(wfRoot, 'minimaxH3导演台工作流/minimax_h3_director_fl2v.json'), name: 'MiniMax H3 导演台 FL2V 首尾帧' },
    { file: path.join(wfRoot, 'minimaxH3导演台工作流/minimax_h3_director_r2v.json'), name: 'MiniMax H3 导演台 R2V 参考' },
    { file: path.join(wfRoot, 'minimaxH3导演台工作流/minimax_h3_director_rv2v.json'), name: 'MiniMax H3 导演台 RV2V 参考视频' },
    { file: path.join(wfRoot, 'minimaxH3导演台工作流/minimax_h3_director_v2v.json'), name: 'MiniMax H3 导演台 V2V 视频生视频' },
    { file: path.join(wfRoot, 'krea2_四图三角度.json'), name: 'Krea2 四图三角度' },
    { file: path.join(wfRoot, 'MiniMax - H3 智能一体化视频创作导演台 V2.json'), name: 'MiniMax H3 智能一体化导演台 V2' },
    { file: path.join(adaptRoot, 'H3全参生视频工作流和配置文件/video_minimax_h3_r2v.json'), name: 'MiniMax H3 R2V 全参考 (ToonFlow适配)' },
    { file: path.join(adaptRoot, 'H3图片生视频工作流和配置文件/video_minimax_h3_i2v.json'), name: 'MiniMax H3 I2V 单图首尾帧 (ToonFlow适配)' },
    { file: path.join(adaptRoot, 'LTX2.5工作流和配置i文件/video_ltx2_5_i2v_api.json'), name: 'LTX 2.5 图生视频 (API)' },
    { file: path.join(adaptRoot, 'Flux2-Klein-三图参考.json'), name: 'Flux2-Klein 三图参考' },
  ];

  for (const w of workflows) {
    if (!fs.existsSync(w.file)) { console.error(`✗ 文件不存在: ${w.file}`); continue; }
    const workflowJson = readUtf8(w.file);
    const imp = await api('POST', '/api/comfyui/importWorkflow', { name: w.name, workflowJson }, token);
    if (imp.status === 200) {
      console.log(`✓ 工作流已导入: ${w.name} (id=${imp.json?.data?.record?.id}, type=${imp.json?.data?.record?.type}, nodes=${imp.json?.data?.analysis?.totalNodes})`);
    } else {
      console.error(`✗ 工作流导入失败 ${w.name}: ${JSON.stringify(imp.json).slice(0, 500)}`);
    }
  }

  // 4. verify
  const vlist = await api('POST', '/api/setting/vendorConfig/getVendorList', {}, token);
  const vendorsOut = (vlist.json?.data || []).filter(v => v.id && (v.id.includes('minimax') || v.id.includes('ltx')));
  console.log('\n=== 供应商验证 ===');
  for (const v of vendorsOut) {
    console.log(`- ${v.id} | ${v.name} | enable=${v.enable} | models=${(v.models || []).map(m => m.name).join('; ') || '(文件内)'}`);
  }
  const wlist = await api('POST', '/api/comfyui/getWorkflows', {}, token);
  console.log('\n=== 工作流验证 ===');
  for (const w of (wlist.json?.data || [])) {
    console.log(`- ${w.name} | ${w.type} | ${w.id}`);
  }
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
