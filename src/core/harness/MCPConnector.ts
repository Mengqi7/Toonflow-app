import { ChildProcess, spawn } from "child_process";
import type { MCPServerConfig, MCPTool } from "./types";

interface MCPConnection {
  config: MCPServerConfig;
  process?: ChildProcess;
  connected: boolean;
  reconnectTimer?: NodeJS.Timeout;
}

export class MCPConnector {
  private servers = new Map<string, MCPConnection>();
  private tools = new Map<string, MCPTool[]>();

  async registerServer(config: MCPServerConfig): Promise<void> {
    this.servers.set(config.id, { config, connected: false });
    if (config.autoReconnect) await this.connect(config.id);
  }

  async connect(serverId: string): Promise<void> {
    const conn = this.servers.get(serverId);
    if (!conn) throw new Error(`Server '${serverId}' not registered`);

    if (conn.config.transport === "stdio" && conn.config.command) {
      conn.process = spawn(conn.config.command, conn.config.args || [], {
        stdio: ["pipe", "pipe", "pipe"],
      });
      conn.connected = true;
    } else if (conn.config.transport === "http" && conn.config.url) {
      try {
        const r = await fetch(`${conn.config.url}/health`);
        conn.connected = r.ok;
      } catch {
        conn.connected = false;
      }
    }

    if (!conn.connected && conn.config.autoReconnect) {
      conn.reconnectTimer = setTimeout(() => this.connect(serverId), conn.config.reconnectIntervalMs);
    }
  }

  async discoverTools(serverId: string): Promise<MCPTool[]> {
    const conn = this.servers.get(serverId);
    if (!conn?.connected) return [];

    if (conn.config.transport === "http" && conn.config.url) {
      try {
        const r = await fetch(`${conn.config.url}/tools`);
        const tools: MCPTool[] = await r.json();
        this.tools.set(serverId, tools);
        return tools;
      } catch { return []; }
    }
    return [];
  }

  async invokeTool(serverId: string, toolName: string, params: Record<string, any>): Promise<any> {
    const conn = this.servers.get(serverId);
    if (!conn?.connected) throw new Error(`Server '${serverId}' not connected`);

    if (conn.config.transport === "http" && conn.config.url) {
      const r = await fetch(`${conn.config.url}/tools/${toolName}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      return r.json();
    }
    throw new Error("stdio transport tool invocation not yet implemented");
  }

  async healthCheck(serverId: string): Promise<boolean> {
    const conn = this.servers.get(serverId);
    if (!conn) return false;

    if (conn.config.transport === "http" && conn.config.url) {
      try {
        const r = await fetch(`${conn.config.url}/health`, { signal: AbortSignal.timeout(5000) });
        return r.ok;
      } catch { return false; }
    }
    return conn.connected;
  }

  getAllTools(): Map<string, MCPTool[]> { return new Map(this.tools); }

  async disconnect(serverId: string): Promise<void> {
    const conn = this.servers.get(serverId);
    if (!conn) return;
    if (conn.reconnectTimer) clearTimeout(conn.reconnectTimer);
    if (conn.process) { conn.process.kill(); conn.connected = false; }
    if (conn.config.transport === "http") conn.connected = false;
  }

  async disconnectAll(): Promise<void> {
    for (const id of this.servers.keys()) await this.disconnect(id);
  }
}
