import { Graph, alg as graphAlg } from "graphlib";
import { EventEmitter } from "events";
import type {
  WorkflowDefinition, WorkflowInstance, WorkflowContext, WorkflowResult,
  WorkflowNode, WorkflowEdge, NodeState, NodeResult, AgentResult, RetryInstruction,
  AgentContext
} from "./types";
import type { AgentRegistry } from "./AgentRegistry";
import type { MemoryBus } from "./MemoryBus";
import type { RulesEngine } from "./RulesEngine";
import type { SkillsRegistry } from "./SkillsRegistry";
import type { MCPConnector } from "./MCPConnector";
import { ReviewPipeline } from "@/review/ReviewPipeline";
import { harnessEventBus } from "./HarnessEventBus";

export class WorkflowRunner extends EventEmitter {
  private graphs = new Map<string, Graph>();
  private definitions = new Map<string, WorkflowDefinition>();
  private instances = new Map<string, WorkflowInstance>();
  private agentRegistry!: AgentRegistry;
  private abortControllers = new Map<string, AbortController>();
  // P0-2 fix: 使用 harness 全局单例，而非独立实例
  private memoryBus!: MemoryBus;
  private rulesEngine!: RulesEngine;
  private skillsRegistry!: SkillsRegistry;
  private mcpConnector!: MCPConnector;
  private scriptExecutor!: any;

  setAgentRegistry(registry: AgentRegistry): void { this.agentRegistry = registry; }

  /**
   * P0-2 fix: 注入 harness 全局单例，确保 Agent 间共享记忆/规则/技能/MCP/脚本
   */
  setHarnessDeps(deps: {
    memoryBus: MemoryBus; rulesEngine: RulesEngine;
    skillsRegistry: SkillsRegistry; mcpConnector: MCPConnector; scriptExecutor?: any;
  }): void {
    this.memoryBus = deps.memoryBus;
    this.rulesEngine = deps.rulesEngine;
    this.skillsRegistry = deps.skillsRegistry;
    this.mcpConnector = deps.mcpConnector;
    this.scriptExecutor = deps.scriptExecutor;
  }

  getDefinitions(): Map<string, WorkflowDefinition> { return this.definitions; }

  // ── 注册工作流 ──────────────────────────────────
  async registerWorkflow(def: WorkflowDefinition): Promise<void> {
    this.definitions.set(def.id, def);
    const g = new Graph({ directed: true, multigraph: false, compound: false });
    for (const node of def.nodes) g.setNode(node.id, node);
    for (const edge of def.edges) g.setEdge(edge.from, edge.to, edge);
    this.graphs.set(def.id, g);
  }

  private getGraph(definitionId: string): Graph {
    const g = this.graphs.get(definitionId);
    if (!g) throw new Error(`Workflow '${definitionId}' not found`);
    return g;
  }

  // ── Kahn 拓扑排序, 返回分层数组 ─────────────────
  resolveExecutionOrder(definitionId: string): string[][] {
    const g = this.getGraph(definitionId);
    const inDegree = new Map<string, number>();
    const queue: string[] = [];
    const order: string[][] = [];
    const visited = new Set<string>();

    g.nodes().forEach(id => {
      const deg = (g.inEdges(id) || []).length;
      inDegree.set(id, deg);
      if (deg === 0) queue.push(id);
    });

    while (queue.length > 0) {
      const layer: string[] = [];
      const size = queue.length;
      for (let i = 0; i < size; i++) {
        const id = queue.shift()!;
        if (visited.has(id)) continue;
        visited.add(id);
        layer.push(id);
        for (const e of g.outEdges(id) || []) {
          const nd = (inDegree.get(e.w)! - 1);
          inDegree.set(e.w, nd);
          if (nd === 0) queue.push(e.w);
        }
      }
      if (layer.length) order.push(layer);
    }
    return order;
  }

  // ── 执行工作流实例 ──────────────────────────────
  async execute(instance: WorkflowInstance): Promise<WorkflowResult> {
    this.instances.set(instance.id, instance);
    instance.status = "running";
    instance.startedAt = instance.startedAt || Date.now();

    // P0: 保存初始状态到 DB (崩溃恢复)
    await this.saveInstanceState(instance);

    // P1-5: 初始化重试预算
    const defForBudget = this.definitions.get(instance.definitionId);
    const totalBudget = defForBudget ? WorkflowRunner.computeTotalBudget(defForBudget) : 0;
    if (totalBudget > 0) {
      this.initRetryBudgets(instance.id, totalBudget);
      console.log(`[WorkflowRunner] ${instance.id} initialized retry budget: ${totalBudget}`);
    }

    const layers = this.resolveExecutionOrder(instance.definitionId);
    const ac = this.abortControllers.get(instance.id) || new AbortController();
    this.abortControllers.set(instance.id, ac);

    try {
      for (const layer of layers) {
        if (ac.signal.aborted) break;
        // P1: 恢复时跳过已完成的节点
        const pendingLayer = layer.filter(id => instance.nodeStates.get(id) !== "completed" && instance.nodeStates.get(id) !== "skipped");
        if (pendingLayer.length === 0) continue;
        const results = await Promise.allSettled(
          pendingLayer.map(nodeId => this.executeNode(nodeId, instance, ac.signal))
        );
        for (let i = 0; i < pendingLayer.length; i++) {
          const r = results[i];
          const nodeId = pendingLayer[i];
          if (r.status === "fulfilled") {
            const nr = r.value;
            if (nr.output) instance.context.data.set(nodeId, nr.output);
            instance.nodeStates.set(nodeId, nr.state);
            this.emit("node:state-change", nodeId, nr.state, nr.output);
          } else {
            instance.nodeStates.set(nodeId, "failed");
            this.emit("node:state-change", nodeId, "failed", null);
          }
        }
        // P0: 每层完成后保存状态
        await this.saveInstanceState(instance);
      }
      instance.status = ac.signal.aborted ? "paused" : "completed";
    } catch (err) {
      instance.status = "failed";
    }
    instance.completedAt = Date.now();
    // P0: 最终状态持久化
    await this.saveInstanceState(instance);
    // P1-5: 释放预算
    this.releaseRetryBudget(instance.id);
    this.emit("workflow:complete", instance.id, instance.status);
    return { instanceId: instance.id, status: instance.status };
  }

  // ── 执行单个节点 ────────────────────────────────
  private async executeNode(nodeId: string, instance: WorkflowInstance, signal: AbortSignal): Promise<NodeResult> {
    const def = this.definitions.get(instance.definitionId);
    if (!def) return { nodeId, state: "failed", error: new Error(`Definition ${instance.definitionId} not found`) };
    const node = def.nodes.find(n => n.id === nodeId);
    if (!node) return { nodeId, state: "failed", error: new Error(`Node ${nodeId} not found`) };

    const ctx = instance.context;
    nodeStatesOrInit(instance, nodeId, "running");
    this.emit("node:state-change", nodeId, "running");

    // P1 fix: 节点级别超时保护，防止 LLM 调用永久挂起
    const nodeTimeoutMs = node.config.timeoutMs || 120000;
    const nodeTimeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Node ${nodeId} timeout after ${nodeTimeoutMs}ms`)), nodeTimeoutMs)
    );

    try {
      const boundInput = this.bindInputs(node, ctx);

      // P1 fix: 节点执行带超时保护
      const executeWork = async (): Promise<NodeResult> => {
        switch (node.type) {
        case "agent": {
          const agentRole = node.agentRole;
          if (!agentRole) return { nodeId, state: "failed", error: new Error("agent node missing agentRole") };

          // P0 fix: 构建完整 AgentContext 并传递给 init/execute
          const agentCtx: AgentContext = {
            instanceId: `${instance.id}:${nodeId}`, nodeId, projectId: ctx.projectId,
            input: boundInput, abortSignal: signal,
            memoryBus: this.memoryBus, rulesEngine: this.rulesEngine,
            skillsRegistry: this.skillsRegistry, mcpConnector: this.mcpConnector,
            config: ctx.config,
          };
          const agent = await this.agentRegistry.createInstance(agentRole, agentCtx);
          await agent.init(agentCtx);
          const result = await agent.execute(agentCtx);
          await agent.cleanup(agentCtx);

          if (node.config.reviewGate && result.success) {
            const reviewResult = await this.executeReviewGate(node, result.data, ctx, instance.id);
            if (!reviewResult.passed) {
              return await this.retryNode(node, instance, signal, reviewResult);
            }
          }
          return { nodeId, state: "completed", output: result.data };
        }
        case "review-gate": {
          const data = boundInput.content || boundInput;
          try {
            const reviewResult = await this.executeReviewGate(node, data, ctx, instance.id);
            console.log(`[WorkflowRunner] ${nodeId} review: passed=${reviewResult.passed}, score=${reviewResult.totalScore}`);
            if (reviewResult.passed) {
              return { nodeId, state: "completed", output: reviewResult };
            }
            const onReject = node.config.reviewGate?.onReject || "retry";
            console.warn(`[WorkflowRunner] ${nodeId} review NOT passed (score=${reviewResult.totalScore}), onReject=${onReject}`);
            if (onReject === "skip") {
              return { nodeId, state: "skipped", output: reviewResult };
            }
            if (onReject === "pause") {
              instance.status = "paused";
              return { nodeId, state: "failed", output: reviewResult };
            }
            return { nodeId, state: "failed", output: reviewResult };
          } catch (reviewErr: any) {
            console.error(`[WorkflowRunner] ${nodeId} review CRASHED:`, reviewErr?.message || reviewErr);
            return { nodeId, state: "failed", error: reviewErr };
          }
        }
        case "parallel-fork": {
          const items = boundInput.items || [];
          const degree = node.config.parallelDegree || 4;
          const results: any[] = [];
          for (let i = 0; i < items.length; i += degree) {
            const batch = items.slice(i, i + degree);
            const batchResults = await Promise.all(batch.map(async (item: any, bi: number) => {
              const def = this.definitions.get(instance.definitionId);
              const downEdges = def ? def.edges.filter((e: any) => e.from === nodeId) : [];
              const workId = (downEdges.length > 0 ? downEdges[0].to : undefined) as string;
              const wNode = workId && def ? def.nodes.find((n: any) => n.id === workId) : null;
              if (!wNode || !wNode.agentRole) return { item };
              try {
                // P0-3 fix: 传递 currentItem 给 bindInputs 以支持 ${item}
                const agentCtx: AgentContext = {
                  instanceId: instance.id + ":" + nodeId + "-" + workId + "-" + bi,
                  nodeId: workId, projectId: ctx.projectId,
                  input: this.bindInputs(wNode, ctx, item),
                  abortSignal: signal, memoryBus: this.memoryBus, rulesEngine: this.rulesEngine,
                  skillsRegistry: this.skillsRegistry, mcpConnector: this.mcpConnector, config: ctx.config,
                };
                const agent = await this.agentRegistry.createInstance(wNode.agentRole, agentCtx);
                await agent.init(agentCtx);
                const result = await agent.execute(agentCtx);
                await agent.cleanup(agentCtx);
                return { item, result: result.data };
              } catch(err) { return { item, error: String(err) }; }
            }));
            results.push(...batchResults);
          }
          return { nodeId, state: "completed", output: { results } };
        }
        case "parallel-join": {
          // P1 fix: 合并所有上游 parallel-fork 的 results，输出统一为数组
          let all: any[] = [];
          ctx.data.forEach((val: any) => {
            if (val && typeof val === "object") {
              if (Array.isArray(val.results)) all = all.concat(val.results);
              else if (Array.isArray(val)) all = all.concat(val);
            }
          });
          return { nodeId, state: "completed", output: all };
        }
        case "script": {
          const scriptId = (node as any).scriptId;
          if (scriptId && this.scriptExecutor) {
            const script = this.scriptExecutor.getScript(scriptId);
            if (!script) throw new Error(`Script '${scriptId}' not found`);
            const scriptOutput = await this.scriptExecutor.execute(script, boundInput);
            return { nodeId, state: "completed", output: scriptOutput };
          }
          return { nodeId, state: "completed", output: boundInput };
        }
        default:
          return { nodeId, state: "completed", output: boundInput };
        }
      }; // end executeWork

      return await Promise.race([executeWork(), nodeTimeout]);
    } catch (err: any) {
      console.error(`[WorkflowRunner] Node ${nodeId} failed:`, err?.message || err);
      return { nodeId, state: "failed", error: err };
    }
  }

  // ── 绑定输入 ─────────────────────────────────────
  resolvePath(path: string, ctx: WorkflowContext): any {
    // P1 fix: 支持数组下标，如 "a.b[0].c"
    const parts = path.split(".");
    // 先尝试从 data map 解析（保持向后兼容）
    for (let i = parts.length; i >= 1; i--) {
      const nodeId = parts.slice(0, i).join(".");
      const remaining = parts.slice(i);
      const nodeData = ctx.data.get(nodeId);
      if (nodeData !== undefined) {
        let current: any = nodeData;
        for (const key of remaining) {
          if (current == null) return undefined;
          // P1 fix: 支持数组下标 [N]
          const arrMatch = key.match(/^(\w+)\[(\d+)\]$/);
          if (arrMatch) {
            const arrKey = arrMatch[1];
            const idx = parseInt(arrMatch[2], 10);
            current = current[arrKey];
            if (Array.isArray(current)) current = current[idx];
            else return undefined;
          } else if (current && typeof current === "object") {
            current = current[key];
          } else {
            return undefined;
          }
        }
        return current;
      }
    }
    // 回退到 ctx.config（支持 ${config.xxx} 绑定）
    if (path.startsWith("config.")) {
      const key = path.slice(7);
      return ctx.config[key];
    }
    // 最后尝试直接从 ctx.config 查找
    return ctx.config[path];
  }

  /**
   * P0-3 fix: 支持 ${item} 特殊变量（parallel-fork 场景）
   * @param currentItem 当前批次的 item（仅 parallel-fork 时传入）
   */
  public bindInputs(node: WorkflowNode, ctx: WorkflowContext, currentItem?: any): Record<string, any> {
    // P1 fix: 防御 node.input 为空（parallel-join/script 节点可能无 input）
    const staticInput = (node.input?.static) || {};
    const bindings = (node.input?.bindings) || {};
    const result: Record<string, any> = { ...staticInput };
    for (const [key, path] of Object.entries(bindings)) {
      const clean = (path as string).replace(/\$\{([^}]+)\}/g, "$1");
      // P0-3 fix: 支持 ${item} 特殊变量
      if (clean === "item" && currentItem !== undefined) {
        result[key] = currentItem;
        continue;
      }
      const value = this.resolvePath(clean, ctx);
      if (value !== undefined) result[key] = value;
    }
    return result;
  }

  // ── 执行审核关卡 — P1-3: 使用 harness 全局 ReviewPipeline，注入 RulesEngine + MemoryBus ─
  private async executeReviewGate(node: WorkflowNode, output: any, _ctx: WorkflowContext, instanceId: string): Promise<any> {
    if (!node.config.reviewGate) return { passed: true };
    const gate = node.config.reviewGate;

    // P1-3: 复用 harness 全局 pipeline（避免每次 new 一个无法共享 rulesEngine）
    const pipeline = WorkflowRunner.sharedReviewPipeline;
    if (!pipeline) {
      console.warn("[WorkflowRunner] ReviewPipeline not initialized, skipping review-gate");
      return { passed: true };
    }

    // 尝试找出该节点的源 agentRole (从 instance.definitionId 获取节点定义)
    const def = this.definitions.get(instanceId.split(":")[0]) || [...this.definitions.values()].find(d => d.nodes.some(n => n.id === node.id));
    const nodeDef = def?.nodes.find(n => n.id === node.id);
    const upstreamAgent = this.findUpstreamAgent(def, node.id) || "unknown";
    const criteria = gate.criteria.length > 0 ? gate.criteria : pipeline.loadCriteriaForAgent(upstreamAgent).criteria;

    const result = await pipeline.review(
      upstreamAgent,
      output,
      _ctx,
    );

    const retryInstruction = result.passed
      ? undefined
      : await pipeline.generateRetryInstruction(
        upstreamAgent,
        output,
        result,
        1,
        node.config.retry?.maxRetries || 1,
      );

    await harnessEventBus.emitEvent({
      kind: "review.scored",
      taskId: node.id,
      reviewer: gate.reviewerAgentId,
      instanceId,
      overall: result.overall,
      passed: result.passed,
      scores: result,
      feedback: result.feedback,
      timestamp: Date.now(),
    } as any);

    return {
      passed: result.passed,
      totalScore: result.overall,
      scores: result,
      feedback: result.feedback,
      agentId: upstreamAgent,
      retryInstruction,
      criteria: criteria.map(c => c.name),
    };
  }

  /** 查找节点的最近上游 agentRole */
  private findUpstreamAgent(def: WorkflowDefinition | undefined, nodeId: string): string | null {
    if (!def) return null;
    const incoming = def.edges.filter(e => e.to === nodeId);
    for (const e of incoming) {
      const upstream = def.nodes.find(n => n.id === e.from);
      if (upstream?.agentRole) return upstream.agentRole;
      const deeper = this.findUpstreamAgent(def, upstream?.id || "");
      if (deeper) return deeper;
    }
    return null;
  }

  // P1-3: 全局共享 ReviewPipeline 单例
  static sharedReviewPipeline: ReviewPipeline | null = null;

  static initReviewPipeline(pipeline: ReviewPipeline): void {
    WorkflowRunner.sharedReviewPipeline = pipeline;
  }

  // ── 重试节点 ─────────────────────────────────────
  private async retryNode(
    node: WorkflowNode, instance: WorkflowInstance, signal: AbortSignal, reviewResult: any
  ): Promise<NodeResult> {
    const nodeId = node.id;
    const ctx = instance.context;
    const maxRetries = node.config.retry.maxRetries;
    const budget = node.config.globalRetryBudget;

    await harnessEventBus.emitEvent({
      kind: "review.reroute",
      taskId: nodeId,
      fromAgent: reviewResult.agentId || "review-gate",
      toAgent: node.agentRole || "unknown",
      instanceId: instance.id,
      reason: reviewResult.feedback || `Review score ${reviewResult.totalScore} below threshold`,
      retryInstruction: reviewResult.retryInstruction || reviewResult,
      userInputRequired: false,
      timestamp: Date.now(),
    } as any);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      // P1-5: 预算检查
      if (budget !== undefined && !node.config.criticalNode) {
        const remaining = this.getRetryBudget(instance.id);
        if (remaining <= 0) {
          console.warn(`[WorkflowRunner] ${instance.id} ${nodeId}: global retry budget exhausted, skipping remaining retries`);
          // 非关键节点 — 跳过重试，标记为 skipped 而非 failed
          return { nodeId, state: "skipped", output: reviewResult };
        }
        this.consumeRetryBudget(instance.id, 1);
      }

      const backoff = node.config.retry.backoffMs * Math.pow(node.config.retry.backoffMultiplier, attempt - 1);
      await new Promise(r => setTimeout(r, backoff));
      try {
        // P0 fix: 传递 AgentContext 给 init/execute
        const agentCtx: AgentContext = {
          instanceId: `${instance.id}:${nodeId}-r${attempt}`, nodeId, projectId: ctx.projectId,
          input: { ...this.bindInputs(node, ctx), retryInstruction: reviewResult },
          abortSignal: signal,
          memoryBus: this.memoryBus, rulesEngine: this.rulesEngine,
          skillsRegistry: this.skillsRegistry, mcpConnector: this.mcpConnector, config: ctx.config,
        };
        const agent = await this.agentRegistry.createInstance(node.agentRole!, agentCtx);
        await agent.init(agentCtx);
        const result = await agent.execute(agentCtx);
        await agent.cleanup(agentCtx);
        if (result.success) return { nodeId, state: "completed", output: result.data };
      } catch { /* retry */ }
    }
    return { nodeId, state: "failed", error: new Error(`Max retries (${maxRetries}) exceeded (budget: ${budget ?? "unlimited"})`) };
  }

  // ── P1-5: 重试预算管理 ────────────────────────────
  private retryBudgets = new Map<string, number>();  // instanceId -> remaining

  /** 初始化预算 (在 execute() 开始时调用) */
  initRetryBudgets(instanceId: string, totalBudget: number): void {
    this.retryBudgets.set(instanceId, totalBudget);
  }

  /** 释放预算 (实例结束后清理) */
  releaseRetryBudget(instanceId: string): void {
    this.retryBudgets.delete(instanceId);
  }

  /** 获取剩余预算 */
  getRetryBudget(instanceId: string): number {
    return this.retryBudgets.get(instanceId) ?? Infinity;
  }

  /** 消耗 1 单位预算 */
  consumeRetryBudget(instanceId: string, n: number = 1): number {
    const cur = this.retryBudgets.get(instanceId);
    if (cur === undefined) return Infinity;
    const next = Math.max(0, cur - n);
    this.retryBudgets.set(instanceId, next);
    return next;
  }

  /** 累加全局预算 (从所有节点的 globalRetryBudget 求和) */
  static computeTotalBudget(def: WorkflowDefinition): number {
    let total = 0;
    for (const node of def.nodes) {
      if (node.config.globalRetryBudget !== undefined) total += node.config.globalRetryBudget;
    }
    return total;
  }

  // ── 暂停 / 恢复 / 取消 ──────────────────────────
  async pause(instanceId: string): Promise<void> {
    const ac = this.abortControllers.get(instanceId);
    if (ac) ac.abort();
    const inst = this.instances.get(instanceId);
    if (inst) inst.status = "paused";
    this.emit("node:state-change", instanceId, "paused");
  }

  async resume(instanceId: string): Promise<WorkflowResult> {
    const inst = this.instances.get(instanceId);
    if (!inst) throw new Error(`Instance ${instanceId} not found`);
    if (inst.status !== "paused") throw new Error("Instance not paused");
    return this.execute(inst);
  }

  async cancel(instanceId: string): Promise<void> {
    const ac = this.abortControllers.get(instanceId);
    if (ac) ac.abort();
    const inst = this.instances.get(instanceId);
    if (inst) inst.status = "failed";
  }

  // ── 状态持久化 ──────────────────────────────────
  async saveInstanceState(instance: WorkflowInstance): Promise<void> {
    try {
      const { db } = await import("@/utils/db");
      const nodeStates: Record<string, string> = {};
      instance.nodeStates.forEach((v, k) => { nodeStates[k] = v; });
      const contextRefs: Record<string, string[]> = {};
      instance.context.data.forEach((v, k) => {
        contextRefs[k] = typeof v === "object" ? Object.keys(v) : [];
      });
      await db("o_workflow_state")
        .insert({
          id: instance.id, definitionId: instance.definitionId, status: instance.status,
          nodeStates: JSON.stringify(nodeStates), contextRefs: JSON.stringify(contextRefs),
          startedAt: instance.startedAt, completedAt: instance.completedAt,
          projectId: instance.context.projectId, userId: instance.context.userId,
        })
        .onConflict("id").merge();
    } catch (err) {
      console.warn("[WorkflowRunner] Failed to save state:", err);
    }
  }

  async loadInstanceState(instanceId: string): Promise<WorkflowInstance | null> {
    try {
      const { db } = await import("@/utils/db");
      const row = await db("o_workflow_state").where("id", instanceId).first();
      if (!row) return null;
      const nodeStates = new Map<string, any>();
      const ns = JSON.parse(row.nodeStates || "{}");
      for (const [k, v] of Object.entries(ns)) nodeStates.set(k, v);
      return {
        id: row.id, definitionId: row.definitionId, status: row.status,
        nodeStates,
        context: { data: new Map(), projectId: row.projectId || 0, userId: row.userId || 0, config: {} },
        startedAt: row.startedAt, completedAt: row.completedAt,
      };
    } catch (err) {
      console.warn("[WorkflowRunner] Failed to load state:", err);
      return null;
    }
  }

  async deleteInstanceState(instanceId: string): Promise<void> {
    try {
      const { db } = await import("@/utils/db");
      await db("o_workflow_state").where("id", instanceId).del();
    } catch (err) {
      console.warn("[WorkflowRunner] Failed to delete state:", err);
    }
  }
}

function nodeStatesOrInit(instance: WorkflowInstance, nodeId: string, state: string): void {
  if (!instance.nodeStates.has(nodeId)) instance.nodeStates.set(nodeId, state as NodeState);
}
