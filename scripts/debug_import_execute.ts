import fs from "fs";
import knex from "knex";
import { ComfyUIService, getAnalysisSummary } from "../src/services/comfyui";
import { importWorkflow } from "../src/services/comfyui/workflow-store";
import { syncWorkflowModel } from "../src/services/comfyui/workflow-model-sync";

const FILE = "E:\\ComfyUI\\COMFYUI_dapaopao\\ComfyUI\\user\\default\\workflows\\minimax_h3\\地表最强开源视频！Minimax-h3 首尾帧版 26-08-03.json";

async function main() {
  const db = knex({ client: "better-sqlite3", connection: { filename: "data/db2.sqlite" }, useNullAsDefault: true });
  const u: any = { db };

  const rawStr = fs.readFileSync(FILE, "utf-8");
  console.log("JSON 长度:", rawStr.length);

  // 1. 导入
  try {
    const { record, analysis } = await importWorkflow(u, "首尾帧版测试", rawStr);
    console.log("导入成功. id=", record.id, "type=", record.type);
    console.log("分析摘要:", getAnalysisSummary(analysis));

    // 2. 注册模型
    await syncWorkflowModel(u, record, "add");

    // 3. 执行
    const service = new ComfyUIService(u);
    console.log("开始执行...");
    const result = await service.executeById(record.id, { prompt: "一只猫在花园里漫步，电影感" });
    console.log("success:", result.success);
    if (result.success) console.log("outputs:", result.outputs?.map((o) => ({ type: o.type, filename: o.filename })));
    else console.log("error:", result.error);
  } catch (e: any) {
    console.error("导入/执行失败:", e?.message);
    console.error(e?.stack?.split("\n").slice(0, 6).join("\n"));
  }

  await db.destroy();
}

main().catch((e) => { console.error(e); process.exit(1); });
