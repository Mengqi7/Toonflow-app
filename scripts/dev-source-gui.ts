import { spawn, type ChildProcess } from "child_process";
import fs from "fs";
import http from "http";
import path from "path";

const frontendPort = Number(process.env.TOONFLOW_WEB_PORT ?? 50188);
const frontendDir = path.resolve(process.env.TOONFLOW_WEB_DIR ?? path.join(process.cwd(), "..", "Toonflow-web"));
const isWindows = process.platform === "win32";
const npxCliPath = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npx-cli.js");
const children: ChildProcess[] = [];

function createChildEnv(env: NodeJS.ProcessEnv = {}) {
  const childEnv: NodeJS.ProcessEnv = { ...process.env, ...env, FORCE_COLOR: "1" };
  for (const key of Object.keys(childEnv)) {
    if (key === "npm_config_argv" || key.startsWith("npm_config_version_")) delete childEnv[key];
  }
  return childEnv;
}

function runYarnScript(cwd: string, scriptName: string, env: NodeJS.ProcessEnv = {}) {
  const hasNpxCli = fs.existsSync(npxCliPath);
  const command = hasNpxCli ? process.execPath : isWindows ? "npx.cmd" : "npx";
  const args = hasNpxCli ? [npxCliPath, "--yes", "yarn@1.22.22", scriptName] : ["--yes", "yarn@1.22.22", scriptName];
  const child = spawn(command, args, {
    cwd,
    env: createChildEnv(env),
    stdio: "inherit",
  });

  children.push(child);
  child.on("exit", (code) => {
    if (code && !shuttingDown) {
      console.error(`[dev-source-gui] ${scriptName} exited with code ${code}`);
      shutdown(code);
    }
  });
  return child;
}

function waitForFrontend(timeoutMs = 60_000) {
  const startedAt = Date.now();
  return new Promise<void>((resolve, reject) => {
    const check = () => {
      const req = http.get(`http://127.0.0.1:${frontendPort}`, (res) => {
        res.resume();
        resolve();
      });

      req.on("error", () => {
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`Timed out waiting for Toonflow-web at http://localhost:${frontendPort}`));
          return;
        }
        setTimeout(check, 500);
      });

      req.setTimeout(1000, () => {
        req.destroy();
      });
    };

    check();
  });
}

let shuttingDown = false;

function killProcessTree(child: ChildProcess) {
  if (!child.pid) return;
  if (isWindows) {
    spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
    return;
  }
  child.kill("SIGTERM");
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) killProcessTree(child);
  setTimeout(() => process.exit(exitCode), 300);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

async function main() {
  if (!fs.existsSync(path.join(frontendDir, "package.json"))) {
    throw new Error(`Toonflow-web package.json not found. Set TOONFLOW_WEB_DIR to the frontend project path.`);
  }

  console.log(`[dev-source-gui] Starting Toonflow-web from ${frontendDir}`);
  runYarnScript(frontendDir, "dev", { PORT: String(frontendPort) });

  await waitForFrontend();
  console.log(`[dev-source-gui] Toonflow-web ready at http://localhost:${frontendPort}`);
  console.log("[dev-source-gui] Starting Toonflow Electron with Vite frontend");
  runYarnScript(process.cwd(), "dev:gui-vite");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  shutdown(1);
});
