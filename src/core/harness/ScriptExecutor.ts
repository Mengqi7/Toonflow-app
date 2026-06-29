import { NodeVM } from "vm2";
import fs from "fs";
import path from "path";
import fg from "fast-glob";

interface ScriptDefinition {
  id: string; name?: string; code: string; timeoutMs: number; allowedModules?: string[];
}

export class ScriptExecutor {
  private scripts = new Map<string, ScriptDefinition>();

  async execute(script: ScriptDefinition, context: Record<string, any>): Promise<any> {
    const vm = new NodeVM({
      timeout: script.timeoutMs || 30000,
      sandbox: { ...context, console },
      require: {
        external: script.allowedModules || ["lodash", "path", "fs/promises"],
        builtin: ["path", "fs", "util"],
      },
    });
    return vm.run(script.code, script.id + ".js");
  }

  async loadBuiltinScripts(): Promise<void> {
    const files = await fg(["data/scripts/**/*.js", "data/scripts/**/*.ts"]);
    for (const file of files) {
      const id = path.basename(file, path.extname(file));
      const code = fs.readFileSync(file, "utf-8");
      this.scripts.set(id, { id, code, timeoutMs: 30000 });
    }
  }

  registerScript(script: ScriptDefinition): void {
    this.scripts.set(script.id, script);
  }

  getScript(id: string): ScriptDefinition | undefined {
    return this.scripts.get(id);
  }
}
