/**
 * TaskGraph — 动态任务图数据结构
 *
 * 由导演 Agent (DirectorOrchestrator) 通过 LLM 决策动态生成,
 * 支持运行时增删节点、跨工种依赖。
 *
 * 与 WorkflowRunner 的静态 YAML DAG 不同, TaskGraph 是动态的:
 * - 导演 Agent 可以根据审核结果插入新任务 (如 reroute)
 * - 可以跳过某些任务 (如用户说"跳过服装环节")
 * - 可以并行派发多个任务 (parallelWith)
 */
import type { TaskNode } from "./types";

export type TaskNodeState =
  | "pending"       // 待执行
  | "running"       // 执行中
  | "reviewing"     // 审核中
  | "completed"     // 已完成
  | "failed"        // 失败
  | "skipped"       // 跳过
  | "rerouted";     // 已打回

export interface TaskNodeRuntime {
  node: TaskNode;
  state: TaskNodeState;
  output?: any;
  error?: string;
  attemptCount: number;
  startedAt?: number;
  completedAt?: number;
  reviewScore?: any;
}

export class TaskGraph {
  private nodes = new Map<string, TaskNodeRuntime>();
  private instanceId: string;

  constructor(instanceId: string) {
    this.instanceId = instanceId;
  }

  /** 添加任务节点 */
  addTask(node: TaskNode): void {
    if (this.nodes.has(node.id)) {
      throw new Error(`Task ${node.id} already exists in graph`);
    }
    this.nodes.set(node.id, {
      node,
      state: "pending",
      attemptCount: 0,
    });
  }

  /** 批量添加任务 */
  addTasks(nodes: TaskNode[]): void {
    for (const node of nodes) this.addTask(node);
  }

  /** 移除任务节点 */
  removeTask(taskId: string): boolean {
    return this.nodes.delete(taskId);
  }

  /** 获取任务 */
  getTask(taskId: string): TaskNodeRuntime | undefined {
    return this.nodes.get(taskId);
  }

  /** 更新任务状态 */
  updateState(taskId: string, state: TaskNodeState, updates?: Partial<TaskNodeRuntime>): void {
    const task = this.nodes.get(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    task.state = state;
    if (updates) {
      Object.assign(task, updates);
    }
    if (state === "running" && !task.startedAt) {
      task.startedAt = Date.now();
    }
    if (state === "completed" || state === "failed" || state === "skipped") {
      task.completedAt = Date.now();
    }
  }

  /** 获取所有任务 */
  getAllTasks(): TaskNodeRuntime[] {
    return Array.from(this.nodes.values());
  }

  /** 获取待执行的任务 (依赖已满足) */
  getReadyTasks(): TaskNodeRuntime[] {
    return this.getAllTasks().filter(t => {
      if (t.state !== "pending") return false;
      // 检查依赖
      const deps = t.node.dependsOn || [];
      return deps.every(depId => {
        const dep = this.nodes.get(depId);
        return dep && (dep.state === "completed" || dep.state === "skipped");
      });
    });
  }

  /** 获取并行任务组 (parallelWith 相同的任务) */
  getParallelGroup(taskId: string): TaskNodeRuntime[] {
    const task = this.nodes.get(taskId);
    if (!task) return [];
    const group = task.node.parallelWith || [];
    if (group.length === 0) return [task];
    return [task, ...group.map(id => this.nodes.get(id)).filter(Boolean) as TaskNodeRuntime[]];
  }

  /** 是否全部完成 */
  isAllCompleted(): boolean {
    return this.getAllTasks().every(t =>
      t.state === "completed" || t.state === "failed" || t.state === "skipped",
    );
  }

  /** 获取进度统计 */
  getStats(): { total: number; pending: number; running: number; completed: number; failed: number; skipped: number } {
    const tasks = this.getAllTasks();
    return {
      total: tasks.length,
      pending: tasks.filter(t => t.state === "pending").length,
      running: tasks.filter(t => t.state === "running").length,
      completed: tasks.filter(t => t.state === "completed").length,
      failed: tasks.filter(t => t.state === "failed").length,
      skipped: tasks.filter(t => t.state === "skipped").length,
    };
  }

  /** 序列化为 JSON (持久化到 o_workflow_state.taskGraph) */
  toJSON(): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [id, runtime] of this.nodes) {
      result[id] = {
        node: runtime.node,
        state: runtime.state,
        output: runtime.output,
        error: runtime.error,
        attemptCount: runtime.attemptCount,
        startedAt: runtime.startedAt,
        completedAt: runtime.completedAt,
      };
    }
    return result;
  }

  /** 从 JSON 恢复 */
  static fromJSON(instanceId: string, data: Record<string, any>): TaskGraph {
    const graph = new TaskGraph(instanceId);
    for (const [id, runtime] of Object.entries(data)) {
      graph.nodes.set(id, runtime as TaskNodeRuntime);
    }
    return graph;
  }
}
