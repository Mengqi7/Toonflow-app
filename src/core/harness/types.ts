// Harness Engine — Shared Type Definitions

export type AgentCapability =
  | "text-generation" | "image-generation" | "video-generation" | "audio-generation"
  | "composition" | "style-design" | "character-design" | "review" | "editing" | "lighting" | "analysis";

export type FilmAgentRole = "screenwriter" | "director" | "dp" | "lighting" | "costume" | "sound" | "editor" | "vfx";

export interface AgentDescriptor {
  id: string; name: string; role: FilmAgentRole; capabilities: AgentCapability[];
  dependencies?: string[]; factory: (ctx: any) => Promise<any>; version: string;
}

export interface AgentContext {
  instanceId: string; nodeId: string; projectId: number; input: Record<string, any>;
  memoryBus: any; rulesEngine: any; skillsRegistry: any; mcpConnector: any;
  abortSignal?: AbortSignal; config: Record<string, any>;
}

export abstract class BaseAgent {
  abstract readonly descriptor: AgentDescriptor;
  async init(_ctx: AgentContext): Promise<void> {}
  abstract execute(ctx: AgentContext): Promise<AgentResult>;
  async cleanup(_ctx: AgentContext): Promise<void> {}
}

export interface AgentResult {
  success: boolean; data: Record<string, any>; artifacts?: string[]; metrics?: Record<string, number>;
}

// ── Workflow Types ───────────────────────────────
export type NodeType = "agent" | "script" | "review-gate" | "parallel-fork" | "parallel-join";
export type NodeState = "pending" | "ready" | "running" | "reviewing" | "completed" | "failed" | "skipped";
export type WorkflowStatus = "pending" | "running" | "paused" | "completed" | "failed";

export interface WorkflowDefinition {
  id: string; version: string; nodes: WorkflowNode[]; edges: WorkflowEdge[]; config?: WorkflowConfig;
}

export interface WorkflowNode {
  id: string; type: NodeType; agentRole?: FilmAgentRole;
  input: { bindings: Record<string, string>; static?: Record<string, any> };
  output: { keys: string[]; schema?: Record<string, string> };
  config: NodeConfig;
}

export interface NodeConfig {
  timeoutMs: number;
  retry: { maxRetries: number; backoffMs: number; backoffMultiplier: number; retryableErrors: string[] };
  reviewGate?: ReviewGateConfig; parallelDegree?: number;
}

export interface ReviewGateConfig {
  reviewerAgentId: string; criteria: ReviewCriterion[]; passThreshold: number; onReject: "retry" | "skip" | "pause";
}

export interface ReviewCriterion { name: string; weight: number; threshold: number; description: string; }

export interface WorkflowEdge { from: string; to: string; condition?: string; }

export interface WorkflowInstance {
  id: string; definitionId: string; status: WorkflowStatus;
  nodeStates: Map<string, NodeState>; context: WorkflowContext; startedAt: number; completedAt?: number;
}

export interface WorkflowContext {
  data: Map<string, Record<string, any>>; projectId: number; userId: number; config: Record<string, any>;
}

export interface WorkflowResult { instanceId: string; status: WorkflowStatus; metrics?: Record<string, number>; }
export interface NodeResult { nodeId: string; state: NodeState; output?: Record<string, any>; error?: Error; }

// ── Review Types ──────────────────────────────────
export interface ReviewScore {
  technical: { resolution: number; artifacts: number; colorSpace: number; format: number };
  artistic: { composition: number; styleMatch: number; lighting: number; aesthetic: number };
  contentMatch: { sceneAccuracy: number; characterMatch: number; propAccuracy: number };
  overall: number; passed: boolean; feedback?: string;
}

export interface RetryInstruction {
  targetAgentId: string; originalOutput: any; failedCriterion: string; failedScore: number;
  suggestions: string[]; priorityParams: Record<string, any>; attemptNumber: number; maxAttempts: number;
}

// ── Rules / Skills / Memory / MCP Types ───────────
export type RuleScope = string;
export interface Rule { id: string; name: string; scope: RuleScope; priority: number; conflictResolution: "override" | "merge" | "append"; content: string; }
export type SkillCategory = "text-generation" | "image-generation" | "video-generation" | "audio-generation" | "analysis" | "utility";
export interface SkillParameter { name: string; type: string; required: boolean; description: string; default?: any; enumValues?: string[]; }
export interface SkillDescriptor { id: string; name: string; category: SkillCategory; version: string; parameters: SkillParameter[]; content: string; generatedTools?: ToolDefinition[]; }
export interface ToolDefinition { type: "function"; function: { name: string; description: string; parameters: Record<string, any>; }; }
export type MemoryNamespace = string;
export interface MemoryEntry { id: string; namespace: MemoryNamespace; key: string; value: any; type: "short-term" | "long-term" | "summary" | "rag"; timestamp: number; ttl?: number; embedding?: number[]; }
export interface MemoryQuery { namespaces?: MemoryNamespace[]; keys?: string[]; type?: string; semantic?: string; limit?: number; }
export interface MCPServerConfig { id: string; name: string; transport: "stdio" | "http"; command?: string; args?: string[]; url?: string; autoReconnect: boolean; reconnectIntervalMs: number; }
export interface MCPTool { name: string; description: string; inputSchema: Record<string, any>; }

export interface WorkflowConfig { globalTimeoutMs?: number; parallelLimit?: number; }
