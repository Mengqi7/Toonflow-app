import { getModelList } from "../src/utils/vendor";

async function main() {
  const list = await getModelList("volcengine");
  console.log("Total models:", list.length);
  const seedream = list.filter((m) => m.modelName && m.modelName.includes("seedream-5-0-lite"));
  console.log("Seedream-5.0-Lite entries:", seedream.length);
  if (seedream.length > 0) {
    console.log("First:", JSON.stringify(seedream[0], null, 2));
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
