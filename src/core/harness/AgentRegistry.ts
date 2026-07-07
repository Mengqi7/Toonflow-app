import fg from "fast-glob";
import path from "path";
import { pathToFileURL } from "url";
import type { AgentDescriptor, AgentCapability, FilmAgentRole, AgentContext, BaseAgent } from "./types";

export class AgentRegistry {
  private agents = new Map<string, AgentDescriptor>();

  async scanAndRegister(): Promise<void> {
    const entries = await fg(["src/agents/**/index.ts"], { ignore: ["src/agents/scriptAgent/**", "src/agents/productionAgent/**"] });
    let loaded = 0;
    for (const entry of entries) {
      try {
        const absolutePath = path.resolve(entry);
        const fileUrl = pathToFileURL(absolutePath).href;
        const mod: any = await import(fileUrl as string);

        // V2: 支持 descriptors 数组 (一个 index.ts 导出多个 Agent)
        const descs: AgentDescriptor[] = [];
        if (Array.isArray(mod?.descriptors)) {
          descs.push(...mod.descriptors);
        } else {
          let desc: AgentDescriptor | undefined = mod?.default;
          if (!desc) desc = mod?.descriptor;
          if (!desc) desc = mod?.agent;
          if (desc) descs.push(desc);
        }

        for (const desc of descs) {
          if (desc && desc.id) {
            this.agents.set(desc.id, desc);
            console.log("[AgentRegistry] Registered: " + desc.id + " (" + desc.name + ") [" + desc.capabilities.join(", ") + "]");
            loaded++;
          }
        }
        if (descs.length === 0) {
          console.warn("[AgentRegistry] Skipping " + entry + ": no valid descriptor");
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[AgentRegistry] Failed to load " + entry + ": " + msg);
      }
    }
    console.log("[AgentRegistry] Total: " + loaded + " agents loaded");
  }

  get(id: string): AgentDescriptor {
    const agent = this.agents.get(id);
    if (!agent) throw new Error("Agent '" + id + "' not found");
    return agent;
  }

  findByCapability(cap: AgentCapability): AgentDescriptor[] {
    return [...this.agents.values()].filter(function(a) { return a.capabilities.includes(cap); });
  }

  findByRole(role: FilmAgentRole): AgentDescriptor | undefined {
    return [...this.agents.values()].find(function(a) { return a.role === role; });
  }

  async createInstance(idOrRole: string, ctx: AgentContext): Promise<BaseAgent> {
    let desc = this.agents.get(idOrRole);
    if (!desc) desc = this.findByRole(idOrRole as FilmAgentRole);
    if (!desc) throw new Error("Agent '" + idOrRole + "' not registered");
    return desc.factory(ctx);
  }

  listAll(): AgentDescriptor[] { return [...this.agents.values()]; }

  register(desc: AgentDescriptor): void { this.agents.set(desc.id, desc); }
}
