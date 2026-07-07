/**
 * DirectorLLMPlanner — 导演 Agent 的 LLM 决策器
 *
 * 基于当前任务图 + 已完成产物, LLM 决策:
 * 1. 下一步派哪个工种 (dispatch)
 * 2. 等待 (wait)
 * 3. 询问用户 (ask_user)
 * 4. 跨工种驳回 (reroute)
 * 5. 完成 (complete)
 *
 * LLM 输出必须是结构化 JSON, 失败时降级到 YAML 模板顺序决策。
 */
import Ai from "@/utils/ai";
import type { TaskNode, FilmAgentRole } from "./types";

export interface PlannerState {
  instanceId: string;
  completedTasks: Array<{ agentRole: string; success: boolean; outputSummary: string }>;
  pendingTasks: string[];           // 待执行的工种列表
  novelLength: number;
  hasScript: boolean;
  hasStoryboard: boolean;
  hasArtDepartment: boolean;        // 服装/化妆/置景 完成
  imageCount: number;               // 已生成图片数
  totalShots: number;               // 总分镜数
  videoCount: number;               // 已生成视频数
  userMessage?: string;             // 用户最新消息
  lastError?: string;               // 最近错误
}

export interface DirectorDecision {
  action: "dispatch" | "wait" | "ask_user" | "reroute" | "complete";
  nextTask?: TaskNode;
  userPrompt?: string;
  userOptions?: string[];
  message: string;
  rerouteTo?: FilmAgentRole;
  skipAgents?: FilmAgentRole[];
}

const SYSTEM_PROMPT = `你是 Toonflow 影视项目的导演 Agent, 是整个 Harness 的调度者。

## 你的职责
1. 接收制片人转交的项目信息
2. 基于 LLM 决策, 动态派遣任务给 13 个工种 Agent
3. 监制 Agent 报告审核结果后, 决定驳回还是通过
4. 与用户对话, 汇报进度、接收调整指令

## 你的决策必须是结构化 JSON:
{
  "action": "dispatch" | "wait" | "ask_user" | "reroute" | "complete",
  "nextTask": {
    "id": "task-<uuid>",
    "agentRole": "<role>",
    "bindings": {},
    "static": {},
    "timeoutMs": 300000
  } | null,
  "userPrompt": "string" | null,
  "userOptions": ["A", "B"] | null,
  "message": "给用户的中文说明"
}

## 决策原则
- 无剧本 → 派编剧 (screenwriter)
- 剧本通过 → 派副导演 (assistant_director) 拆分镜
- 分镜通过 → 美术部三工种并行 (costume + makeup + set_decorator)
- 美术通过 → 派 DP (dp) 按 shot 并行生图
- 图片全通过 → 派视效 (vfx) 生视频
- 视频全通过 → 剪辑 (editor) + 录音 (sound_designer) 并行
- 全部完成 → complete
- 涉及剧本/角色的驳回 → ask_user
- 涉及 prompt/workflow 的驳回 → 自动 reroute
- 用户说"跳过某环节" → 在 nextTask 中 skipAgents 标注

## 可用工种
producer(制片人) / screenwriter(编剧) / assistant_director(副导演) / supervisor(监制) /
script_supervisor(场记) / dp(摄影指导) / lighting(灯光) / costume(服装) / makeup(化妆) /
wardrobe(服装穿戴) / set_decorator(置景) / sound(录音) / sound_designer(声音设计) /
editor(剪辑) / vfx(视效)`;

export class DirectorLLMPlanner {
  /**
   * 决策下一步
   */
  async planNextStep(state: PlannerState): Promise<DirectorDecision> {
    try {
      const userPrompt = this.buildPrompt(state);
      const result = await Ai.Text("universalAi", false, 0.3).invoke({
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      });

      const cleaned = result.text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) {
        return this.fallbackDecision(state);
      }

      const decision = JSON.parse(match[0]) as DirectorDecision;
      return this.validateDecision(decision, state);
    } catch (err) {
      console.warn("[DirectorLLMPlanner] LLM decision failed, using fallback:", err instanceof Error ? err.message : err);
      return this.fallbackDecision(state);
    }
  }

  /**
   * 决策驳回目标
   */
  async decideReroute(
    failedAgent: string,
    reviewScore: any,
    reviewFeedback: string,
    history: Array<{ fromAgent: string; toAgent: string; reason: string }>,
  ): Promise<{
    action: "reroute" | "ask_user";
    targetAgent: string;
    retryInstruction?: { suggestions: string[]; userInputRequired: boolean };
    userPrompt?: string;
    userOptions?: string[];
  }> {
    try {
      const prompt = `你是监制 Agent。审核失败, 请决策打回给谁。

失败的工种: ${failedAgent}
评分: ${JSON.stringify(reviewScore)}
反馈: ${reviewFeedback}
历史驳回: ${JSON.stringify(history.slice(-5))}

请输出 JSON:
{
  "action": "reroute" | "ask_user",
  "targetAgent": "<role>",
  "retryInstruction": { "suggestions": ["建议1", "建议2"], "userInputRequired": false },
  "userPrompt": "string" | null,
  "userOptions": ["A", "B"] | null
}

决策原则:
- 技术问题 → reroute 给原工种
- 艺术问题 → reroute 给原工种
- 内容问题 (与剧本不符) → ask_user
- 角色不一致 → reroute 给 costume/makeup
- 已重试 2 次仍失败 → ask_user`;

      const result = await Ai.Text("universalAi", false, 0.3).invoke({
        messages: [
          { role: "system", content: "你是监制 Agent, 负责审核驳回决策。输出必须是 JSON。" },
          { role: "user", content: prompt },
        ],
      });

      const cleaned = result.text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) {
        return { action: "ask_user", targetAgent: failedAgent, userPrompt: `${failedAgent} 审核失败, 请人工确认`, userOptions: ["重做", "跳过"] };
      }
      return JSON.parse(match[0]);
    } catch {
      return { action: "ask_user", targetAgent: failedAgent, userPrompt: `${failedAgent} 审核失败, 请人工确认`, userOptions: ["重做", "跳过"] };
    }
  }

  /**
   * 解析用户对话意图
   */
  async parseUserIntent(message: string, state: PlannerState): Promise<DirectorDecision> {
    try {
      const prompt = `用户说了: "${message}"

当前状态: 已完成 ${state.completedTasks.length} 个任务, ${state.pendingTasks.length} 个待执行。

请把用户意图解析为决策 JSON:
{
  "action": "dispatch" | "reroute" | "ask_user" | "complete",
  "nextTask": { "agentRole": "<role>", ... } | null,
  "message": "给用户的中文回复",
  "skipAgents": ["<role>"] | null,
  "rerouteTo": "<role>" | null
}

示例:
- "把场 3 对白改短" → { action: "dispatch", nextTask: { agentRole: "screenwriter", static: { stage: "revise", retryInstruction: { suggestions: ["场 3 对白缩短 30%"] } } } }
- "跳过服装直接生图" → { action: "dispatch", nextTask: { agentRole: "dp" }, skipAgents: ["costume", "makeup"] }
- "暂停" → { action: "ask_user", userPrompt: "已暂停, 需要继续吗?", userOptions: ["继续", "取消"] }`;

      const result = await Ai.Text("universalAi", false, 0.3).invoke({
        messages: [
          { role: "system", content: "你是导演 Agent, 负责解析用户意图。输出必须是 JSON。" },
          { role: "user", content: prompt },
        ],
      });

      const cleaned = result.text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) {
        return { action: "ask_user", message: `收到您的消息: "${message}", 我会处理。` };
      }
      return JSON.parse(match[0]) as DirectorDecision;
    } catch {
      return { action: "ask_user", message: `收到您的消息: "${message}", 我会处理。` };
    }
  }

  // ── 私有方法 ──────────────────────────────────

  /** 构造 LLM prompt */
  private buildPrompt(state: PlannerState): string {
    const completed = state.completedTasks.map(t => `${t.agentRole}: ${t.success ? "✓" : "✗"} (${t.outputSummary})`).join("\n");
    const pending = state.pendingTasks.join(", ") || "无";

    return `当前 Harness 状态:
- 实例: ${state.instanceId}
- 小说长度: ${state.novelLength} 字
- 已完成任务:
${completed || "  (无)"}
- 待执行工种: ${pending}
- 已有剧本: ${state.hasScript}
- 已有分镜: ${state.hasStoryboard} (${state.totalShots} 个)
- 美术部完成: ${state.hasArtDepartment}
- 已生成图片: ${state.imageCount}/${state.totalShots}
- 已生成视频: ${state.videoCount}/${state.totalShots}
${state.userMessage ? `- 用户最新消息: ${state.userMessage}` : ""}
${state.lastError ? `- 最近错误: ${state.lastError}` : ""}

请决策下一步:`;
  }

  /** 校验决策 */
  private validateDecision(decision: DirectorDecision, state: PlannerState): DirectorDecision {
    // 确保 action 有效
    const validActions = ["dispatch", "wait", "ask_user", "reroute", "complete"];
    if (!validActions.includes(decision.action)) {
      return this.fallbackDecision(state);
    }

    // dispatch 时确保有 nextTask
    if (decision.action === "dispatch" && !decision.nextTask?.agentRole) {
      return this.fallbackDecision(state);
    }

    // 补充 message
    if (!decision.message) {
      decision.message = this.defaultMessage(decision, state);
    }

    return decision;
  }

  /** 降级决策 (LLM 失败时用简单顺序逻辑) */
  private fallbackDecision(state: PlannerState): DirectorDecision {
    if (!state.hasScript) {
      return {
        action: "dispatch",
        nextTask: { id: `sw-${Date.now()}`, agentRole: "screenwriter", bindings: {}, static: { stage: "generate" }, timeoutMs: 300000 },
        message: "派编剧生成剧本",
      };
    }
    if (!state.hasStoryboard) {
      return {
        action: "dispatch",
        nextTask: { id: `ad-${Date.now()}`, agentRole: "assistant_director", bindings: {}, static: {}, timeoutMs: 300000 },
        message: "派副导演拆解分镜",
      };
    }
    if (!state.hasArtDepartment) {
      return {
        action: "dispatch",
        nextTask: { id: `art-${Date.now()}`, agentRole: "costume", bindings: {}, static: {}, timeoutMs: 120000 },
        message: "派美术部 (服装/化妆/置景) 并行",
      };
    }
    if (state.imageCount < state.totalShots) {
      return {
        action: "dispatch",
        nextTask: { id: `dp-${Date.now()}`, agentRole: "dp", bindings: {}, static: {}, timeoutMs: 600000 },
        message: `派 DP 生图 (${state.imageCount}/${state.totalShots})`,
      };
    }
    if (state.videoCount < state.totalShots) {
      return {
        action: "dispatch",
        nextTask: { id: `vfx-${Date.now()}`, agentRole: "vfx", bindings: {}, static: {}, timeoutMs: 600000 },
        message: `派视效生视频 (${state.videoCount}/${state.totalShots})`,
      };
    }
    return { action: "complete", message: "全部工种已完成!" };
  }

  private defaultMessage(decision: DirectorDecision, state: PlannerState): string {
    switch (decision.action) {
      case "dispatch": return `派 ${decision.nextTask?.agentRole} 执行任务`;
      case "wait": return "等待中...";
      case "ask_user": return decision.userPrompt || "请确认";
      case "reroute": return `打回给 ${decision.rerouteTo}`;
      case "complete": return "全部完成!";
      default: return "继续执行";
    }
  }
}
