import { ChildProcess, spawn } from "child_process";
import type { MCPServerConfig, MCPTool } from "./types";

interface MCPConnection {
  config: MCPServerConfig;
  process?: ChildProcess;
  connected: boolean;
  reconnectTimer?: NodeJS.Timeout;
  nextRequestId: number;
  pending: Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>;
  buffer: string;
}

export class MCPConnector {
  private servers = new Map<string, MCPConnection>();
  private tools = new Map<string, MCPTool[]>();

  async registerServer(config: MCPServerConfig): Promise<void> {
    this.servers.set(config.id, { config, connected: false, nextRequestId: 1, pending: new Map(), buffer: "" });
    if (config.autoReconnect) await this.connect(config.id);
  }

  async connect(serverId: string): Promise<void> {
    const conn = this.servers.get(serverId);
    if (!conn) throw new Error(`Server '${serverId}' not registered`);

    if (conn.config.transport === "stdio" && conn.config.command) {
      conn.process = spawn(conn.config.command, conn.config.args || [], {
        stdio: ["pipe", "pipe", "pipe"],
      });
      conn.process.stdout?.setEncoding("utf8");
      conn.process.stdout?.on("data", chunk => this.handleStdout(conn, String(chunk)));
      conn.process.on("exit", () => {
        conn.connected = false;
        for (const pending of conn.pending.values()) pending.reject(new Error(`MCP server '${serverId}' exited`));
        conn.pending.clear();
        if (conn.config.autoReconnect) conn.reconnectTimer = setTimeout(() => void this.connect(serverId), conn.config.reconnectIntervalMs);
      });
      conn.connected = true;
      await this.request(conn, "initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "toonflow", version: "1.0.0" },
      });
      this.notify(conn, "notifications/initialized", {});
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
    if (conn.config.transport === "stdio") {
      try {
        const result = await this.request(conn, "tools/list", {});
        const tools = Array.isArray(result?.tools) ? result.tools : [];
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
    if (conn.config.transport === "stdio") {
      const result = await this.request(conn, "tools/call", { name: toolName, arguments: params });
      if (result?.isError) throw new Error(this.extractText(result.content) || `MCP tool '${toolName}' failed`);
      return result?.structuredContent ?? result?.content ?? result;
    }
    throw new Error("Unsupported MCP transport");
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
    if (conn.config.transport === "stdio" && conn.connected) {
      try { await this.request(conn, "ping", {}); return true; } catch { return false; }
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

  private handleStdout(conn: MCPConnection, chunk: string): void {
    conn.buffer += chunk;
    const lines = conn.buffer.split(/\r?\n/);
    conn.buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const message = JSON.parse(line);
        if (typeof message.id !== "number") continue;
        const pending = conn.pending.get(message.id);
        if (!pending) continue;
        conn.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message || "MCP JSON-RPC error"));
        else pending.resolve(message.result);
      } catch { /* ignore non-JSON logs on stdout */ }
    }
  }

  private request(conn: MCPConnection, method: string, params: Record<string, any>): Promise<any> {
    const id = conn.nextRequestId++;
    return new Promise((resolve, reject) => {
      conn.pending.set(id, { resolve, reject });
      conn.process?.stdin?.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
      setTimeout(() => {
        const pending = conn.pending.get(id);
        if (!pending) return;
        conn.pending.delete(id);
        reject(new Error(`MCP request '${method}' timed out`));
      }, 15000).unref?.();
    });
  }

  private notify(conn: MCPConnection, method: string, params: Record<string, any>): void {
    conn.process?.stdin?.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
  }

  private extractText(content: unknown): string {
    return Array.isArray(content) ? content.map(item => typeof item?.text === "string" ? item.text : "").filter(Boolean).join("\n") : "";
  }
}
