import Ai from "../src/utils/ai";

async function main() {
  console.log("Testing Seedream-5.0-Lite image generation...");
  const start = Date.now();
  try {
    const img = await Ai.Image("volcengine:doubao-seedream-5-0-lite-260128").run({
      prompt: "A cinematic wide shot of an ancient Chinese city wall at dusk, warm golden hour light, deep shadows, cinematic",
      size: "1K",
      aspectRatio: "16:9",
    });
    await img.save("production/1783178001820/test-seedream.png");
    console.log(`SUCCESS in ${Date.now() - start}ms`);
  } catch (e: any) {
    console.error("FAILED:", e?.message || e);
  }
  process.exit(0);
}
main();
