// 注册 ComfyUI 工作流到数据库
const db = require('better-sqlite3')('data/db2.sqlite');
const fs = require('fs');
const path = require('path');

const wfPath = 'E:\\ComfyUI\\COMFYUI_dapaopao\\ComfyUI\\user\\default\\workflows\\02-图像精选\\Z-image base开源 文生图 26-01-28.json';
const wf = JSON.parse(fs.readFileSync(wfPath, 'utf-8'));

const inputValues = JSON.stringify({
  comfyuiUrl: 'http://127.0.0.1:8188',
  workflowJson: JSON.stringify(wf),
});

db.prepare("UPDATE o_vendorConfig SET inputValues=?, enable=1 WHERE id='comfyui'").run(inputValues);
console.log('OK: inputValues length =', inputValues.length);
db.close();
