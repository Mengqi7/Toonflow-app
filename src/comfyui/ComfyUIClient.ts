import WebSocket from "ws";
import { v4 as uuid } from "uuid";

export interface ComfyUIConfig { baseUrl: string; wsUrl?: string; }
interface ComfyUIHistoryOutput { [nodeId: string]: { images?: { filename: string; subfolder: string; type: string; }[]; gifs?: { filename: string; subfolder: string; type: string; }[]; }; }
export interface ComfyUIHistoryEntry { prompt: any[]; outputs: ComfyUIHistoryOutput; status: { status_str: string; completed: boolean; }; }
export interface GPUStats { vram_total: number; vram_used: number; device: string; }

export class ComfyUIClient {
  private baseUrl: string; private wsUrl: string; private clientId: string; private ws: WebSocket | null = null;

  constructor(config: ComfyUIConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.wsUrl = config.wsUrl || this.baseUrl.replace("http", "ws") + "/ws";
    this.clientId = uuid();
  }

  async queuePrompt(workflow: Record<string, any>, params?: Record<string, any>): Promise<string> {
    if (Array.isArray(workflow)) {
      const obj: Record<string, any> = {};
      for (const node of workflow) obj[node.id] = node;
      workflow = obj;
    }
    const r = await fetch(this.baseUrl + "/prompt", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: this.clientId, prompt: workflow }),
    });
    const data: any = await r.json();
    if (data.node_errors && Object.keys(data.node_errors).length > 0) {
      throw new Error("Node errors: " + JSON.stringify(data.node_errors));
    }
    return data.prompt_id;
  }

  async pollStatus(promptId: string): Promise<ComfyUIHistoryEntry> {
    const r = await fetch(this.baseUrl + "/history/" + promptId);
    const data = await r.json();
    return data[promptId];
  }

  async waitForCompletion(promptId: string, pollMs = 2000, timeoutMs = 300000): Promise<ComfyUIHistoryEntry> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const h = await this.pollStatus(promptId);
      if (h?.status?.completed) return h;
      await new Promise(r => setTimeout(r, pollMs));
    }
    throw new Error("Timeout waiting for prompt: " + promptId);
  }

  onProgress(cb: (nodeId: string, progress: number, max: number) => void): void {
    if (!this.ws) {
      this.ws = new WebSocket(this.wsUrl + "?clientId=" + this.clientId);
      this.ws.on("message", (data: any) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === "progress") cb(msg.data.node, msg.data.value, msg.data.max);
        } catch {}
      });
    }
  }

  async getImage(filename: string, subfolder: string, type: string): Promise<Buffer> {
    const params = new URLSearchParams({ filename, subfolder, type });
    const r = await fetch(this.baseUrl + "/view?" + params.toString());
    const buf = await r.arrayBuffer();
    return Buffer.from(buf);
  }

  async uploadImage(imagePath: string): Promise<string> {
    const form = new FormData();
    const blob = new Blob([await (await import("fs")).promises.readFile(imagePath)]);
    form.append("image", blob);
    const r = await fetch(this.baseUrl + "/upload/image", { method: "POST", body: form });
    const data: any = await r.json();
    return data.name;
  }

  async interrupt(): Promise<void> {
    await fetch(this.baseUrl + "/interrupt", { method: "POST" });
  }

  async getSystemStats(): Promise<GPUStats> {
    const r = await fetch(this.baseUrl + "/system_stats");
    const data: any = await r.json();
    return { vram_total: data.system?.vram_total || 0, vram_used: data.system?.vram_used || 0, device: data.system?.device || "unknown" };
  }

  async getObjectInfo(): Promise<Record<string, any>> {
    const r = await fetch(this.baseUrl + "/object_info");
    return await r.json() as Record<string, any>;
  }
}
