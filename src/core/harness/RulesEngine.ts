import fs from "fs";
import fg from "fast-glob";
import path from "path";
import type { Rule } from "./types";

export class RulesEngine {
  private rules = new Map<string, Rule>();
  private cache = new Map<string, string>();
  private watchers: fs.FSWatcher[] = [];

  async loadRules(): Promise<void> {
    const files = await fg(["data/rules/**/*.md"]);
    for (const file of files) {
      try {
        const raw = fs.readFileSync(file, "utf-8");
        const rule = this.parseRule(file, raw);
        if (rule) this.rules.set(rule.id, rule);
      } catch (err) {
        console.warn(`[RulesEngine] Failed to load ${file}:`, err);
      }
    }
  }

  private parseRule(filePath: string, raw: string): Rule | null {
    const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!fmMatch) return null;
    const frontmatter: Record<string, any> = {};
    for (const line of fmMatch[1].split("\n")) {
      const [k, ...v] = line.split(":");
      if (k && v.length) frontmatter[k.trim()] = v.join(":").trim();
    }
    return {
      id: frontmatter.id || path.basename(filePath, ".md"),
      name: frontmatter.name || "",
      scope: frontmatter.scope || "global",
      priority: parseInt(frontmatter.priority) || 0,
      conflictResolution: frontmatter.conflictResolution || "merge",
      content: fmMatch[2].trim(),
    };
  }

  getRulesForAgent(agentId: string): string {
    const cacheKey = `agent:${agentId}`;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey)!;

    const relevant = [...this.rules.values()]
      .filter(r => r.scope === "global" || r.scope === `agent:${agentId}`)
      .sort((a, b) => b.priority - a.priority);

    let merged = "";
    for (const r of relevant) {
      if (r.conflictResolution === "override") merged = r.content;
      else if (r.conflictResolution === "merge") merged += "\n\n" + r.content;
      else merged += "\n" + r.content;
    }
    this.cache.set(cacheKey, merged.trim());
    return merged.trim();
  }

  watchRules(): void {
    if (!fs.existsSync("data/rules")) { fs.mkdirSync("data/rules", { recursive: true }); }
    const watcher = fs.watch("data/rules", { recursive: true }, () => {
      this.cache.clear();
      this.loadRules();
    });
    this.watchers.push(watcher);
  }

  invalidateCache(scope?: string): void {
    if (scope) this.cache.delete(scope);
    else this.cache.clear();
  }

  listAll(): Rule[] { return [...this.rules.values()]; }

  dispose(): void {
    for (const w of this.watchers) w.close();
    this.watchers = [];
  }
}
