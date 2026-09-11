/* 只读：表格结构 + vendor/deploy/project 行 */
import sqlite3 from "sqlite3";
const db = new sqlite3.Database("data/db2.sqlite");
const all = (sql: string): Promise<any[]> =>
  new Promise((res, rej) => db.all(sql, (e: any, r: any[]) => (e ? rej(e) : res(r))));
const done: string[] = [];
const q = async (t: string) => {
  const r = await all(`PRAGMA table_info(${t})`);
  console.log(`${t}: ${r.map((x: any) => x.name).join(",")}`);
};
(async () => {
  for (const t of ["o_comfyui_server", "o_agentDeploy", "o_project", "o_assets", "o_video"]) await q(t);
  const v = await all("SELECT * FROM o_vendorConfig");
  console.log("=== o_vendorConfig ===");
  for (const row of v)
    console.log(` - id=${row.id} enable=${row.enable} inputValues=${String(row.inputValues).slice(0, 80)} models=${String(row.models).slice(0, 200)}`);
  const d = await all("SELECT key, modelName FROM o_agentDeploy");
  console.log("=== o_agentDeploy ===");
  for (const row of d) console.log(` - ${row.key} => ${row.modelName}`);
  const p = await all("SELECT * FROM o_project").catch(() => []);
  if (p.length) {
    console.log("=== o_project ===");
    for (const row of p) console.log(" - " + JSON.stringify({ id: row.id, name: row.name, imageModel: row.imageModel, videoModel: row.videoModel, artStyle: row.artStyle }));
  }
  const srv = await all("SELECT * FROM o_comfyui_server").catch(() => []);
  console.log("=== o_comfyui_server ===");
  for (const row of srv) console.log(` - ${JSON.stringify(row)}`);
  db.close();
})();
