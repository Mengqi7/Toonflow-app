import { cp, mkdir, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(rootDir, "frontend", "dist");
const targetDir = join(rootDir, "data", "web");

try {
  await stat(sourceDir);
} catch {
  throw new Error(`Frontend build output is missing: ${sourceDir}`);
}

await rm(targetDir, { recursive: true, force: true });
await mkdir(targetDir, { recursive: true });
await cp(sourceDir, targetDir, { recursive: true });

console.log(`Synced frontend build to ${targetDir}`);
