import fs from "fs";
const FILE = "E:/workspace/Toonflow-app/temp/official_templates/video_minimax_h3_r2v.json";
let raw = fs.readFileSync(FILE, "utf-8");
if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
const j = JSON.parse(raw);
// 替换参考图为本机 input 中存在的文件
for (const n of j.nodes) {
  if (n.type === "LoadImage") {
    if (String(n.widgets_values?.[0]) === "red_superboy_on_city_roof.png") n.widgets_values[0] = "001 (1).png";
    if (String(n.widgets_values?.[0]) === "mecha_dragon_lightning.png") n.widgets_values[0] = "001 (2).png";
  }
  // 移除 Lightning LoRA 相关（无 lora 文件）
  if (n.type === "LoraLoaderModelOnly") n.widgets_values = ["", 1];
}
fs.writeFileSync("E:/workspace/Toonflow-app/data/workflows/Official_R2V_参考.json", JSON.stringify(j));
console.log("已生成官方模板适配版");
