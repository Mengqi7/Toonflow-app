// ToonFlow 端到端测试：R2V (comfyui_local_minimax_h3_r2v)
const fs = require('fs');
const BASE = 'http://localhost:10588';
async function main() {
  const login = await fetch(BASE + '/api/login/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }) });
  const token = (await login.json()).data.token;
  const img = JSON.parse(fs.readFileSync('E:/workspace/Toonflow-app/temp/_test_image.json', 'utf8'));
  const prompt = "For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.\nintegrated_multimodal_description:\n[Shot 1] Cinematic realistic style, the subject from the reference picture moves naturally in a serene environment, camera slowly pushes in, soft golden lighting, gentle motion, high detail.\noverall_soundscape:\nSoft ambient wind and faint natural ambience.\nnon_diegetic_music:\nN/A";
  const body = {
    id: 'comfyui_local_minimax_h3_r2v',
    modelName: 'minimax-h3-r2v-fast',
    mode: 'videoReference',
    prompt,
    videos: [], audios: [],
    images: [img],
  };
  console.log('提交 R2V 测试任务... duration=3s resolution=480p aspect=16:9 (full ref2va + 音频)');
  const t0 = Date.now();
  const resp = await fetch(BASE + '/api/setting/vendorConfig/modelTest/videoTest', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: token }, body: JSON.stringify(body) });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const text = await resp.text();
  console.log(`HTTP ${resp.status} (${elapsed}s)`);
  console.log(text.slice(0, 2000));
}
main().catch(e => { console.error('FATAL', e.message); process.exit(1); });
