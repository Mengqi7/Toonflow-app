import fs from "fs";
import fg from "fast-glob";
import path from "path";
import type { SkillDescriptor, SkillCategory, ToolDefinition } from "./types";

export class SkillsRegistry {
  private skills = new Map<string, SkillDescriptor>();
  private watchers: fs.FSWatcher[] = [];

  async scanSkills(): Promise<void> {
    const files = await fg(["data/skills/**/*.md"]);
    this.skills.clear();
    for (const file of files) {
      try {
        const raw = fs.readFileSync(file, "utf-8");
        const skill = this.parseSkill(raw, file);
        if (skill) this.skills.set(skill.id, skill);
      } catch (err) {
        console.warn(`[SkillsRegistry] Failed to load ${file}:`, err);
      }
    }
    this.generateTools();
  }

  private parseSkill(raw: string, sourcePath: string): SkillDescriptor | null {
    const normalized = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
    const fmMatch = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    const fm: Record<string, any> = {};
    if (fmMatch) {
      for (const line of fmMatch[1].split("\n")) {
        const idx = line.indexOf(":");
        if (idx > 0) fm[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
      }
    }
    let parameters = [];
    try { parameters = JSON.parse(fm.parameters || "[]"); } catch {}
    const content = (fmMatch?.[2] || normalized).trim();
    if (!content) return null;
    const relative = path.relative(path.resolve("data/skills"), path.resolve(sourcePath)).replace(/\\/g, "/");
    const inferredId = relative.replace(/\.md$/i, "").replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
    const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
    return {
      id: fm.id || inferredId,
      name: fm.name || heading || path.basename(sourcePath, ".md"),
      category: (fm.category || this.inferCategory(relative)) as SkillCategory,
      version: fm.version || "1.0",
      parameters,
      content,
      sourcePath: path.resolve(sourcePath),
    };
  }

  private inferCategory(relativePath: string): SkillCategory {
    if (/story|script|narrative/i.test(relativePath)) return "text-generation";
    if (/storyboard|art|image/i.test(relativePath)) return "image-generation";
    if (/video/i.test(relativePath)) return "video-generation";
    if (/audio|sound|voice/i.test(relativePath)) return "audio-generation";
    if (/decision|supervision|analysis|derive|planning/i.test(relativePath)) return "analysis";
    return "utility";
  }

  private generateTools(): void {
    for (const skill of this.skills.values()) {
      skill.generatedTools = [{
        type: "function",
        function: {
          name: `skill_${skill.id.replace(/-/g, "_")}`,
          description: skill.name,
          parameters: {
            type: "object",
            properties: Object.fromEntries(
              skill.parameters.map(p => [p.name, { type: p.type, description: p.description }])
            ),
            required: skill.parameters.filter(p => p.required).map(p => p.name),
          },
        },
      }];
    }
  }

  getByCategory(category: SkillCategory): SkillDescriptor[] {
    return [...this.skills.values()].filter(s => s.category === category);
  }

  getToolsForAgent(_agentId: string): ToolDefinition[] {
    const tools: ToolDefinition[] = [];
    for (const skill of this.skills.values()) {
      if (skill.generatedTools) tools.push(...skill.generatedTools);
    }
    return tools;
  }

  get(id: string): SkillDescriptor | undefined { return this.skills.get(id); }

  getBySourceName(fileName: string): SkillDescriptor | undefined {
    const normalized = fileName.replace(/\\/g, "/").toLowerCase();
    return [...this.skills.values()].find(skill => skill.sourcePath?.replace(/\\/g, "/").toLowerCase().endsWith(normalized));
  }

  listAll(): SkillDescriptor[] { return [...this.skills.values()]; }

  async execute(skillId: string, params: Record<string, any>, aiCall?: (p: string) => Promise<string>): Promise<string> {
    const skill = this.skills.get(skillId);
    if (!skill) throw new Error(`Skill '${skillId}' not found`);
    let prompt = skill.content;
    for (const [k, v] of Object.entries(params)) {
      prompt = prompt.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v));
    }
    if (aiCall) {
      try { return await aiCall(prompt); } catch (err) {
        console.warn(`[SkillsRegistry] AI execution failed for ${skillId}`);
      }
    }
    return prompt;
  }

  watchSkills(): void {
    if (!fs.existsSync("data/skills")) return;
    const watcher = fs.watch("data/skills", { recursive: true }, () => {
      this.scanSkills();
    });
    this.watchers.push(watcher);
  }

  dispose(): void {
    for (const w of this.watchers) w.close();
    this.watchers = [];
  }
}
