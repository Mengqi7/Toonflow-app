/**
 * ComfyUI 服务器管理器
 *
 * 管理 ComfyUI 服务实例的注册、健康检查、可用性检测。
 */

import {
  ComfyServer,
  ServerRecord,
} from "./types";
import { checkServerHealth } from "./execution-engine";

/**
 * 获取所有可用的 ComfyUI 服务器
 * 从数据库读取 + 实时健康检查
 */
export async function getAvailableServers(
  dbServers: ServerRecord[]
): Promise<ComfyServer[]> {
  const servers: ComfyServer[] = dbServers.map((s) => ({
    id: s.id,
    name: s.name,
    baseUrl: s.baseUrl,
    enabled: s.enabled,
    status: "unknown",
  }));

  // 并行健康检查
  const checks = servers.map(async (server) => {
    if (!server.enabled) return server;

    const health = await checkServerHealth(server.baseUrl);
    server.status = health.online ? "connected" : "disconnected";
    server.lastCheckTime = Date.now();
    return server;
  });

  return await Promise.all(checks);
}

/**
 * 获取第一个可用的 ComfyUI 服务器
 */
export async function getFirstAvailableServer(
  dbServers: ServerRecord[]
): Promise<ComfyServer | null> {
  for (const s of dbServers) {
    if (!s.enabled) continue;

    const health = await checkServerHealth(s.baseUrl);
    if (health.online) {
      return {
        id: s.id,
        name: s.name,
        baseUrl: s.baseUrl,
        enabled: true,
        status: "connected",
        lastCheckTime: Date.now(),
      };
    }
  }
  return null;
}

/**
 * 根据 ID 查找服务器
 */
export function findServerById(
  dbServers: ServerRecord[],
  serverId: string
): ComfyServer | null {
  const s = dbServers.find((s) => s.id === serverId);
  if (!s) return null;
  return {
    id: s.id,
    name: s.name,
    baseUrl: s.baseUrl,
    enabled: s.enabled,
    status: "unknown",
  };
}

/**
 * 获取默认 ComfyUI 地址（本地默认端口）
 */
export function getDefaultServerUrl(): string {
  return "http://127.0.0.1:8188";
}
