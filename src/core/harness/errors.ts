/**
 * AgentExecutionError — Agent 执行错误体系
 *
 * 所有 Agent 在失败时必须抛出 AgentExecutionError 或其子类,
 * 由 WorkflowRunner 捕获并发出 task.failed 事件,
 * 由监制 Agent (SupervisorAgent) 决策重试/打回/升级用户。
 *
 * 每个错误包含 humanReadableReason (中文), 适合直接显示在导演对话窗口。
 */

export type AgentErrorCode =
  | "timeout"
  | "api_error"
  | "parse_failed"
  | "backend_unavailable"
  | "model_missing"
  | "cancelled"
  | "validation_failed"
  | "unexpected";

export class AgentExecutionError extends Error {
  readonly code: AgentErrorCode;
  readonly humanReadableReason: string;
  readonly context: Record<string, any>;
  readonly isBug: boolean;

  constructor(
    code: AgentErrorCode,
    humanReadableReason: string,
    context: Record<string, any> = {},
    options?: { cause?: Error; isBug?: boolean },
  ) {
    super(humanReadableReason);
    this.name = "AgentExecutionError";
    this.code = code;
    this.humanReadableReason = humanReadableReason;
    this.context = context;
    this.isBug = options?.isBug ?? false;
    if (options?.cause) {
      (this as any).cause = options.cause;
    }
  }

  /** 转换为可序列化对象 (供事件推送) */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      humanReadableReason: this.humanReadableReason,
      context: this.context,
      isBug: this.isBug,
    };
  }
}

/** 超时错误 — Agent 执行超过 timeoutMs */
export class TimeoutError extends AgentExecutionError {
  constructor(taskId: string, timeoutMs: number, context: Record<string, any> = {}) {
    super(
      "timeout",
      `任务 ${taskId} 执行超时 (${timeoutMs}ms), 请检查模型响应速度或增加超时时间`,
      { taskId, timeoutMs, ...context },
    );
    this.name = "TimeoutError";
  }
}

/** API 调用错误 — 第三方 API 返回错误 (限流/服务不可用/认证失败) */
export class ApiError extends AgentExecutionError {
  constructor(
    humanReadableReason: string,
    context: Record<string, any> = {},
    options?: { cause?: Error; statusCode?: number },
  ) {
    super("api_error", humanReadableReason, { ...context, statusCode: options?.statusCode }, options);
    this.name = "ApiError";
  }
}

/** 解析失败 — LLM 返回的内容无法解析为预期格式 */
export class ParseError extends AgentExecutionError {
  constructor(expectedFormat: string, rawText: string, context: Record<string, any> = {}) {
    super(
      "parse_failed",
      `AI 返回内容无法解析为 ${expectedFormat}, 请检查 prompt 或重试`,
      { expectedFormat, rawText: rawText.slice(0, 500), ...context },
    );
    this.name = "ParseError";
  }
}

/** 后端不可用 — ComfyUI 服务不可用或无可用服务 */
export class BackendUnavailableError extends AgentExecutionError {
  constructor(backend: string, context: Record<string, any> = {}) {
    super(
      "backend_unavailable",
      `${backend} 后端不可用, 请检查 ComfyUI 服务状态或降级到 API 模式`,
      { backend, ...context },
    );
    this.name = "BackendUnavailableError";
  }
}

/** 模型缺失 — ComfyUI 工作流所需的模型文件不存在 */
export class ModelMissingError extends AgentExecutionError {
  constructor(modelName: string, context: Record<string, any> = {}) {
    super(
      "model_missing",
      `模型 ${modelName} 不存在, 请下载模型或更换工作流`,
      { modelName, ...context },
    );
    this.name = "ModelMissingError";
  }
}

/** 取消错误 — 用户主动取消任务 */
export class CancelledError extends AgentExecutionError {
  constructor(taskId: string, context: Record<string, any> = {}) {
    super("cancelled", `任务 ${taskId} 已被用户取消`, { taskId, ...context });
    this.name = "CancelledError";
  }
}

/** 校验失败 — Agent 输出不符合契约 schema */
export class ValidationError extends AgentExecutionError {
  constructor(field: string, reason: string, context: Record<string, any> = {}) {
    super(
      "validation_failed",
      `输出校验失败: 字段 ${field} - ${reason}`,
      { field, reason, ...context },
    );
    this.name = "ValidationError";
  }
}

/**
 * 把任意 Error 包装为 AgentExecutionError
 * 用于 Agent execute() 的 try-catch 兜底
 */
export function wrapAsAgentError(err: unknown, context: Record<string, any> = {}): AgentExecutionError {
  if (err instanceof AgentExecutionError) return err;
  if (err instanceof Error) {
    return new AgentExecutionError(
      "unexpected",
      `发生意外错误: ${err.message}`,
      { ...context, originalMessage: err.message, stack: err.stack?.slice(0, 1000) },
      { cause: err, isBug: true },
    );
  }
  return new AgentExecutionError(
    "unexpected",
    `发生未知错误: ${String(err)}`,
    { ...context, rawError: String(err).slice(0, 500) },
    { isBug: true },
  );
}
