import fs from "fs";
const FILE = process.argv[2];
let raw = fs.readFileSync(FILE, "utf-8");
if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
const json = JSON.parse(raw);
for (const n of json.nodes) {
  if (n.type === "MarkdownNote") continue;
  const inputs = (n.inputs || []).map((i: any) => `${i.name}${i.link ? `<-L${i.link}` : i.widget ? "(w)" : ""}`).join(" ");
  const outputs = (n.outputs || []).map((o: any) => `${o.name}${o.links?.length ? `->${o.links.join(",")}` : ""}`).join(" ");
  const wv = Array.isArray(n.widgets_values) ? JSON.stringify(n.widgets_values).slice(0, 180) : typeof n.widgets_values === "object" ? JSON.stringify(n.widgets_values).slice(0, 180) : String(n.widgets_values);
  console.log(`[#${n.id}] ${n.type} "${n.title || ""}"`);
  console.log(`   in: ${inputs || "-"}`);
  console.log(`   out: ${outputs || "-"}`);
  if (wv !== "[]" && wv !== "undefined") console.log(`   wv: ${wv}`);
}
