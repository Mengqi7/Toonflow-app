import { db } from "../src/utils/db";

async function main() {
  const agents = await db("o_agentDeploy")
    .where("key", "like", "%universal%")
    .orWhere("key", "screenwriter")
    .orWhere("key", "productionAgent")
    .orWhere("key", "dp")
    .orWhere("key", "director")
    .orWhere("key", "editor")
    .select("key", "modelName");
  console.log("AGENTS:", JSON.stringify(agents, null, 2));

  const vendors = await db("o_vendorConfig").select("*");
  console.log("VENDORS:", JSON.stringify(vendors, null, 2));
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });