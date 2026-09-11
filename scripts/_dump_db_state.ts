/* 只读：dump Toonflow 数据库当前状态（vendor/workflow/server/deploy/project） */
import sqlite3 from "sqlite3";
import path from "path";

const dbPath = path.join(__dirname, "..", "data", "db2.sqlite");
const db = new sqlite3.Database(dbPath);

const all = (sql: string, params: any[] = []): Promise<any[]> =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err: any, rows: any[]) => (err ? reject(err) : resolve(rows)));
  });

const p = async (sql: string, label: string, params: any[] = []) => {
  try {
    const rows = await all(sql, params);
    console.log(`===== ${label} (${rows.length}) =====`);
    console.log(JSON.stringify(rows, null, 1));
  } catch (e: any) {
    console.log(`===== ${label} ERROR: ${e.message}`);
  }
};

(async () => {
  await p("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name", "TABLES");
  await p("SELECT id, enable, substr(models,1,60) models_head, substr(input_values,1,80) input_values FROM o_vendorConfig", "o_vendorConfig");
  await p("SELECT id, name, type, status FROM o_comfyui_workflow", "o_comfyui_workflow");
  await p("SELECT id, name, base_url, enabled FROM o_comfyui_server", "o_comfyui_server");
  await p("SELECT key, vendor_id, model_name FROM o_agentDeploy", "o_agentDeploy");
  await p("SELECT id, name, image_model, video_model, art_style FROM o_project ORDER BY id", "o_project");
  await p("SELECT key, value FROM o_setting WHERE key IN ('agentUseMode','comfyuiBase','baseUrl')", "o_setting(subset)");
  db.close();
})();
