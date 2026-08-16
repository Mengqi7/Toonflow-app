/**
 * 直接测试 comfyui 供应商适配器（ESM 版本）
 */
import fs from 'fs';
import path from 'path';
import { VM } from 'vm2';
import axios from 'axios';
import Database from 'better-sqlite3';
import crypto from 'crypto';
import { Buffer } from 'buffer';

// 1. 读取供应商代码
const vendorCode = fs.readFileSync('data/vendor/comfyui.ts', 'utf-8');
const cleaned = vendorCode.replace(/^export \{\};?\s*$/m, '');

// 2. 从数据库读取 inputValues
const db = new Database('data/db2.sqlite');
const config = db.prepare("SELECT * FROM o_vendorConfig WHERE id='comfyui'").get();
const inputValues = JSON.parse(config.inputValues);
db.close();

console.log('comfyuiUrl:', inputValues.comfyuiUrl);
console.log('workflowJson length:', (inputValues.workflowJson || '').length);

// 3. 创建 vm2 沙箱
const vm = new VM({
  timeout: 0,
  eval: false,
  wasm: false,
  sandbox: {
    console: { log: (...args) => console.log('[sandbox]', ...args) },
    axios,
    Buffer,
    fetch,
    URLSearchParams,
    logger: (msg) => console.log('[vendor]', msg),
    urlToBase64: async (url) => { return url; },
    pollTask: async (fn, interval = 3000, timeout = 600000) => {
      const start = Date.now();
      while (true) {
        const result = await fn();
        if (result.completed) return result;
        if (Date.now() - start > timeout) throw new Error('pollTask timeout');
        await new Promise(r => setTimeout(r, interval));
      }
    },
    crypto,
    zipImage: async (b64) => b64,
    mergeImages: async (arr) => arr[0],
  },
});

try {
  console.log('\n▶ 运行供应商代码...');
  const exportsObj = vm.run(cleaned + '\n; exports;');

  console.log('vendor.id:', exportsObj.vendor.id);
  console.log('vendor.models:', exportsObj.vendor.models.map(m => m.name));

  // 4. 测试文生图
  console.log('\n▶ 调用 imageRequest...');
  const testConfig = {
    prompt: '(masterpiece, best quality:1.2), 1girl, elegant, long black hair, red dress, cherry blossoms, golden hour, cinematic photography, bokeh',
    referenceList: [],
    size: '1K',
    aspectRatio: '1:1',
  };
  const testModel = exportsObj.vendor.models[0];

  console.log('  提示词:', testConfig.prompt.slice(0, 80) + '...');
  const startTime = Date.now();

  const result = await exportsObj.imageRequest(testConfig, testModel);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✓ 生成完成! 耗时 ${elapsed}s`);
  console.log(`  结果格式: ${result.slice(0, 5)}... (长度 ${result.length} 字符)`);

  // 5. 保存结果
  const b64Match = result.match(/^data:([^;]+);base64,(.+)$/);
  if (b64Match) {
    const [_m, mime, b64] = b64Match;
    const ext = mime.split('/')[1];
    const outPath = path.join('data', 'oss', `comfyui_from_toonflow.${ext}`);
    fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
    console.log(`  已保存: ${outPath}`);
  }

  console.log('\n🎉 端到端验证成功! Toonflow → ComfyUI 文生图链路已打通');
} catch (err) {
  console.error('\n✗ 失败:', err.message);
  if (err.stack) {
    const lines = err.stack.split('\n');
    for (const line of lines.slice(0, 8)) {
      console.error('  ', line);
    }
  }
}
