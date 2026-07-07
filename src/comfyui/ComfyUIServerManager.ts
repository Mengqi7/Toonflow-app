/**
 * ComfyUIServerManager — ComfyUI 服务管理
 *
 * 多 server 管理, 健康检查, 负载均衡
 */
import { db } from "@/utils/db";
import axios from "axios";

export interface ComfyUIServer {
  id: number;
  name: string;
  baseUrl: string;
  wsUrl?: string;
  enabled: boolean;
  healthy?: boolean;
  vramTotal?: number;
  vramFree?: number;
  queueLength?: number;
}

export class ComfyUIServerManager {
  /** 添加服务 */
  async addServer(config: { name: string; baseUrl: string; wsUrl?: string }): Promise<number> {
    const [id] = await db("o_comfyui_server").insert({
      name: config.name,
      baseUrl: config.baseUrl,
      wsUrl: config.wsUrl || null,
      enabled: 1,
      createTime: Date.now(),
    });
    return id;
  }

  /** 删除服务 */
  async removeServer(id: number): Promise<void> {
    await db("o_comfyui_server").where("id", id).del();
  }

  /** 列出所有服务 */
  async listServers(): Promise<ComfyUIServer[]> {
    const rows = await db("o_comfyui_server").orderBy("createTime", "desc");
    return rows.map((r: any) => ({
      id: r.id, name: r.name, baseUrl: r.baseUrl, wsUrl: r.wsUrl,
      enabled: r.enabled === 1,
    }));
  }

  /** 健康检查 */
  async healthCheck(id: number): Promise<{ healthy: boolean; vramTotal?: number; vramFree?: number; queueLength?: number }> {
    try {
      const server = await db("o_comfyui_server").where("id", id).first();
      if (!server) return { healthy: false };

      const resp = await axios.get(`${server.baseUrl}/system_stats`, { timeout: 5000 });
      const stats = resp.data?.system;
      return {
        healthy: true,
        vramTotal: stats?.devices?.[0]?.vram_total,
        vramFree: stats?.devices?.[0]?.vram_free,
        queueLength: resp.data?.queue?.length || 0,
      };
    } catch {
      return { healthy: false };
    }
  }

  /** 选择服务 (负载均衡) */
  async selectServer(strategy: "round-robin" | "least-load" | "most-vram" = "round-robin"): Promise<ComfyUIServer | null> {
    const servers = await this.listServers();
    const enabled = servers.filter(s => s.enabled);
    if (enabled.length === 0) return null;

    // 检查健康状态
    const healthy: ComfyUIServer[] = [];
    for (const s of enabled) {
      const check = await this.healthCheck(s.id);
      if (check.healthy) {
        healthy.push({ ...s, ...check });
      }
    }
    if (healthy.length === 0) return null;

    switch (strategy) {
      case "least-load":
        return healthy.sort((a, b) => (a.queueLength || 0) - (b.queueLength || 0))[0];
      case "most-vram":
        return healthy.sort((a, b) => (b.vramFree || 0) - (a.vramFree || 0))[0];
      default:
        // round-robin: 随机选一个
        return healthy[Math.floor(Math.random() * healthy.length)];
    }
  }

  /** 确保连接 */
  async ensureConnected(id: number): Promise<boolean> {
    const check = await this.healthCheck(id);
    return check.healthy;
  }
}
