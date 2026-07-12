import type {
  ArtifactId,
  BeatId,
  CharacterId,
  EpisodeId,
  LocationId,
  ProjectId,
  PropId,
  SceneId,
  ScriptId,
  ShotId,
} from "../domain/ids";

export type WorkbenchDomain =
  | "script"
  | "beats"
  | "scenes"
  | "characters"
  | "props"
  | "locations"
  | "storyboard"
  | "video"
  | "assets";

export type ContextEntityType = "project" | "episode" | "script" | "beat" | "scene" | "shot" | "character" | "prop" | "location" | "artifact";

export interface WorkbenchRouteContext {
  route: string;
  domain: WorkbenchDomain;
  projectId: ProjectId;
  episodeId?: EpisodeId;
}

export interface ContextEntityRef {
  id: ProjectId | EpisodeId | ScriptId | BeatId | SceneId | ShotId | CharacterId | PropId | LocationId | ArtifactId;
  type: ContextEntityType;
  label?: string;
  version?: number;
}

export interface ContextSourceTrace {
  sourceId: string;
  sourceType: "route" | "selection" | "visible" | "database" | "artifact-link" | "action-run";
  loadedAt: number;
  included: boolean;
  reason?: string;
  estimatedTokens: number;
}

export interface ProjectContext {
  route: WorkbenchRouteContext;
  project?: Record<string, unknown>;
  episode?: Record<string, unknown>;
  selected: ContextEntityRef[];
  visible: ContextEntityRef[];
  related: ContextEntityRef[];
  upstreamArtifacts: ContextEntityRef[];
  downstreamArtifacts: ContextEntityRef[];
  pendingReviews: Array<Record<string, unknown>>;
  recentActionRuns: ActionRunSummary[];
  productionState: ProductionState;
  trace: ContextSourceTrace[];
  budget: {
    maxTokens: number;
    estimatedTokens: number;
    omittedSourceIds: string[];
  };
  resolvedAt: number;
}

export interface ProductionState {
  hasNovel: boolean;
  hasStorySkeleton: boolean;
  hasAdaptationStrategy: boolean;
  scriptCount: number;
  assetCount: number;
  hasDirectorPlan: boolean;
  shotCount: number;
  videoCount: number;
  nextStage: "development" | "screenplay" | "assets" | "director_plan" | "storyboard" | "video" | "complete";
}

export type ActionRunStatus = "planned" | "awaiting_confirmation" | "running" | "completed" | "failed" | "cancelled";

export interface ToolCallRecord {
  id: string;
  toolName: string;
  input: unknown;
  output?: unknown;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  startedAt?: number;
  completedAt?: number;
  error?: ToolFailure;
}

export interface ActionRun {
  id: string;
  idempotencyKey: string;
  instanceId: string;
  projectId: ProjectId;
  episodeId?: EpisodeId;
  userInstruction: string;
  contextSnapshot: ProjectContext;
  plan: ActionPlan;
  toolCalls: ToolCallRecord[];
  status: ActionRunStatus;
  reviewState?: "not_required" | "pending" | "approved" | "rejected";
  result?: unknown;
  error?: ToolFailure;
  createdAt: number;
  updatedAt: number;
}

export interface ActionRunSummary {
  id: string;
  userInstruction: string;
  status: ActionRunStatus;
  toolNames: string[];
  stage?: string;
  updatedAt: number;
}

export interface ActionPlan {
  summary: string;
  steps: Array<{ toolName: string; purpose: string; targetIds: string[] }>;
  affectedObjects: ContextEntityRef[];
  requiresConfirmation: boolean;
  confirmationReason?: string;
  estimatedProviderCalls?: number;
}

export interface ToolFailure {
  code: string;
  message: string;
  retryable: boolean;
  retryInstruction?: string;
  safeActions: Array<"retry" | "cancel" | "switch_provider" | "manual_edit">;
  details?: unknown;
}

export interface DomainEvent<T = unknown> {
  id: string;
  kind:
    | "action.planned"
    | "action.awaiting_confirmation"
    | "tool.started"
    | "tool.progress"
    | "tool.completed"
    | "tool.failed"
    | "tool.cancelled"
    | "entity.created"
    | "entity.updated"
    | "artifact.version_created"
    | "artifact.rolled_back"
    | "generation.status_changed"
    | "review.requested"
    | "review.completed"
    | "review.approved"
    | "review.rerouted";
  actionRunId: string;
  instanceId: string;
  projectId: ProjectId;
  entity?: ContextEntityRef;
  payload: T;
  timestamp: number;
}

export interface UiPatch {
  id: string;
  actionRunId: string;
  domain: WorkbenchDomain;
  operation: "insert" | "update" | "remove" | "replace" | "refresh";
  target: ContextEntityRef;
  changes?: Record<string, unknown>;
  version?: number;
  timestamp: number;
}

export interface WorkbenchContextInput {
  route: string;
  domain: WorkbenchDomain;
  projectId: string | number;
  episodeId?: string | number;
  selected?: Array<{ type: ContextEntityType; id: string | number; label?: string }>;
  visible?: Array<{ type: ContextEntityType; id: string | number; label?: string }>;
  maxTokens?: number;
}
