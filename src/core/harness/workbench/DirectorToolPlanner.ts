import Ai from "@/utils/ai";
import { ToolRegistry } from "../tools/ToolRegistry";
import type { ActionPlan, ContextEntityRef, ProjectContext } from "./contracts";

export interface PlannedToolInstruction {
  plan: ActionPlan;
  toolName: string;
  input: Record<string, unknown>;
}

export class DirectorToolPlanner {
  constructor(private readonly registry: ToolRegistry) {}

  async plan(message: string, context: ProjectContext): Promise<PlannedToolInstruction> {
    const deterministic = this.planDeterministic(message, context);
    if (deterministic) return deterministic;
    return this.planWithModel(message, context);
  }

  private planDeterministic(message: string, context: ProjectContext): PlannedToolInstruction | undefined {
    if (/(当前|项目|制作|流程|现在).{0,8}(进度|状态|做到哪)|(?:进度|状态|做到哪).{0,8}(当前|项目|制作|流程|现在)|下一步是什么/.test(message)) {
      return this.build("director.project_status", {}, "查看当前项目制作进度", [], "读取真实产物状态并建议下一步");
    }

    const productionStage = this.resolveProductionStage(message, context);
    const selected = context.selected[0];
    if (productionStage && /(生成|重做|重新|制作|创建|改写|更新|优化)/.test(message)) {
      return this.buildProductionStage(productionStage, message, context);
    }
    if (/(审核|审查|质检|质量检查)/.test(message)) return this.buildReviewInstruction(message, context, selected);
    if (productionStage) return this.buildProductionStage(productionStage, message, context);

    const shot = context.selected.find(ref => ref.type === "shot");
    const shotSize = ["大远景", "远景", "全景", "中全景", "中景", "中近景", "近景", "特写", "大特写"].find(size => message.includes(size));
    if (shot && shotSize && /改|调整|设置|变成/.test(message)) {
      const preserve: string[] = [];
      if (/服装|造型|定妆/.test(message)) preserve.push("costume", "characterRefs");
      if (/场景|地点|环境/.test(message)) preserve.push("locationRef", "visualIdentity");
      return this.build("storyboard.update_shot", {
        shotId: shot.id,
        patch: { shotSize },
        preserve: [...new Set(preserve)],
        reason: message,
      }, `将 ${shot.label || shot.id} 的景别改为${shotSize}`, [shot]);
    }

    const createKind = /创建|新增|添加|生成/.test(message)
      ? (/人物|角色/.test(message) ? "character" : /道具/.test(message) ? "prop" : /地点|场景资产/.test(message) ? "location" : undefined)
      : undefined;
    if (createKind) {
      const name = this.extractName(message, createKind === "character" ? ["人物", "角色"] : createKind === "prop" ? ["道具"] : ["地点", "场景资产"]);
      if (name) return this.build(`${createKind}.create`, { name, description: message }, `创建${createKind === "character" ? "人物" : createKind === "prop" ? "道具" : "地点"}“${name}”`, []);
    }

    if (/创建|新增|添加/.test(message) && /场次|一场|场景/.test(message) && context.route.episodeId) {
      const title = this.extractQuoted(message) || message.replace(/请|帮我|创建|新增|添加|一个|一场|场次|场景/g, "").trim().slice(0, 40) || "新场次";
      return this.build("scene.create", { title, description: message }, `在当前剧集中创建场次“${title}”`, []);
    }

    if (selected && /查看|列出|历史|版本/.test(message) && /版本|历史/.test(message)) {
      return this.build("artifact.list_versions", { artifactType: selected.type, artifactId: selected.id }, `查询 ${selected.label || selected.id} 的版本历史`, [selected]);
    }

    const rollbackMatch = message.match(/(?:回滚|恢复).{0,8}(?:v|版本)?\s*(\d+)/i);
    if (selected && rollbackMatch && ["script", "beat", "scene", "shot", "character", "prop", "location"].includes(selected.type)) {
      return this.build("artifact.rollback", { artifactType: selected.type, artifactId: selected.id, version: Number(rollbackMatch[1]), reason: message }, `将 ${selected.label || selected.id} 回滚到版本 ${rollbackMatch[1]}`, [selected]);
    }
    const operationIntent = /创建|新增|添加|生成|制作|改|调整|设置|删除|回滚|恢复|审核|批准|重做|重试|继续|开始|启动|执行/.test(message);
    if (!operationIntent) return this.build("director.answer", { question: message }, "AI Director 项目答复", [], "基于当前项目上下文回答，不修改数据");
    return undefined;
  }

  private buildReviewInstruction(message: string, context: ProjectContext, selected?: ContextEntityRef): PlannedToolInstruction {
    const reviewable = new Set(["script", "beat", "scene", "shot", "character", "prop", "location", "video", "audio", "timeline"]);
    if (selected && reviewable.has(selected.type)) {
      return this.build("review.request", { artifactType: selected.type, artifactId: String(selected.id) }, `审核 ${selected.label || selected.id}`, [selected]);
    }

    const state = context.productionState;
    const recentStage = context.recentActionRuns.find(run => run.status === "completed" && run.stage)?.stage;
    let artifactType = "stage";
    let artifactId = "storySkeleton";
    let label = "故事骨架";

    if (/(故事骨架|剧情骨架|故事大纲|剧情大纲)/.test(message) && state.hasStorySkeleton) {
      artifactId = "storySkeleton"; label = "故事骨架";
    } else if (/(改编策略|改编方案)/.test(message) && state.hasAdaptationStrategy) {
      artifactId = "adaptationStrategy"; label = "改编策略";
    } else if (/(导演规划|拍摄规划|制片规划)/.test(message) && state.latestScriptId) {
      artifactId = `directorPlan:${state.latestScriptId}`; label = "导演规划";
    } else if (/(人物|角色|道具|场景|资产)/.test(message) && state.latestScriptId) {
      artifactId = `assets:${state.latestScriptId}`; label = "人物、场景与道具设定";
    } else if (/(分镜|镜头)/.test(message) && state.latestScriptId) {
      artifactId = `storyboard:${state.latestScriptId}`; label = "分镜规划";
    } else if (/(视频|影片|片段|成片)/.test(message) && state.latestVideoId) {
      artifactType = "video"; artifactId = state.latestVideoId; label = "最新视频";
    } else if (/(剧本|脚本)/.test(message) && state.latestScriptId) {
      artifactType = "script"; artifactId = state.latestScriptId; label = state.latestScriptName || "最新剧本";
    } else if (recentStage === "video" && state.latestVideoId) {
      artifactType = "video"; artifactId = state.latestVideoId; label = "最新视频";
    } else if (recentStage === "storyboard" && state.latestShotId) {
      artifactType = "shot"; artifactId = state.latestShotId; label = "最新分镜";
    } else if (recentStage === "assets" && state.latestScriptId) {
      artifactId = `assets:${state.latestScriptId}`; label = "人物、场景与道具设定";
    } else if (recentStage === "director_plan" && state.latestScriptId) {
      artifactId = `directorPlan:${state.latestScriptId}`; label = "导演规划";
    } else if (recentStage === "screenplay" && state.latestScriptId) {
      artifactType = "script"; artifactId = state.latestScriptId; label = state.latestScriptName || "最新剧本";
    } else if (["adaptation", "development"].includes(String(recentStage)) || state.hasAdaptationStrategy) {
      artifactId = "adaptationStrategy"; label = "改编策略";
    } else if (state.hasStorySkeleton) {
      artifactId = "storySkeleton"; label = "故事骨架";
    } else if (state.latestScriptId) {
      artifactType = "script"; artifactId = state.latestScriptId; label = state.latestScriptName || "最新剧本";
    } else {
      return this.build("director.answer", { question: "当前项目还没有可审核产物。请先生成故事骨架。" }, "检查可审核产物", [], "说明审核所需的前置产物");
    }

    return this.build("review.request", { artifactType, artifactId }, `审核${label}`, [], `Quality Supervisor 审核最近生成的${label}`);
  }

  private resolveProductionStage(message: string, context: ProjectContext): "skeleton" | "adaptation" | "development" | "screenplay" | "assets" | "director_plan" | "storyboard" | "video" | "pipeline" | undefined {
    if (/(完整流程|从小说到(?:电影|视频|成片)|从小说开始|启动.*制片|开始.*制片|一键.*制作|start.*production|novel.*(movie|video|production))/i.test(message)) return "pipeline";
    if (/(故事骨架|剧情骨架|故事大纲|剧情大纲).{0,8}(生成|创作|分析|重做|开始)|(?:生成|创作|分析|重做|开始).{0,8}(故事骨架|剧情骨架|故事大纲|剧情大纲)/i.test(message)) return "skeleton";
    if (/(改编策略|改编方案).{0,8}(生成|创作|分析|重做|开始)|(?:生成|创作|分析|重做|开始).{0,8}(改编策略|改编方案)/i.test(message)) return "adaptation";
    if (/(剧本开发|编剧流程|剧本前期|骨架.*策略)/i.test(message)) return "development";
    if (/(视频|影片|片段|成片).{0,8}(生成|制作|渲染)|(?:生成|制作|渲染).{0,8}(视频|影片|片段|成片)/i.test(message)) return "video";
    if (/(分镜|镜头).{0,8}(生成|制作|规划|创建)|(?:生成|制作|规划|创建).{0,8}(分镜|镜头)/i.test(message)) return "storyboard";
    if (/(人物|角色|道具|场景|资产).{0,8}(生成|提取|分析|设定|造景)|(?:生成|提取|分析|设定|造景).{0,8}(人物|角色|道具|场景|资产)/i.test(message)) return "assets";
    if (/(导演规划|拍摄规划|镜头规划|制片规划).{0,8}(生成|制作|开始|重做)|(?:生成|制作|开始|重做).{0,8}(导演规划|拍摄规划|镜头规划|制片规划)/i.test(message)) return "director_plan";
    if (/(小说|原著).{0,12}(剧本|改编)|(?:生成|创作|改编|编写).{0,8}(剧本|脚本)/i.test(message)) return "screenplay";
    if (/^(开始|启动|开始吧|开始制作|进入剧本agent|开始进入剧本agent)[。！!\s]*$/i.test(message)) return context.productionState.nextStage === "complete" ? undefined : context.productionState.nextStage;
    if (/^(?:请)?(?:继续|下一步|往下|接着|推进|加速)(?:(?:进入|执行|推进|开始|完成|进行|到|制作|下一|后续|个|阶段|步骤|流程|环节|吧|一下)|[。！!\s])*$/i.test(message)) {
      return context.productionState.nextStage === "complete" ? undefined : context.productionState.nextStage;
    }
    return undefined;
  }

  private buildProductionStage(stage: "skeleton" | "adaptation" | "development" | "screenplay" | "assets" | "director_plan" | "storyboard" | "video" | "pipeline", message: string, context: ProjectContext): PlannedToolInstruction {
    const selectedScene = context.selected.find(ref => ref.type === "scene");
    const selectedShot = context.selected.find(ref => ref.type === "shot");
    const selectedScript = context.selected.find(ref => ref.type === "script");
    const scriptId = selectedScript?.id || context.route.episodeId;
    const input: Record<string, unknown> = { stage, instruction: message };
    if (scriptId) input.scriptId = String(scriptId).replace(/^episode:/, "episode:");
    if (selectedScene) input.sceneId = selectedScene.id;
    if (selectedShot) input.shotId = selectedShot.id;
    const labels: Record<typeof stage, string> = {
      skeleton: "从小说生成故事骨架",
      adaptation: "生成影视改编策略",
      development: "完成故事骨架与改编策略",
      screenplay: "从小说和改编方案生成剧本",
      assets: "从剧本提取人物、道具和场景设定",
      director_plan: "生成导演与拍摄规划",
      storyboard: "根据剧本、资产和导演规划生成分镜",
      video: "根据选中分镜生成视频片段",
      pipeline: "运行小说到分镜的完整前期制作流程",
    };
    const steps: ActionPlan["steps"] = stage === "pipeline"
      ? [
        { toolName: "production.run_stage", purpose: "编剧 Agent 生成故事骨架与改编策略", targetIds: [] },
        { toolName: "production.run_stage", purpose: "剧本 Agent 生成并写入剧本", targetIds: [] },
        { toolName: "production.run_stage", purpose: "美术设定 Agent 提取人物、道具和场景", targetIds: [] },
        { toolName: "production.run_stage", purpose: "总调度导演 Agent 生成拍摄规划", targetIds: [] },
        { toolName: "production.run_stage", purpose: "分镜制作 Agent 创建镜头计划", targetIds: [] },
        { toolName: "video.generate_clip", purpose: "视频生成等待用户明确确认", targetIds: [] },
      ]
      : [{ toolName: "production.run_stage", purpose: labels[stage], targetIds: [selectedScene, selectedShot, selectedScript].filter(Boolean).map(ref => String(ref!.id)) }];
    const requiresConfirmation = this.registry.needsConfirmation("production.run_stage", input);
    return {
      toolName: "production.run_stage",
      input,
      plan: {
        summary: labels[stage],
        steps,
        affectedObjects: [selectedScene, selectedShot, selectedScript].filter((ref): ref is ContextEntityRef => Boolean(ref)),
        requiresConfirmation,
        confirmationReason: requiresConfirmation ? "Video provider generation can incur cost and requires final user confirmation." : undefined,
        estimatedProviderCalls: stage === "pipeline" ? 3 : 1,
      },
    };
  }

  private async planWithModel(message: string, context: ProjectContext): Promise<PlannedToolInstruction> {
    const tools = this.registry.list().map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      requiresConfirmation: typeof tool.requiresConfirmation === "boolean" ? tool.requiresConfirmation : "dynamic",
    }));
    const prompt = `你是 Toonflow AI Director 的工具规划器。根据用户指令和当前页面上下文，只选择一个最合适的工具。

用户指令：${message}

当前上下文：
${JSON.stringify({
  route: context.route,
  selected: context.selected,
  visible: context.visible.slice(0, 30),
  related: context.related.slice(0, 30),
  upstreamArtifacts: context.upstreamArtifacts.slice(0, 20),
  downstreamArtifacts: context.downstreamArtifacts.slice(0, 20),
}, null, 2)}

可用工具：
${JSON.stringify(tools, null, 2)}

只返回 JSON：
{
  "toolName": "工具名",
  "input": {},
  "summary": "给用户看的执行摘要",
  "purpose": "本次工具调用目的",
  "targetIds": ["受影响的稳定ID"]
}

规则：
- 必须复用上下文中的稳定 ID，不得编造 ID。
- 用户没有提供且上下文也没有的必填信息，不得猜测。
- 不要选择任何 ComfyUI 专用能力。
- 只执行一个原子工具；复杂任务先选择第一个可执行步骤。`;
    const result = await Ai.Text("universalAi", false, 1).invoke({
      messages: [
        { role: "system", content: "你是结构化工具规划器，只输出合法 JSON。" },
        { role: "user", content: prompt },
      ],
    });
    const cleaned = result.text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AI Director 未能生成可执行计划，请补充要操作的对象或字段");
    const parsed = JSON.parse(match[0]);
    if (!parsed.toolName || !this.registry.list().some(tool => tool.name === parsed.toolName)) throw new Error(`AI Director 选择了不可用工具：${parsed.toolName || "空"}`);
    const input = this.registry.validateInput<Record<string, unknown>>(parsed.toolName, parsed.input || {});
    return this.build(parsed.toolName, input, parsed.summary || `执行 ${parsed.toolName}`, this.resolveTargets(parsed.targetIds, context), parsed.purpose);
  }

  private build(toolName: string, input: Record<string, unknown>, summary: string, affectedObjects: ContextEntityRef[], purpose = summary): PlannedToolInstruction {
    const targetIds = affectedObjects.map(ref => String(ref.id));
    const requiresConfirmation = this.registry.needsConfirmation(toolName, input);
    return {
      toolName,
      input,
      plan: {
        summary,
        steps: [{ toolName, purpose, targetIds }],
        affectedObjects,
        requiresConfirmation,
        confirmationReason: requiresConfirmation ? "该操作会批量生成、跨阶段修改、回滚或完成终审" : undefined,
      },
    };
  }

  private resolveTargets(ids: unknown, context: ProjectContext): ContextEntityRef[] {
    if (!Array.isArray(ids)) return [];
    const all = [...context.selected, ...context.visible, ...context.related, ...context.upstreamArtifacts, ...context.downstreamArtifacts];
    return ids.map(String).map(id => all.find(ref => String(ref.id) === id)).filter((ref): ref is ContextEntityRef => Boolean(ref));
  }

  private extractQuoted(message: string): string | undefined {
    return message.match(/[“"']([^”"']+)[”"']/)?.[1]?.trim();
  }

  private extractName(message: string, markers: string[]): string | undefined {
    const quoted = this.extractQuoted(message);
    if (quoted) return quoted;
    for (const marker of markers) {
      const match = message.match(new RegExp(`${marker}[叫名为：:\\s]*([\\u4e00-\\u9fa5A-Za-z0-9_-]{2,20})`));
      if (match?.[1]) return match[1].replace(/并|，|。.*$/g, "");
    }
    return undefined;
  }
}
