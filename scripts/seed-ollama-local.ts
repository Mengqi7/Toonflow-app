import { db } from "../src/utils/db";
import fs from "fs";
import path from "path";

async function main() {
  const vendorFile = path.join(__dirname, "..", "data", "vendor", "ollama-local.ts");
  if (!fs.existsSync(vendorFile)) {
    console.log("ollama-local.ts not found");
    process.exit(1);
  }
  const tsCode = fs.readFileSync(vendorFile, "utf-8");

  const existing = await db("o_vendorConfig").where("id", "ollama-local").first();
  if (existing) {
    console.log("ollama-local already exists in DB");
    process.exit(0);
  }

  await db("o_vendorConfig").insert({
    id: "ollama-local",
    inputValues: JSON.stringify({ apiKey: "", baseUrl: "http://localhost:11434/v1" }),
    models: JSON.stringify([
      { name: "Qwen3.6 最新版", modelName: "qwen3.6:latest", type: "text", think: false }
    ]),
    enable: 1,
  });
  console.log("ollama-local vendor inserted into DB");
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });