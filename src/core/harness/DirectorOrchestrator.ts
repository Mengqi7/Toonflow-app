/**
 * DirectorOrchestrator — 导演 Agent 调度器
 *
 * Harness V2 的顶层调度者, 通过 LLM 决策动态生成任务图,
 * 调用 13 个工种 Agent, 监听 task 事件, 决定继续/暂停/驳回/完成。
 */
import { v4 as uuid } from "uuid";
import { db } from "@/utils/db";
import type { TaskNode, WorkflowInstance, AgentContext, AgentResult } from "./types";
import { TaskGraph } from "./TaskGraph";
import { harnessEventBus } from "./HarnessEventBus";
import { callbackBridge } from "./CallbackBridge";
import { DirectorLLMPlanner } from "./DirectorLLMPlanner";
import type { PlannerState } from "./DirectorLLMPlanner";
import { conversationalDirector, workbenchContextResolver } from "./workbench";
import type { ActionRun, WorkbenchContextInput } from "./workbench/contracts";
import { wrapAsAgentError } from "./errors";
import type { AgentRegistry, MemoryBus, RulesEngine, SkillsRegistry, MCPConnector, WorkflowRunner } from "./index";

export interface StartOptions {
  projectId: number;
  novelText?: string;
  workflowTemplate?: string;
  configOverride?: Record<string, any>;
}

export interface DirectorDecision {
  action: "dispatch" | "wait" | "ask_user" | "reroute" | "complete";
  nextTask?: TaskNode;
  userPrompt?: string;
  userOptions?: string[];
  message: string;
}

export class DirectorOrchestrator {
  private agentRegistry: AgentRegistry;
  private memoryBus: MemoryBus;
  private rulesEngine: RulesEngine;
  private skillsRegistry: SkillsRegistry;
  private mcpConnector: MCPConnector;
  private workflowRunner: WorkflowRunner;
  private planner: DirectorLLMPlanner;
  private graphs = new Map<string, TaskGraph>();  // instanceId → TaskGraph
  private userMessages = new Map<string, Array<{ role: "user" | "director"; content: string; timestamp: number }>>();

  constructor(deps: {
    agentRegistry: AgentRegistry;
    memoryBus: MemoryBus;
    rulesEngine: RulesEngine;
    skillsRegistry: SkillsRegistry;
    mcpConnector: MCPConnector;
    workflowRunner: WorkflowRunner;
  }) {
    this.agentRegistry = deps.agentRegistry;
    this.memoryBus = deps.memoryBus;
    this.rulesEngine = deps.rulesEngine;
    this.skillsRegistry = deps.skillsRegistry;
    this.mcpConnector = deps.mcpConnector;
    this.workflowRunner = deps.workflowRunner;
    this.planner = new DirectorLLMPlanner();
  }

  /**
   * 从小说启动 Harness 实例
   */
  async startFromNovel(opts: StartOptions): Promise<{ instanceId: string; message: string }> {
    const { projectId, novelText, workflowTemplate, configOverride = {} } = opts;

    // 1. 获取小说内容
    let novel = novelText || "";
    if (!novel) {
      const chapters = await db("o_novel").where({ projectId }).select("content", "chapterIndex");
      novel = chapters.sort((a, b) => a.chapterIndex - b.chapterIndex).map(c => c.content).join("\n\n");
    }
    if (novel.trim().length < 100) {
      throw new Error("小说内容过短, 至少需要 100 字符");
    }

    // 2. 获取项目配置
    const project = await db("o_project").where({ id: projectId }).first();
    if (!project) throw new Error(`项目 ${projectId} 不存在`);

    // 3. 创建 Harness 实例
    const instanceId = `harness-${uuid()}`;
    const graph = new TaskGraph(instanceId);
    this.graphs.set(instanceId, graph);
    this.userMessages.set(instanceId, []);

    // 4. 记录初始消息
    this.addMessage(instanceId, "director", `您好, 我是导演 Agent 🎬\n收到小说《${project.name}》, 共 ${novel.length} 字。\n即将开始制作流程。`);

    // 5. 发出启动事件
    await harnessEventBus.emitEvent({
      kind: "director.message",
      instanceId,
      content: `您好, 我是导演 Agent 🎬\n收到小说《${project.name}》, 共 ${novel.length} 字。\n即将开始制作流程。`,
      timestamp: Date.now(),
    } as any);

    // 6. 异步启动调度循环
    this.runDispatchLoop(instanceId, projectId, novel, { ...configOverride, project }).catch(err => {
      console.error(`[DirectorOrchestrator] Dispatch loop failed for ${instanceId}:`, err);
      harnessEventBus.emitEvent({
        kind: "harness.failed",
        instanceId,
        reason: err instanceof Error ? err.message : String(err),
        timestamp: Date.now(),
      } as any);
    });

    return { instanceId, message: "Harness 实例已启动" };
  }

  /**
   * 调度循环 — LLM 决策下一步, 派发任务, 监听完成事件
   * 当前骨架: 用简单顺序决策 (编剧→副导演→美术部→DP→视效→后期)
   */
  private async runDispatchLoop(
    instanceId: string,
    projectId: number,
    novel: string,
    config: Record<string, any>,
  ): Promise<void> {
    const graph = this.graphs.get(instanceId)!;

    // 阶段 1: 编剧
    await this.dispatchAndAwait(instanceId, projectId, {
      id: `screenwriter-${uuid()}`,
      agentRole: "screenwriter",
      bindings: {},
      static: { stage: "generate", novel },
      timeoutMs: 300000,
    }, config);

    this.addMessage(instanceId, "director", "✅ 剧本已完成, 即将派副导演拆解分镜");
    await harnessEventBus.emitEvent({
      kind: "director.message",
      instanceId,
      content: "✅ 剧本已完成, 即将派副导演拆解分镜",
      timestamp: Date.now(),
    } as any);

    // 阶段 2: 副导演
    const storyboardResult = await this.dispatchAndAwait(instanceId, projectId, {
      id: `ad-${uuid()}`,
      agentRole: "assistant_director",
      bindings: {},
      static: { script: "${screenwriter.script}" },  // 简化: 实际从 memory 读取
      timeoutMs: 300000,
    }, config);

    // 阶段 3: 美术部并行 (服装/化妆/置景)
    this.addMessage(instanceId, "director", "🔄 美术部三工种并行: 服装/化妆/置景");
    await Promise.all([
      this.dispatchAndAwait(instanceId, projectId, {
        id: `costume-${uuid()}`, agentRole: "costume", bindings: {}, static: {}, timeoutMs: 120000,
      }, config),
      this.dispatchAndAwait(instanceId, projectId, {
        id: `makeup-${uuid()}`, agentRole: "makeup", bindings: {}, static: {}, timeoutMs: 120000,
      }, config),
      this.dispatchAndAwait(instanceId, projectId, {
        id: `setdecor-${uuid()}`, agentRole: "set_decorator", bindings: {}, static: {}, timeoutMs: 120000,
      }, config),
    ]);

    // 阶段 4: DP 生图 (占位, 实际按 shot 并行)
    this.addMessage(instanceId, "director", "📷 派 DP 摄影指导生图...");
    await this.dispatchAndAwait(instanceId, projectId, {
      id: `dp-${uuid()}`, agentRole: "dp", bindings: {}, static: {}, timeoutMs: 600000,
    }, config);

    // 阶段 5: 视效生视频
    this.addMessage(instanceId, "director", "🎥 派视效师生视频...");
    await this.dispatchAndAwait(instanceId, projectId, {
      id: `vfx-${uuid()}`, agentRole: "vfx", bindings: {}, static: {}, timeoutMs: 600000,
    }, config);

    // 阶段 6: 后期 (剪辑+录音 并行)
    await Promise.all([
      this.dispatchAndAwait(instanceId, projectId, {
        id: `editor-${uuid()}`, agentRole: "editor", bindings: {}, static: {}, timeoutMs: 300000,
      }, config),
      this.dispatchAndAwait(instanceId, projectId, {
        id: `sound-${uuid()}`, agentRole: "sound_designer", bindings: {}, static: {}, timeoutMs: 300000,
      }, config),
    ]);

    // 完成
    this.addMessage(instanceId, "director", "🎬 Harness 全流程完成!");
    await harnessEventBus.emitEvent({
      kind: "harness.completed",
      instanceId,
      summary: "全部工种已完成",
      timestamp: Date.now(),
    } as any);
  }

  /**
   * 派发单个任务并等待完成
   */
  private async dispatchAndAwait(
    instanceId: string,
    projectId: number,
    task: TaskNode,
    config: Record<string, any>,
  ): Promise<AgentResult> {
    const graph = this.graphs.get(instanceId)!;
    graph.addTask(task);
    graph.updateState(task.id, "running");

    // 发出 task.started 事件
    await harnessEventBus.emitEvent({
      kind: "task.started",
      taskId: task.id,
      agentRole: task.agentRole,
      instanceId,
      input: task.static || {},
      timestamp: Date.now(),
    } as any);

    const startTime = Date.now();
    try {
      // 构造 AgentContext
      const agentCtx: AgentContext = {
        instanceId: `${instanceId}:${task.id}`,
        nodeId: task.id,
        projectId,
        input: { ...(task.static || {}), ...(task.bindings || {}) },
        memoryBus: this.memoryBus,
        rulesEngine: this.rulesEngine,
        skillsRegistry: this.skillsRegistry,
        mcpConnector: this.mcpConnector,
        config,
      };

      // 创建 Agent 实例并执行
      const agent = await this.agentRegistry.createInstance(task.agentRole, agentCtx);
      await agent.init(agentCtx);
      const result = await agent.execute(agentCtx);
      await agent.cleanup(agentCtx);

      // 持久化产物
      if (result.success && result.data) {
        await callbackBridge.persist({
          instanceId,
          projectId,
          agentRole: task.agentRole,
          output: result.data,
        });
      }

      graph.updateState(task.id, "completed", { output: result.data });
      await harnessEventBus.emitEvent({
        kind: "task.completed",
        taskId: task.id,
        agentRole: task.agentRole,
        instanceId,
        output: result.data,
        artifacts: [],
        timestamp: Date.now(),
      } as any);

      return result;
    } catch (err) {
      const wrapped = wrapAsAgentError(err, { taskId: task.id, agentRole: task.agentRole });
      graph.updateState(task.id, "failed", { error: wrapped.message });
      await harnessEventBus.emitEvent({
        kind: "task.failed",
        taskId: task.id,
        agentRole: task.agentRole,
        instanceId,
        error: wrapped.message,
        humanReadableReason: wrapped.humanReadableReason,
        timestamp: Date.now(),
      } as any);
      throw wrapped;
    } finally {
      const durationMs = Date.now() - startTime;
      console.log(`[DirectorOrchestrator] Task ${task.id} (${task.agentRole}) took ${durationMs}ms`);
    }
  }

  /**
   * 用户发送消息
   */
  async handleUserMessage(instanceId: string, message: string): Promise<{ reply: string }> {
    this.addMessage(instanceId, "user", message);

    // 用 LLM Planner 解析用户意图
    const state = this.buildPlannerState(instanceId, 0, message);
    const decision = await this.planner.parseUserIntent(message, state);

    const reply = decision.message || `收到您的指令: "${message}"\n我已处理。`;
    this.addMessage(instanceId, "director", reply);

    await harnessEventBus.emitEvent({
      kind: "director.message",
      instanceId,
      content: reply,
      timestamp: Date.now(),
    } as any);

    // 如果决策是 dispatch, 异步执行任务
    if (decision.action === "dispatch" && decision.nextTask) {
      const projectId = await this.getProjectId(instanceId);
      if (projectId) {
        this.dispatchAndAwait(instanceId, projectId, decision.nextTask, {}).catch(err => {
          console.error(`[DirectorOrchestrator] User-triggered task failed:`, err);
        });
      }
    }

    return { reply };
  }

  async handleWorkbenchInstruction(
    instanceId: string,
    message: string,
    contextInput: WorkbenchContextInput,
    confirmed = false,
  ): Promise<{ reply: string; actionRun: ActionRun }> {
    this.addMessage(instanceId, "user", message);
    const context = await workbenchContextResolver.resolve(contextInput);
    const actionRun = await conversationalDirector.executeInstruction(instanceId, message, context, confirmed);
    const resultReply = (actionRun.result as any)?.reply || (actionRun.result as any)?.summary;
    const reply = actionRun.status === "completed"
      ? resultReply || `已完成：${actionRun.plan.summary}`
      : actionRun.status === "awaiting_confirmation"
        ? `执行前需要确认：${actionRun.plan.summary}`
        : `执行未完成：${actionRun.error?.message || actionRun.status}`;
    this.addMessage(instanceId, "director", reply);
    return { reply, actionRun };
  }

  /**
   * 获取对话历史
   */
  getMessages(instanceId: string): Array<{ role: "user" | "director"; content: string; timestamp: number }> {
    return this.userMessages.get(instanceId) || [];
  }

  /**
   * 获取任务图
   */
  getTaskGraph(instanceId: string): TaskGraph | undefined {
    return this.graphs.get(instanceId);
  }

  /**
   * 获取实例状态
   */
  getStatus(instanceId: string): { instanceId: string; stats: any; messages: any[] } | null {
    const graph = this.graphs.get(instanceId);
    if (!graph) return null;
    return {
      instanceId,
      stats: graph.getStats(),
      messages: this.getMessages(instanceId),
    };
  }

  private addMessage(instanceId: string, role: "user" | "director", content: string): void {
    const msgs = this.userMessages.get(instanceId) || [];
    msgs.push({ role, content, timestamp: Date.now() });
    this.userMessages.set(instanceId, msgs);
  }

  /** 构建 Planner 状态 */
  private buildPlannerState(instanceId: string, novelLength: number, userMessage?: string): PlannerState {
    const graph = this.graphs.get(instanceId);
    const tasks = graph?.getAllTasks() || [];
    const completed = tasks.filter(t => t.state === "completed");
    const pending = tasks.filter(t => t.state === "pending").map(t => t.node.agentRole);

    return {
      instanceId,
      completedTasks: completed.map(t => ({
        agentRole: t.node.agentRole,
        success: t.state === "completed",
        outputSummary: typeof t.output === "object" ? Object.keys(t.output || {}).join(",") : String(t.output).slice(0, 50),
      })),
      pendingTasks: pending,
      novelLength,
      hasScript: completed.some(t => t.node.agentRole === "screenwriter"),
      hasStoryboard: completed.some(t => t.node.agentRole === "assistant_director"),
      hasArtDepartment: completed.some(t => ["costume", "makeup", "set_decorator"].includes(t.node.agentRole)),
      imageCount: completed.filter(t => t.node.agentRole === "dp").length,
      totalShots: 24,
      videoCount: completed.filter(t => t.node.agentRole === "vfx").length,
      userMessage,
    };
  }

  /** 从实例获取 projectId */
  private async getProjectId(instanceId: string): Promise<number | null> {
    try {
      const state = await this.workflowRunner.loadInstanceState(instanceId);
      return state?.context?.projectId || null;
    } catch {
      return null;
    }
  }
}

/** 全局单例 (在 initHarness 中初始化) */
export let directorOrchestrator: DirectorOrchestrator | null = null;

export function initDirectorOrchestrator(deps: {
  agentRegistry: AgentRegistry;
  memoryBus: MemoryBus;
  rulesEngine: RulesEngine;
  skillsRegistry: SkillsRegistry;
  mcpConnector: MCPConnector;
  workflowRunner: WorkflowRunner;
}): DirectorOrchestrator {
  directorOrchestrator = new DirectorOrchestrator(deps);
  return directorOrchestrator;
}
