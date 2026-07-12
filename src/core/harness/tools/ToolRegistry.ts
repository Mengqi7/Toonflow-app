import { fromJSONSchema } from "zod";
import type { ActionRun, ProjectContext } from "../workbench/contracts";

export type ToolAuthorization = "read" | "write" | "generate" | "review" | "admin";
export type ToolIdempotencyStrategy = "action_run" | "input_hash" | "none";

export interface ToolExecutionContext {
  actionRun: ActionRun;
  projectContext: ProjectContext;
  signal: AbortSignal;
  reportProgress: (percent: number, message: string) => Promise<void>;
}

export interface AgentToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  authorization: ToolAuthorization;
  idempotency: ToolIdempotencyStrategy;
  requiresConfirmation: boolean | ((input: TInput) => boolean);
  execute: (input: TInput, context: ToolExecutionContext) => Promise<TOutput>;
}

export class ToolRegistry {
  private readonly tools = new Map<string, AgentToolDefinition<any, any>>();

  register<TInput, TOutput>(tool: AgentToolDefinition<TInput, TOutput>): void {
    if (this.tools.has(tool.name)) throw new Error(`Tool already registered: ${tool.name}`);
    fromJSONSchema(tool.inputSchema as any);
    if (tool.outputSchema) fromJSONSchema(tool.outputSchema as any);
    this.tools.set(tool.name, tool);
  }

  get<TInput = unknown, TOutput = unknown>(name: string): AgentToolDefinition<TInput, TOutput> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);
    return tool;
  }

  list(): Array<Omit<AgentToolDefinition, "execute">> {
    return [...this.tools.values()].map(({ execute: _execute, ...definition }) => definition);
  }

  validateInput<T>(name: string, input: unknown): T {
    const tool = this.get(name);
    return fromJSONSchema(tool.inputSchema as any).parse(input) as T;
  }

  validateOutput<T>(name: string, output: unknown): T {
    const schema = this.get(name).outputSchema;
    return schema ? fromJSONSchema(schema as any).parse(output) as T : output as T;
  }

  needsConfirmation(name: string, input: unknown): boolean {
    const tool = this.get(name);
    return typeof tool.requiresConfirmation === "function"
      ? tool.requiresConfirmation(input)
      : tool.requiresConfirmation;
  }
}
