// Harness Engine — Shared Type Definitions

export type AgentCapability =
  | "text-generation" | "image-generation" | "video-generation" | "audio-generation"
  | "composition" | "style-design" | "character-design" | "review" | "editing" | "lighting" | "analysis";

export type FilmAgentRole = "screenwriter" | "director" | "dp" | "lighting" | "costume" | "sound" | "editor" | "vfx" | "producer" | "supervisor" | "assistant_director" | "script_supervisor" | "makeup" | "wardrobe" | "set_decorator" | "sound_designer";

export interface AgentDescriptor {
  id: string; name: string; role: FilmAgentRole; capabilities: AgentCapability[];
  dependencies?: string[]; factory: (ctx: any) => Promise<any>; version: string;
}

export interface AgentContext {
  instanceId: string; nodeId: string; projectId: number; input: Record<string, any>;
  memoryBus: any; rulesEngine: any; skillsRegistry: any; mcpConnector: any; scriptExecutor?: any;
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
  /**
   * P1-5: 全局重试预算 — 整个工作流实例可消耗的最大重试次数
   * 超过后非关键 review-gate 自动降级为"通过"（避免无意义反复重试）
   */
  globalRetryBudget?: number;
  /**
   * P1-5: 是否为关键节点 (关键节点不会被预算降级影响)
   */
  criticalNode?: boolean;
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

export interface AgentReviewCriteria {
  agentId: FilmAgentRole | string;
  criteria: ReviewCriterion[];
  source: "yaml" | "rules" | "auto" | "manual";
  passThreshold: number;
  loadedAt: number;
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
export interface MemoryEntry { id: string; namespace: MemoryNamespace; key: string; value: any; type: "short-term" | "long-term" | "summary" | "rag" | "event"; timestamp: number; ttl?: number; embedding?: number[]; }
export interface MemoryQuery { namespaces?: MemoryNamespace[]; keys?: string[]; type?: string; semantic?: string; limit?: number; }
export interface MCPServerConfig { id: string; name: string; transport: "stdio" | "http"; command?: string; args?: string[]; url?: string; autoReconnect: boolean; reconnectIntervalMs: number; }
export interface MCPTool { name: string; description: string; inputSchema: Record<string, any>; }

export interface WorkflowConfig { globalTimeoutMs?: number; parallelLimit?: number; }

// ── Harness V2 事件总线类型 ─────────────────────
/**
 * HarnessEvent — 11 种事件类型, 通过 HarnessEventBus 广播, 通过 SSE 推送到前端
 */
export type HarnessEvent =
  | { id: string; kind: "task.started"; taskId: string; agentRole: string; instanceId: string; input: any; timestamp: number }
  | { id: string; kind: "task.progress"; taskId: string; agentRole: string; instanceId: string; percent: number; message: string; timestamp: number }
  | { id: string; kind: "task.completed"; taskId: string; agentRole: string; instanceId: string; output: any; artifacts: ArtifactRef[]; timestamp: number }
  | { id: string; kind: "task.failed"; taskId: string; agentRole: string; instanceId: string; error: string; humanReadableReason?: string; suggestion?: string; timestamp: number }
  | { id: string; kind: "review.started"; taskId: string; reviewer: string; instanceId: string; criteria: string[]; timestamp: number }
  | { id: string; kind: "review.scored"; taskId: string; reviewer: string; instanceId: string; overall: number; passed: boolean; scores: any; feedback?: string; timestamp: number }
  | { id: string; kind: "review.reroute"; taskId: string; fromAgent: string; toAgent: string; instanceId: string; reason: string; retryInstruction?: any; userInputRequired: boolean; timestamp: number }
  | { id: string; kind: "director.message"; instanceId: string; content: string; mentions?: string[]; timestamp: number }
  | { id: string; kind: "director.user_input"; instanceId: string; action: string; choice?: string; taskId?: string; timestamp: number }
  | { id: string; kind: "director.user_input_required"; instanceId: string; prompt: string; options?: string[]; taskId?: string; timestamp: number }
  | { id: string; kind: "harness.completed"; instanceId: string; summary: string; timestamp: number }
  | { id: string; kind: "harness.failed"; instanceId: string; reason: string; timestamp: number }
  | { id: string; kind: "callback.persisted"; instanceId: string; table: string; rowCount: number; artifactKey: string; timestamp: number }
  | { id: string; kind: "callback.failed"; instanceId: string; table: string; error: string; timestamp: number }
  | { id: string; kind: "version.created"; instanceId: string; artifactType: string; artifactKey: string; version: number; source: "save" | "rollback"; timestamp: number };

export interface ArtifactRef {
  type: "script" | "image" | "video" | "audio" | "timeline" | "character" | "scene" | "prop";
  key: string;          // 如 "shot_3" 或 "scene_3"
  table: string;        // 对应业务表
  version?: number;     // 版本号
}

// ── TaskNode (动态任务图节点) ────────────────────
export interface TaskNode {
  id: string;
  agentRole: FilmAgentRole;
  static?: Record<string, any>;
  bindings: Record<string, string>;
  reviewGate?: ReviewGateConfig;
  onReject?: "reroute" | "skip" | "pause";
  timeoutMs: number;
  retry?: { maxRetries: number; backoffMs: number };
  parallelWith?: string[];          // 与哪些任务并行
  dependsOn?: string[];             // 依赖哪些任务
  criticalNode?: boolean;
}

// ── AgentContract (多 Agent 协作契约) ───────────
export interface AgentContract {
  role: string;
  name: string;
  description: string;
  triggerConditions: string[];
  inputs: {
    name: string; type: string; required: boolean; description: string;
    source: "user" | "director" | "upstream" | "memory";
  }[];
  outputs: {
    name: string; type: string; description: string;
    targetTable?: string; targetColumn?: string;
  }[];
  dependsOn: string[];
  canBeReroutedFrom: string[];
  canRerouteTo: string[];
  onFailure: "throw" | "fallback" | "ask_user";
  maxRetries: number;
}
