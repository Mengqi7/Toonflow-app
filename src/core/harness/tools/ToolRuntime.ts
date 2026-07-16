import { createHash } from "crypto";
import { v4 as uuid } from "uuid";
import { harnessEventBus } from "../HarnessEventBus";
import type { ActionPlan, ActionRun, ProjectContext, ToolFailure, UiPatch } from "../workbench/contracts";
import { actionRunStore, type ActionRunStore } from "./ActionRunStore";
import { ToolRegistry } from "./ToolRegistry";

export interface ExecuteToolRequest {
  instanceId: string;
  userInstruction: string;
  context: ProjectContext;
  plan: ActionPlan;
  toolName: string;
  input: unknown;
  idempotencyKey?: string;
  confirmed?: boolean;
}

export class ToolRuntime {
  private readonly controllers = new Map<string, AbortController>();

  constructor(
    readonly registry: ToolRegistry,
    private readonly store: ActionRunStore = actionRunStore,
  ) {}

  async execute(request: ExecuteToolRequest): Promise<ActionRun> {
    const input = this.registry.validateInput(request.toolName, request.input);
    const idempotencyKey = request.idempotencyKey || this.makeIdempotencyKey(request, input);
    const existing = await this.store.findByIdempotencyKey(idempotencyKey);
    if (existing && ["completed", "running"].includes(existing.status)) return existing;
    if (existing?.status === "awaiting_confirmation" && !request.confirmed) return existing;

    const now = Date.now();
    const callId = `call-${uuid()}`;
    let run: ActionRun = existing || {
      id: `action-${uuid()}`,
      idempotencyKey,
      instanceId: request.instanceId,
      projectId: request.context.route.projectId,
      episodeId: request.context.route.episodeId,
      userInstruction: request.userInstruction,
      contextSnapshot: request.context,
      plan: request.plan,
      toolCalls: [{ id: callId, toolName: request.toolName, input, status: "pending" }],
      status: "planned",
      reviewState: "not_required",
      createdAt: now,
      updatedAt: now,
    };
    run = await this.store.create(run);

    await harnessEventBus.emitWorkbenchEvent({
      kind: "action.planned",
      actionRunId: run.id,
      instanceId: run.instanceId,
      projectId: run.projectId,
      payload: run.plan,
    });

    if (this.registry.needsConfirmation(request.toolName, input) && !request.confirmed) {
      run = await this.store.update(run.id, { status: "awaiting_confirmation", reviewState: "pending" });
      await harnessEventBus.emitWorkbenchEvent({
        kind: "action.awaiting_confirmation",
        actionRunId: run.id,
        instanceId: run.instanceId,
        projectId: run.projectId,
        payload: { plan: run.plan, toolName: request.toolName, input },
      });
      return run;
    }

    const controller = new AbortController();
    this.controllers.set(run.id, controller);
    const tool = this.registry.get(request.toolName);
    const toolCall = run.toolCalls[0];
    toolCall.status = "running";
    toolCall.startedAt = Date.now();
    run = await this.store.update(run.id, { status: "running", toolCalls: run.toolCalls });

    await harnessEventBus.emitWorkbenchEvent({
      kind: "tool.started",
      actionRunId: run.id,
      instanceId: run.instanceId,
      projectId: run.projectId,
      payload: { callId: toolCall.id, toolName: request.toolName, input },
    });

    try {
      const output = await tool.execute(input, {
        actionRun: run,
        projectContext: request.context,
        signal: controller.signal,
        reportProgress: async (percent, message) => {
          toolCall.progress = { percent: Math.max(0, Math.min(100, Math.round(percent))), message, updatedAt: Date.now() };
          run = await this.store.update(run.id, { status: "running", toolCalls: run.toolCalls });
          await harnessEventBus.emitWorkbenchEvent({
            kind: "tool.progress",
            actionRunId: run.id,
            instanceId: run.instanceId,
            projectId: run.projectId,
            payload: { callId: toolCall.id, toolName: request.toolName, percent: toolCall.progress.percent, message },
          });
        },
      });
      const validatedOutput = this.registry.validateOutput(request.toolName, output);
      toolCall.status = "completed";
      toolCall.output = validatedOutput;
      toolCall.completedAt = Date.now();
      run = await this.store.update(run.id, { status: "completed", toolCalls: run.toolCalls, result: validatedOutput, error: null, reviewState: this.resolveReviewState(validatedOutput) });

      await harnessEventBus.emitWorkbenchEvent({
        kind: "tool.completed",
        actionRunId: run.id,
        instanceId: run.instanceId,
        projectId: run.projectId,
        payload: { callId: toolCall.id, toolName: request.toolName, output: validatedOutput },
      });
      const uiPatch = (validatedOutput as any)?.uiPatch as UiPatch | undefined;
      if (uiPatch) await harnessEventBus.emitUiPatch(uiPatch, run.instanceId, run.projectId);
      return run;
    } catch (error) {
      const cancelled = controller.signal.aborted;
      const failure = this.toFailure(error, cancelled);
      toolCall.status = cancelled ? "cancelled" : "failed";
      toolCall.completedAt = Date.now();
      toolCall.error = failure;
      run = await this.store.update(run.id, { status: cancelled ? "cancelled" : "failed", toolCalls: run.toolCalls, error: failure });
      await harnessEventBus.emitWorkbenchEvent({
        kind: cancelled ? "tool.cancelled" : "tool.failed",
        actionRunId: run.id,
        instanceId: run.instanceId,
        projectId: run.projectId,
        payload: { callId: toolCall.id, toolName: request.toolName, failure },
      });
      return run;
    } finally {
      this.controllers.delete(run.id);
    }
  }

  async retry(actionRunId: string): Promise<ActionRun> {
    const run = await this.store.get(actionRunId);
    if (!run) throw new Error(`ActionRun not found: ${actionRunId}`);
    if (!run.error?.retryable) throw new Error(`ActionRun is not retryable: ${actionRunId}`);
    const call = run.toolCalls[0];
    return this.execute({
      instanceId: run.instanceId,
      userInstruction: run.userInstruction,
      context: run.contextSnapshot,
      plan: run.plan,
      toolName: call.toolName,
      input: call.input,
      idempotencyKey: `${run.idempotencyKey}:retry:${Date.now()}`,
      confirmed: true,
    });
  }

  async confirm(actionRunId: string): Promise<ActionRun> {
    const run = await this.store.get(actionRunId);
    if (!run) throw new Error(`ActionRun not found: ${actionRunId}`);
    if (run.status !== "awaiting_confirmation") throw new Error(`ActionRun is not awaiting confirmation: ${actionRunId}`);
    const call = run.toolCalls[0];
    if (!call) throw new Error(`ActionRun has no tool call: ${actionRunId}`);
    return this.execute({
      instanceId: run.instanceId,
      userInstruction: run.userInstruction,
      context: run.contextSnapshot,
      plan: run.plan,
      toolName: call.toolName,
      input: call.input,
      idempotencyKey: run.idempotencyKey,
      confirmed: true,
    });
  }

  async cancel(actionRunId: string): Promise<boolean> {
    const controller = this.controllers.get(actionRunId);
    if (controller) {
      controller.abort();
      return true;
    }
    const run = await this.store.get(actionRunId);
    if (!run || !["planned", "awaiting_confirmation", "running"].includes(run.status)) return false;
    const failure: ToolFailure = { code: "CANCELLED", message: "操作已取消", retryable: true, retryInstruction: "可以从对话中重新发起", safeActions: ["retry"] };
    const calls = run.toolCalls.map(call => call.status === "completed" ? call : { ...call, status: "cancelled" as const, completedAt: Date.now(), error: failure });
    await this.store.update(actionRunId, { status: "cancelled", toolCalls: calls, error: failure });
    await harnessEventBus.emitWorkbenchEvent({ kind: "tool.cancelled", actionRunId: run.id, instanceId: run.instanceId, projectId: run.projectId, payload: { reason: "user_cancelled" } });
    return true;
  }

  private makeIdempotencyKey(request: ExecuteToolRequest, input: unknown): string {
    return createHash("sha256")
      .update(JSON.stringify({ instanceId: request.instanceId, toolName: request.toolName, input }))
      .digest("hex");
  }

  private resolveReviewState(output: unknown): ActionRun["reviewState"] {
    const result = output as any;
    if (typeof result?.score?.passed === "boolean") return result.score.passed ? "approved" : "rejected";
    if (typeof result?.quality?.passed === "boolean") return result.quality.passed ? "approved" : "rejected";
    if (typeof result?.qualityLoop?.passed === "boolean") return result.qualityLoop.passed ? "approved" : "rejected";
    return "not_required";
  }

  private toFailure(error: unknown, cancelled: boolean): ToolFailure {
    const message = error instanceof Error ? error.message : String(error);
    if (cancelled) return { code: "CANCELLED", message: "操作已取消", retryable: true, retryInstruction: "可从对话结果卡重新执行", safeActions: ["retry"] };
    const retryable = /timeout|network|quota|ECONN|temporar/i.test(message);
    return {
      code: retryable ? "PROVIDER_OR_NETWORK_FAILURE" : "TOOL_EXECUTION_FAILURE",
      message,
      retryable,
      retryInstruction: retryable ? "检查供应商状态后重试，或切换供应商" : "检查输入对象和字段后重新提交",
      safeActions: retryable ? ["retry", "switch_provider", "manual_edit", "cancel"] : ["manual_edit", "cancel"],
    };
  }
}
