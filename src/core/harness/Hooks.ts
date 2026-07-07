/**
 * Hooks — Harness 生命周期钩子
 *
 * 5 个钩子:
 * - beforeTask: 任务执行前 (可修改 input, 注入 memory 上下文)
 * - afterTask: 任务执行后 (可记录日志, 修改 output)
 * - onReview: 审核完成 (可记录审核事件到 MemoryBus)
 * - onReroute: 驳回时 (可发出 review.reroute 事件)
 * - onUserConfirm: 需要用户确认时 (可暂停 Harness)
 *
 * 钩子是可选的, 不注册则不执行。
 * 钩子可以同步也可以异步 (返回 Promise)。
 */
import type { TaskNode, HarnessEvent, ReviewScore, RetryInstruction } from "./types";

export type HookHandler<TContext extends Record<string, any> = Record<string, any>> = (
  context: TContext,
) => void | Promise<void>;

export interface BeforeTaskContext {
  task: TaskNode;
  instanceId: string;
  input: Record<string, any>;
}

export interface AfterTaskContext {
  task: TaskNode;
  instanceId: string;
  output: any;
  success: boolean;
  error?: Error;
  durationMs: number;
}

export interface OnReviewContext {
  taskId: string;
  agentId: string;
  instanceId: string;
  output: any;
  score: ReviewScore;
}

export interface OnRerouteContext {
  taskId: string;
  fromAgent: string;
  toAgent: string;
  instanceId: string;
  reason: string;
  retryInstruction: RetryInstruction;
  userInputRequired: boolean;
}

export interface OnUserConfirmContext {
  instanceId: string;
  prompt: string;
  options?: string[];
  taskId?: string;
}

export class Hooks {
  private beforeTaskHandlers: HookHandler<BeforeTaskContext>[] = [];
  private afterTaskHandlers: HookHandler<AfterTaskContext>[] = [];
  private onReviewHandlers: HookHandler<OnReviewContext>[] = [];
  private onRerouteHandlers: HookHandler<OnRerouteContext>[] = [];
  private onUserConfirmHandlers: HookHandler<OnUserConfirmContext>[] = [];

  registerBeforeTask(handler: HookHandler<BeforeTaskContext>): void {
    this.beforeTaskHandlers.push(handler);
  }

  registerAfterTask(handler: HookHandler<AfterTaskContext>): void {
    this.afterTaskHandlers.push(handler);
  }

  registerOnReview(handler: HookHandler<OnReviewContext>): void {
    this.onReviewHandlers.push(handler);
  }

  registerOnReroute(handler: HookHandler<OnRerouteContext>): void {
    this.onRerouteHandlers.push(handler);
  }

  registerOnUserConfirm(handler: HookHandler<OnUserConfirmContext>): void {
    this.onUserConfirmHandlers.push(handler);
  }

  async runBeforeTask(context: BeforeTaskContext): Promise<void> {
    for (const handler of this.beforeTaskHandlers) {
      await handler(context);
    }
  }

  async runAfterTask(context: AfterTaskContext): Promise<void> {
    for (const handler of this.afterTaskHandlers) {
      await handler(context);
    }
  }

  async runOnReview(context: OnReviewContext): Promise<void> {
    for (const handler of this.onReviewHandlers) {
      await handler(context);
    }
  }

  async runOnReroute(context: OnRerouteContext): Promise<void> {
    for (const handler of this.onRerouteHandlers) {
      await handler(context);
    }
  }

  async runOnUserConfirm(context: OnUserConfirmContext): Promise<void> {
    for (const handler of this.onUserConfirmHandlers) {
      await handler(context);
    }
  }

  /** 清除所有钩子 (测试用) */
  clear(): void {
    this.beforeTaskHandlers = [];
    this.afterTaskHandlers = [];
    this.onReviewHandlers = [];
    this.onRerouteHandlers = [];
    this.onUserConfirmHandlers = [];
  }
}
