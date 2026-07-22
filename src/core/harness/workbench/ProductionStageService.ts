import { v4 as uuid } from "uuid";
import { db } from "@/utils/db";
import { entityId, numericEntityId } from "../domain/ids";
import { filmDomainService } from "../domain/FilmDomainService";
import { reviewDomainService, type ReviewRequest } from "../domain/ReviewDomainService";
import type { ProductionDomainService } from "../domain/ProductionDomainService";
import type { ActionRun, ContextEntityRef, ProjectContext, UiPatch, WorkbenchDomain } from "./contracts";
import { LegacyAgentBridge, type AssetDraft, type DelegationEvidence, type ScreenplayDraft, type StoryboardDraft } from "./LegacyAgentBridge";

export type ProductionStage = "skeleton" | "adaptation" | "development" | "screenplay" | "assets" | "director_plan" | "storyboard" | "video" | "pipeline";
export type ProductionStageMode = "ai" | "draft";

export interface ProductionStageInput {
  stage: ProductionStage;
  instruction?: string;
  scriptId?: string;
  sceneId?: string;
  shotId?: string;
  mode?: ProductionStageMode;
}

interface StageResult {
  stage: ProductionStage;
  summary: string;
  delegatedSteps: Array<{ role: string; tool: string; status: "completed" | "pending" | "failed"; detail: string }>;
  artifactIds: string[];
  reviewRequired: boolean;
  uiPatch: UiPatch;
  [key: string]: unknown;
}

interface StageReviewTarget extends ReviewRequest {
  label: string;
  targetAgent: string;
}

interface StageReviewEvidence {
  reviewId?: string;
  attemptNumber: number;
  artifactType: string;
  artifactId: string;
  label: string;
  reviewer?: string;
  criteriaAgent?: string;
  targetAgent: string;
  score?: { overall?: number; passed?: boolean; feedback?: string };
  error?: string;
}

/**
 * The production pipeline is intentionally server-side. Legacy agent profiles
 * and skills are reused, while writes remain typed Harness domain operations.
 */
export class ProductionStageService {
  private readonly legacy = new LegacyAgentBridge();

  constructor(private readonly production: ProductionDomainService) {}

  async run(actionRun: ActionRun, input: ProductionStageInput, context: ProjectContext, reportProgress: (percent: number, message: string) => Promise<void>): Promise<StageResult> {
    const resolvedInput = await this.resolveStageInput(actionRun, input);
    const activeRun = resolvedInput.scriptId ? this.withEpisode(actionRun, resolvedInput.scriptId) : actionRun;
    const mode = input.mode || "ai";
    const result = await this.executeStage(activeRun, resolvedInput, mode, context, reportProgress);
    if (resolvedInput.stage === "pipeline") return result;
    const reviewed = await this.attachReview(activeRun, result, resolvedInput.scriptId, 1);
    const failed = this.failedReviews(reviewed);
    const retryableStages: ProductionStage[] = ["skeleton", "adaptation", "development", "screenplay", "assets", "director_plan", "storyboard"];
    if (!failed.length || !retryableStages.includes(resolvedInput.stage)) return reviewed;

    const feedback = failed.map(item => `${item.label}: ${item.score?.feedback || `评分 ${this.formatScore(item.score?.overall)}`}`).join("\n");
    await reportProgress(90, `质量监制未通过，Director 正在把 ${failed.length} 项问题退回原 Agent`);
    for (const item of failed) {
      if (!item.reviewId) continue;
      await reviewDomainService.reroute(activeRun, { reviewId: item.reviewId, targetAgent: item.targetAgent, instruction: feedback }).catch(() => undefined);
    }
    const firstData = result as StageResult & { scriptId?: string };
    const retryInput: ProductionStageInput = {
      ...resolvedInput,
      scriptId: resolvedInput.scriptId || firstData.scriptId,
      instruction: `${resolvedInput.instruction || actionRun.userInstruction}\n\n质量监制返工要求：\n${feedback}\n请针对问题改写，不要降低原有完整度。${resolvedInput.stage === "assets" ? "\n保持现有资产名称、类型和数量稳定，只补充或修正设定细节。" : ""}`,
    };
    const retryRun = retryInput.scriptId ? this.withEpisode(activeRun, retryInput.scriptId) : activeRun;
    if (resolvedInput.stage === "storyboard") {
      await this.discardStoryboardDraft(retryRun, Array.isArray(firstData.shotIds) ? firstData.shotIds : []);
    }
    const regenerated = await this.executeStage(retryRun, retryInput, mode, context, (percent, message) => reportProgress(90 + Math.round(percent * 0.09), `返工：${message}`));
    const finalResult = await this.attachReview(retryRun, regenerated, retryInput.scriptId, 2);
    const finalFailed = this.failedReviews(finalResult);
    return {
      ...finalResult,
      summary: finalFailed.length ? `${finalResult.summary} 自动返工后仍有 ${finalFailed.length} 项未通过。` : `${finalResult.summary} 已根据审核意见自动返工并复审通过。`,
      delegatedSteps: [
        ...reviewed.delegatedSteps,
        { role: "AI Director", tool: "review.reroute", status: "completed", detail: `将 ${failed.length} 项审核问题转为结构化返工指令并重新调度原 Agent` },
        ...finalResult.delegatedSteps,
      ],
      qualityLoop: {
        attempts: 2,
        initialReviews: (reviewed as any).reviews || [],
        finalReviews: (finalResult as any).reviews || [],
        passed: finalFailed.length === 0,
      },
      reviewRequired: finalFailed.length > 0 || Boolean(((finalResult as any).reviews || []).some((item: StageReviewEvidence) => item.error)),
      nextAction: finalFailed.length ? "查看复审问题并人工决定继续返工或修改。" : finalResult.nextAction,
    };
  }

  private async executeStage(actionRun: ActionRun, input: ProductionStageInput, mode: ProductionStageMode, context: ProjectContext, reportProgress: (percent: number, message: string) => Promise<void>): Promise<StageResult> {
    if (input.stage === "screenplay") return this.screenplay(actionRun, input, mode, reportProgress);
    if (input.stage === "skeleton") return this.skeleton(actionRun, input, mode, reportProgress);
    if (input.stage === "adaptation") return this.adaptation(actionRun, input, mode, reportProgress);
    if (input.stage === "development") return this.development(actionRun, input, mode, reportProgress);
    if (input.stage === "assets") return this.assets(actionRun, input, mode, reportProgress);
    if (input.stage === "director_plan") return this.directorPlan(actionRun, input, mode, reportProgress);
    if (input.stage === "storyboard") return this.storyboard(actionRun, input, mode, reportProgress);
    if (input.stage === "video") return this.video(actionRun, input, context, reportProgress);
    return this.pipeline(actionRun, input, mode, context, reportProgress);
  }

  private async pipeline(actionRun: ActionRun, input: ProductionStageInput, mode: ProductionStageMode, context: ProjectContext, reportProgress: (percent: number, message: string) => Promise<void>): Promise<StageResult> {
    await reportProgress(3, "Director is assembling story, screenplay, art and storyboard stages");
    const stages: Record<string, StageResult> = {};
    const development = await this.run(actionRun, { ...input, stage: "development", mode }, context, (percent, message) => reportProgress(Math.round(percent * 0.16), `Story development: ${message}`));
    stages.development = development;
    if (this.isQualityBlocked(development)) return this.blockedPipelineResult(actionRun, stages, "development", development);
    const screenplay = await this.run(actionRun, { ...input, stage: "screenplay", mode }, context, (percent, message) => reportProgress(16 + Math.round(percent * 0.20), `Screenplay stage: ${message}`));
    stages.screenplay = screenplay;
    if (this.isQualityBlocked(screenplay)) return this.blockedPipelineResult(actionRun, stages, "screenplay", screenplay);
    const scriptId = String(screenplay.scriptId);
    const scopedRun = this.withEpisode(actionRun, scriptId);
    const assets = await this.run(scopedRun, { ...input, stage: "assets", scriptId, mode }, context, (percent, message) => reportProgress(36 + Math.round(percent * 0.20), `Asset stage: ${message}`));
    stages.assets = assets;
    if (this.isQualityBlocked(assets)) return this.blockedPipelineResult(actionRun, stages, "assets", assets);
    const directorPlan = await this.run(scopedRun, { ...input, stage: "director_plan", scriptId, mode }, context, (percent, message) => reportProgress(56 + Math.round(percent * 0.16), `Director plan: ${message}`));
    stages.directorPlan = directorPlan;
    if (this.isQualityBlocked(directorPlan)) return this.blockedPipelineResult(actionRun, stages, "director_plan", directorPlan);
    const storyboard = await this.run(scopedRun, { ...input, stage: "storyboard", scriptId, mode }, context, (percent, message) => reportProgress(72 + Math.round(percent * 0.27), `Storyboard stage: ${message}`));
    stages.storyboard = storyboard;
    if (this.isQualityBlocked(storyboard)) return this.blockedPipelineResult(actionRun, stages, "storyboard", storyboard);
    await reportProgress(100, "Pre-production is ready for media generation review");
    return {
      stage: "pipeline",
      summary: "Screenplay, production assets and storyboard plan are ready. Video generation is awaiting a separate confirmation.",
      delegatedSteps: [
        ...development.delegatedSteps,
        ...screenplay.delegatedSteps,
        ...assets.delegatedSteps,
        ...directorPlan.delegatedSteps,
        ...storyboard.delegatedSteps,
        { role: "Video Agent", tool: "video.generate_clip", status: "pending", detail: "Requires explicit confirmation before provider dispatch" },
      ],
      artifactIds: [...development.artifactIds, ...screenplay.artifactIds, ...assets.artifactIds, ...directorPlan.artifactIds, ...storyboard.artifactIds],
      reviewRequired: false,
      quality: { passed: true, completedStages: Object.keys(stages) },
      reviews: Object.values(stages).flatMap(stage => this.finalReviews(stage)),
      uiPatch: storyboard.uiPatch,
      development,
      screenplay,
      assets,
      directorPlan,
      storyboard,
      nextAction: "Generate a video clip for a selected storyboard shot.",
    };
  }

  private async development(actionRun: ActionRun, input: ProductionStageInput, mode: ProductionStageMode, reportProgress: (percent: number, message: string) => Promise<void>): Promise<StageResult> {
    const skeleton = await this.skeleton(actionRun, { ...input, stage: "skeleton" }, mode, progress => reportProgress(Math.round(progress * 0.5), "Story skeleton: " + progress));
    const adaptation = await this.adaptation(actionRun, { ...input, stage: "adaptation" }, mode, progress => reportProgress(50 + Math.round(progress * 0.5), "Adaptation strategy: " + progress));
    return {
      stage: "development",
      summary: "故事骨架与改编策略已生成并写入剧本工作台。",
      delegatedSteps: [...skeleton.delegatedSteps, ...adaptation.delegatedSteps],
      artifactIds: [...skeleton.artifactIds, ...adaptation.artifactIds],
      reviewRequired: true,
      uiPatch: adaptation.uiPatch,
      skeleton,
      adaptation,
    };
  }

  private async skeleton(actionRun: ActionRun, input: ProductionStageInput, mode: ProductionStageMode, reportProgress: (percent: number, message: string) => Promise<void>): Promise<StageResult> {
    await reportProgress(10, "正在读取小说章节和项目设定");
    const projectId = numericEntityId(actionRun.projectId, "project");
    const project = await db("o_project").where("id", projectId).first();
    const novel = await this.loadNovel(projectId);
    if (!novel) throw new Error("当前项目没有可用小说内容，请先导入小说章节");
    const draft = mode === "draft"
      ? { content: `# ${project?.name || "项目"} 故事骨架\n\n${novel.slice(0, 1200)}`, delegation: this.draftDelegation("skeleton") }
      : await this.legacy.writeStorySkeleton({ projectName: project?.name || "Untitled", novel, instruction: input.instruction || actionRun.userInstruction });
    await this.updateAgentWorkData(projectId, { storySkeleton: draft.content });
    await reportProgress(100, "故事骨架已写入剧本 Agent 工作台");
    return this.textStageResult(actionRun, "skeleton", "故事骨架已生成。", draft.content, draft.delegation, "storySkeleton");
  }

  private async adaptation(actionRun: ActionRun, input: ProductionStageInput, mode: ProductionStageMode, reportProgress: (percent: number, message: string) => Promise<void>): Promise<StageResult> {
    await reportProgress(10, "正在读取故事骨架和项目改编目标");
    const projectId = numericEntityId(actionRun.projectId, "project");
    const project = await db("o_project").where("id", projectId).first();
    const novel = await this.loadNovel(projectId);
    const workData = await this.getAgentWorkData(projectId);
    const skeleton = workData.storySkeleton || novel.slice(0, 1500);
    if (!skeleton) throw new Error("请先生成故事骨架或导入小说内容");
    const draft = mode === "draft"
      ? { content: `# 改编策略\n\n围绕 ${project?.type || "项目类型"} 保留主冲突并强化视觉节奏。`, delegation: this.draftDelegation("adaptation") }
      : await this.legacy.writeAdaptationStrategy({ projectName: project?.name || "Untitled", novel, storySkeleton: skeleton, instruction: input.instruction || actionRun.userInstruction });
    await this.updateAgentWorkData(projectId, { adaptationStrategy: draft.content });
    await reportProgress(100, "改编策略已写入剧本 Agent 工作台");
    return this.textStageResult(actionRun, "adaptation", "改编策略已生成。", draft.content, draft.delegation, "adaptationStrategy");
  }

  private async screenplay(actionRun: ActionRun, input: ProductionStageInput, mode: ProductionStageMode, reportProgress: (percent: number, message: string) => Promise<void>): Promise<StageResult & { scriptId: string }> {
    await reportProgress(10, "Loading novel source and screenplay context");
    const projectId = numericEntityId(actionRun.projectId, "project");
    const project = await db("o_project").where("id", projectId).first();
    const novel = await this.loadNovel(projectId);
    if (!novel) throw new Error("No novel source is available. Import or select novel chapters first.");
    const existingScriptId = this.resolveScriptId(actionRun, input.scriptId);
    const workData = await this.getAgentWorkData(projectId);
    const enrichedInstruction = [input.instruction || actionRun.userInstruction, workData.storySkeleton ? `故事骨架：\n${workData.storySkeleton}` : "", workData.adaptationStrategy ? `改编策略：\n${workData.adaptationStrategy}` : ""].filter(Boolean).join("\n\n");
    const source = mode === "draft"
      ? this.makeDraftScreenplay(project?.name || "Untitled", novel, existingScriptId ? "Current episode" : undefined)
      : await this.legacy.writeScreenplay({ projectName: project?.name || "Untitled", novel, instruction: enrichedInstruction, episodeName: existingScriptId ? "Current episode" : undefined });
    await reportProgress(70, "Writing screenplay to Toonflow project data");
    const mutation = existingScriptId
      ? await filmDomainService.updateScript(actionRun, existingScriptId, { name: source.name, content: source.content })
      : await filmDomainService.createScript(actionRun, source);
    const scriptId = String(mutation.entity.id).split(":").pop()!;
    await reportProgress(100, "Screenplay is saved and ready for review");
    return {
      stage: "screenplay",
      summary: `Screenplay ${source.name} has been written to the project.`,
      delegatedSteps: [
        this.delegatedStep(source.delegation, "screenplay.generate_from_novel", mode === "ai" ? "剧本已写入 Toonflow" : "Created a source-linked draft for verification"),
        { role: "Quality Supervisor", tool: "review.request", status: "pending", detail: "Human review is required before costly media generation" },
      ],
      artifactIds: [String(mutation.entity.id)],
      reviewRequired: true,
      uiPatch: mutation.uiPatch,
      scriptId,
      delegation: source.delegation,
      entity: mutation.entity,
      version: mutation.version,
      changedFields: mutation.changedFields,
    };
  }

  private async directorPlan(actionRun: ActionRun, input: ProductionStageInput, mode: ProductionStageMode, reportProgress: (percent: number, message: string) => Promise<void>): Promise<StageResult> {
    await reportProgress(10, "正在读取剧本和美术设定");
    const projectId = numericEntityId(actionRun.projectId, "project");
    const scriptId = this.resolveScriptId(actionRun, input.scriptId);
    if (!scriptId) throw new Error("请先选择或生成剧本，再进行导演规划");
    const script = await db("o_script").where({ id: Number(scriptId), projectId }).first();
    if (!script) throw new Error(`Script not found: ${scriptId}`);
    const assets = await db("o_assets").where({ projectId, scriptId: Number(scriptId) }).select("name");
    const draft = mode === "draft"
      ? { content: `# 导演规划\n\n围绕《${script.name}》建立场次、镜头节奏和连续性基线。`, delegation: this.draftDelegation("director_plan") }
      : await this.legacy.createDirectorPlan({ script: script.content || "", assets: assets.map(item => item.name), instruction: input.instruction || actionRun.userInstruction });
    await this.updateProductionWorkData(projectId, scriptId, {
      directorPlan: draft.content,
      scriptPlan: draft.content,
    });
    await reportProgress(100, "导演规划已保存，可进入分镜阶段");
    return this.textStageResult(actionRun, "director_plan", "导演规划已生成。", draft.content, draft.delegation, "directorPlan", "storyboard");
  }

  private async assets(actionRun: ActionRun, input: ProductionStageInput, mode: ProductionStageMode, reportProgress: (percent: number, message: string) => Promise<void>): Promise<StageResult & { assetIds: string[] }> {
    await reportProgress(10, "Loading screenplay and existing production assets");
    const projectId = numericEntityId(actionRun.projectId, "project");
    const scriptId = this.resolveScriptId(actionRun, input.scriptId);
    if (!scriptId) throw new Error("Select or create a screenplay before generating production assets.");
    const script = await db("o_script").where({ id: Number(scriptId), projectId }).first();
    if (!script) throw new Error(`Script not found: ${scriptId}`);
    const existingAssets = await db("o_assets")
      .where({ projectId, scriptId: Number(scriptId) })
      .whereNull("assetsId")
      .select("name", "type", "describe as description", "prompt");
    const existingAssetSet = existingAssets.length ? {
      characters: existingAssets.filter(item => item.type === "role").map(({ name, description, prompt }) => ({ name, description, prompt })),
      props: existingAssets.filter(item => item.type === "tool").map(({ name, description, prompt }) => ({ name, description, prompt })),
      locations: existingAssets.filter(item => item.type === "scene").map(({ name, description, prompt }) => ({ name, description, prompt })),
    } : undefined;
    const draft = mode === "draft"
      ? this.makeDraftAssets(script.name, script.content || "")
      : await this.legacy.deriveAssets({
        script: script.content || "",
        instruction: input.instruction || actionRun.userInstruction,
        existingAssets: existingAssetSet,
      });
    await reportProgress(50, "Writing character, prop and location records");
    const created = await this.persistAssets(this.withEpisode(actionRun, scriptId), scriptId, draft);
    await reportProgress(100, "Production assets are linked to the screenplay");
    const target = created[created.length - 1]?.entity || { type: "script", id: entityId("script", scriptId), label: script.name } as ContextEntityRef;
    const uiPatch = this.patch(actionRun, "assets", target, "refresh", { assetIds: created.map(item => item.entity.id), scriptId });
    return {
      stage: "assets",
      summary: `Created or linked ${created.length} production assets for ${script.name}.`,
      delegatedSteps: [
        this.delegatedStep(draft.delegation, "production.generate_assets", mode === "ai" ? "人物、道具和地点设定已写入 Toonflow" : "Created source-linked asset placeholders for verification"),
        { role: "Quality Supervisor", tool: "review.request", status: "pending", detail: "Review visual identity before image generation" },
      ],
      artifactIds: created.map(item => String(item.entity.id)),
      assetIds: created.map(item => String(item.entity.id)),
      reviewRequired: true,
      uiPatch,
      created,
    };
  }

  private async storyboard(actionRun: ActionRun, input: ProductionStageInput, mode: ProductionStageMode, reportProgress: (percent: number, message: string) => Promise<void>): Promise<StageResult & { sceneId: string; shotIds: string[] }> {
    await reportProgress(10, "Resolving screenplay, scene and asset context");
    const projectId = numericEntityId(actionRun.projectId, "project");
    const scriptId = this.resolveScriptId(actionRun, input.scriptId);
    if (!scriptId) throw new Error("Select or create a screenplay before creating a storyboard.");
    const scopedRun = this.withEpisode(actionRun, scriptId);
    const script = await db("o_script").where({ id: Number(scriptId), projectId }).first();
    if (!script) throw new Error(`Script not found: ${scriptId}`);
    const assets = await db("o_assets").where({ projectId, scriptId: Number(scriptId) }).whereNull("assetsId").select("id", "name");
    const sceneId = await this.resolveOrCreateScene(scopedRun, input.sceneId, script, assets.map(asset => Number(asset.id)));
    const draft = mode === "draft"
      ? this.makeDraftStoryboard(script.content || "")
      : await this.legacy.planStoryboard({ script: script.content || "", assets: assets.map(asset => asset.name), instruction: input.instruction || actionRun.userInstruction });
    await reportProgress(60, "Writing storyboard shots and their asset references");
    const result = await this.production.generateStoryboardPlan(scopedRun, {
      sceneId: entityId("scene", sceneId),
      shots: draft.shots.map(shot => ({ ...shot, assetIds: assets.map(asset => entityId("artifact", asset.id)) })),
    });
    const shotIds = ((result.shots || []) as Array<{ id: string }>).map(shot => String(shot.id));
    await this.updateProductionWorkData(projectId, scriptId, {
      storyboardTable: this.storyboardTableMarkdown((result.shots || []) as StoryboardDraft["shots"]),
    });
    await reportProgress(100, "Storyboard plan is saved and ready for image/video review");
    return {
      stage: "storyboard",
      summary: `Storyboard plan created with ${shotIds.length} shots.`,
      delegatedSteps: [
        this.delegatedStep(draft.delegation, "production.generate_storyboard", mode === "ai" ? "剧本、导演规划和资产已转换为镜头" : "Created a source-linked verification plan"),
        { role: "Quality Supervisor", tool: "review.request", status: "pending", detail: "Review continuity and references before media generation" },
      ],
      artifactIds: shotIds,
      sceneId: entityId("scene", sceneId),
      shotIds,
      reviewRequired: true,
      uiPatch: result.uiPatch,
      result,
    };
  }

  private async video(actionRun: ActionRun, input: ProductionStageInput, context: ProjectContext, reportProgress: (percent: number, message: string) => Promise<void>): Promise<StageResult> {
    await reportProgress(10, "正在解析需要生成视频的分镜");
    const projectId = numericEntityId(actionRun.projectId, "project");
    const explicit = input.shotId || context.selected.find(ref => ref.type === "shot")?.id;
    let shots: any[];
    if (explicit) {
      const shot = await db("o_storyboard").where({ id: Number(String(explicit).split(":").pop()), projectId }).first();
      shots = shot ? [shot] : [];
    } else {
      const allShots = await db("o_storyboard").where({ projectId }).orderBy("index", "asc");
      const completedTrackIds = new Set((await db("o_video").where({ projectId }).pluck("videoTrackId")).map(Number));
      shots = allShots.filter((shot: any) => !completedTrackIds.has(Number(shot.trackId)));
    }
    if (!shots.length) throw new Error("没有待生成视频的分镜；请选择一个分镜重做，或先生成分镜计划");
    const generated = [];
    for (let index = 0; index < shots.length; index++) {
      const shot = shots[index];
      await reportProgress(15 + Math.round((index / shots.length) * 80), `视频生成 Agent 正在处理镜头 ${index + 1}/${shots.length}`);
      generated.push(await this.production.generateVideoClip(actionRun, { shotId: entityId("shot", shot.id) }));
    }
    await reportProgress(100, "全部目标分镜视频已生成");
    return {
      stage: "video",
      summary: `已生成 ${generated.length} 个视频片段。`,
      delegatedSteps: [
        { role: "视频生成 Agent", tool: "video.generate_clip", status: "completed", detail: `使用项目配置的视频模型完成 ${generated.length} 个镜头` },
        { role: "Quality Supervisor", tool: "video.review_clip", status: "pending", detail: "Review continuity and output quality" },
      ],
      artifactIds: generated.map(result => `artifact:video-${result.videoId}`),
      reviewRequired: true,
      uiPatch: generated[generated.length - 1].uiPatch,
      generated,
      nextAction: "审核视频片段并进入剪辑合成",
    };
  }

  private async persistAssets(actionRun: ActionRun, scriptId: string, draft: AssetDraft) {
    const all: Array<["character" | "prop" | "location", AssetDraft["characters"][number]]> = [
      ...draft.characters.map(item => ["character", item] as ["character", AssetDraft["characters"][number]]),
      ...draft.props.map(item => ["prop", item] as ["prop", AssetDraft["props"][number]]),
      ...draft.locations.map(item => ["location", item] as ["location", AssetDraft["locations"][number]]),
    ];
    const projectId = numericEntityId(actionRun.projectId, "project");
    const result = [];
    for (const [kind, item] of all) {
      const existing = await db("o_assets").where({ projectId, scriptId: Number(scriptId), name: item.name, type: kind === "character" ? "role" : kind === "prop" ? "tool" : "scene" }).first();
      const mutation = existing
        ? await filmDomainService.updateAsset(actionRun, kind, String(existing.id), { description: item.description, prompt: item.prompt })
        : await filmDomainService.createAsset(actionRun, kind, { ...item, scriptId });
      await this.linkScriptAsset(scriptId, Number(String(mutation.entity.id).split(":").pop()));
      result.push(mutation);
    }
    return result;
  }

  private async resolveOrCreateScene(actionRun: ActionRun, inputSceneId: string | undefined, script: any, assetIds: number[]): Promise<string> {
    const projectId = numericEntityId(actionRun.projectId, "project");
    const explicit = inputSceneId ? String(inputSceneId).split(":").pop() : undefined;
    if (explicit && await (db as any)("o_scene").where({ id: Number(explicit), projectId }).first()) return explicit;
    const existing = await (db as any)("o_scene").where({ projectId, episodeId: Number(script.id) }).orderBy("orderIndex", "asc").first();
    if (existing) return String(existing.id);
    const roles = await db("o_assets").whereIn("id", assetIds).where("type", "role").pluck("id");
    const props = await db("o_assets").whereIn("id", assetIds).where("type", "tool").pluck("id");
    const location = await db("o_assets").whereIn("id", assetIds).where("type", "scene").first();
    const mutation = await filmDomainService.createScene(actionRun, {
      title: `${script.name} - Scene 1`,
      summary: String(script.content || "").slice(0, 500),
      description: "Initial scene created by the AI Director from the selected screenplay.",
      characterIds: roles.map(id => entityId("character", id)),
      propIds: props.map(id => entityId("prop", id)),
      locationId: location ? entityId("location", location.id) : undefined,
      orderIndex: 0,
    });
    return String(mutation.entity.id).split(":").pop()!;
  }

  private async loadNovel(projectId: number): Promise<string> {
    const rows = await db("o_novel").where({ projectId }).orderBy("chapterIndex", "asc");
    return rows.map((row: any) => row.chapterData || row.content || "").filter(Boolean).join("\n\n").trim();
  }

  private resolveScriptId(actionRun: ActionRun, input?: string): string | undefined {
    const raw = input || actionRun.episodeId;
    return raw ? String(raw).split(":").pop() : undefined;
  }

  private async resolveStageInput(actionRun: ActionRun, input: ProductionStageInput): Promise<ProductionStageInput> {
    if (input.scriptId || actionRun.episodeId || !["assets", "director_plan", "storyboard", "video"].includes(input.stage)) return input;
    const projectId = numericEntityId(actionRun.projectId, "project");
    const latest = await db("o_script")
      .where({ projectId })
      .orderByRaw("COALESCE(updateTime, createTime, 0) DESC")
      .orderBy("id", "desc")
      .first();
    return latest?.id ? { ...input, scriptId: String(latest.id) } : input;
  }

  private async discardStoryboardDraft(actionRun: ActionRun, shotIds: string[]): Promise<void> {
    const projectId = numericEntityId(actionRun.projectId, "project");
    const ids = shotIds.map(id => Number(String(id).split(":").pop())).filter(Number.isFinite);
    if (!ids.length) return;
    const rows = await db("o_storyboard").where({ projectId }).whereIn("id", ids).select("id", "trackId", "filePath");
    if (rows.some(row => Boolean(row.filePath))) throw new Error("已生成图片的分镜不能自动替换，请人工确认后重做");
    const persistedIds = rows.map(row => Number(row.id));
    const trackIds = rows.map(row => Number(row.trackId)).filter(Number.isFinite);
    if (!persistedIds.length) return;
    await db("o_assets2Storyboard").whereIn("storyboardId", persistedIds).delete();
    if (await db.schema.hasTable("o_artifact_link")) {
      await db("o_artifact_link").where({ projectId, targetType: "shot" }).whereIn("targetId", persistedIds.map(String)).delete();
    }
    await db("o_storyboard").where({ projectId }).whereIn("id", persistedIds).delete();
    if (trackIds.length) await db("o_videoTrack").where({ projectId }).whereIn("id", trackIds).delete();
  }

  private isQualityBlocked(result: StageResult): boolean {
    const data = result as any;
    return data.qualityLoop?.passed === false || data.quality?.passed === false || result.reviewRequired === true;
  }

  private finalReviews(result: StageResult): StageReviewEvidence[] {
    const data = result as any;
    if (Array.isArray(data.qualityLoop?.finalReviews)) return data.qualityLoop.finalReviews;
    return Array.isArray(data.reviews) ? data.reviews : [];
  }

  private blockedPipelineResult(actionRun: ActionRun, stages: Record<string, StageResult>, blockedStage: ProductionStage, failed: StageResult): StageResult {
    const completed = Object.values(stages);
    return {
      stage: "pipeline",
      summary: `完整流程已停在 ${blockedStage}：自动返工后仍未达到质量门槛。`,
      delegatedSteps: completed.flatMap(stage => stage.delegatedSteps),
      artifactIds: completed.flatMap(stage => stage.artifactIds),
      reviewRequired: true,
      quality: { passed: false, blockedStage, completedStages: Object.keys(stages) },
      reviews: this.finalReviews(failed),
      uiPatch: failed.uiPatch || this.patch(actionRun, "script", { type: "project", id: actionRun.projectId, label: blockedStage } as ContextEntityRef, "refresh", { blockedStage }),
      nextAction: `查看 ${blockedStage} 的复审问题，修改后输入“继续”重试该阶段。`,
      ...stages,
    };
  }

  private async attachReview(actionRun: ActionRun, result: StageResult, resolvedScriptId?: string, attemptNumber = 1): Promise<StageResult> {
    const targets = this.reviewTargets(result, resolvedScriptId);
    if (!targets.length) return result;
    const reviews: StageReviewEvidence[] = [];
    for (const target of targets) {
      try {
        const review = await reviewDomainService.request(actionRun, { ...target, attemptNumber });
        reviews.push({ reviewId: review.reviewId, attemptNumber, artifactType: target.artifactType, artifactId: target.artifactId, label: target.label, targetAgent: target.targetAgent, reviewer: review.reviewer, criteriaAgent: review.criteriaAgent, score: review.score });
      } catch (error) {
        reviews.push({ attemptNumber, artifactType: target.artifactType, artifactId: target.artifactId, label: target.label, targetAgent: target.targetAgent, criteriaAgent: target.criteriaAgent, error: error instanceof Error ? error.message : String(error) });
      }
    }
    const executed = reviews.filter(review => review.score);
    const failed = executed.filter(review => review.score?.passed === false);
    const unavailable = reviews.filter(review => review.error);
    result.delegatedSteps = result.delegatedSteps.filter(step => step.role !== "Quality Supervisor");
    result.delegatedSteps.push(...reviews.map(review => ({
      role: `Quality Supervisor · ${review.reviewer || "unavailable"}`,
      tool: "review.request",
      status: review.error ? "failed" as const : review.score?.passed ? "completed" as const : "failed" as const,
      detail: review.error
        ? `${review.label} 审核不可用：${review.error}`
        : `${review.label} · ${review.score?.passed ? "通过" : "未通过"} · ${this.formatScore(review.score?.overall)}${review.score?.feedback ? ` · ${review.score.feedback}` : ""}`,
    })));
    return {
      ...result,
      reviewRequired: failed.length > 0 || unavailable.length > 0,
      reviews,
      selectedScriptId: resolvedScriptId,
      quality: { attemptNumber, passed: failed.length === 0 && unavailable.length === 0, failedCount: failed.length, unavailableCount: unavailable.length },
      nextAction: failed.length ? "Director 将根据审核问题执行一次自动返工。" : unavailable.length ? "检查审核模型配置后重试。" : result.nextAction,
    };
  }

  private reviewTargets(result: StageResult, resolvedScriptId?: string): StageReviewTarget[] {
    const data = result as StageResult & { scriptId?: string; created?: any[]; shotIds?: string[]; generated?: any[]; content?: string; delegation?: DelegationEvidence; development?: StageResult; screenplay?: StageResult; assets?: StageResult; directorPlan?: StageResult; storyboard?: StageResult; skeleton?: StageResult; adaptation?: StageResult };
    if (result.stage === "pipeline") return [data.development, data.screenplay, data.assets, data.directorPlan, data.storyboard].filter(Boolean).flatMap(item => this.reviewTargets(item!, (item as any).scriptId || resolvedScriptId));
    if (result.stage === "development") return [data.skeleton, data.adaptation].filter(Boolean).flatMap(item => this.reviewTargets(item!, resolvedScriptId));
    if (result.stage === "skeleton" && data.content) return [{ artifactType: "stage", artifactId: "storySkeleton", label: "故事骨架", targetAgent: data.delegation?.agentKey || "screenwriter", reviewer: "script_supervisor", criteriaAgent: "screenwriter", output: { stage: "storySkeleton", content: data.content } }];
    if (result.stage === "adaptation" && data.content) return [{ artifactType: "stage", artifactId: "adaptationStrategy", label: "改编策略", targetAgent: data.delegation?.agentKey || "screenwriter", reviewer: "script_supervisor", criteriaAgent: "screenwriter", output: { stage: "adaptationStrategy", content: data.content } }];
    if (result.stage === "director_plan" && data.content) return [{ artifactType: "stage", artifactId: `directorPlan:${resolvedScriptId || "latest"}`, label: "导演规划", targetAgent: data.delegation?.agentKey || "director", reviewer: "supervisor", criteriaAgent: "director", output: { stage: "directorPlan", content: data.content } }];
    if (result.stage === "screenplay" && data.scriptId) return [{ artifactType: "script", artifactId: String(data.scriptId), label: "剧本", targetAgent: (result as any).delegation?.agentKey || "screenwriter", reviewer: "script_supervisor", criteriaAgent: "screenwriter" }];
    if (result.stage === "assets") {
      return [{ artifactType: "stage", artifactId: `assets:${resolvedScriptId || "latest"}`, label: "人物、场景与道具设定", targetAgent: "set_decorator", reviewer: "producer", criteriaAgent: "set_decorator", output: { stage: "assets", assets: (data.created || []).map((item: any) => item.record || item.entity) } }];
    }
    if (result.stage === "storyboard") return [{ artifactType: "stage", artifactId: `storyboard:${resolvedScriptId || "latest"}`, label: "分镜规划", targetAgent: "assistant_director", reviewer: "supervisor", criteriaAgent: "assistant_director", output: { stage: "storyboard", shots: (result as any).result?.shots || data.shotIds || [] } }];
    if (result.stage === "video") return [{ artifactType: "stage", artifactId: `video:${resolvedScriptId || "latest"}`, label: "视频片段", targetAgent: "vfx", reviewer: "supervisor", criteriaAgent: "vfx", output: { stage: "video", clips: data.generated || [] } }];
    return [];
  }

  private failedReviews(result: StageResult): StageReviewEvidence[] {
    const reviews = (result as any).reviews;
    return Array.isArray(reviews) ? reviews.filter((item: StageReviewEvidence) => item.score?.passed === false) : [];
  }

  private formatScore(score?: number): string {
    return typeof score === "number" ? `${Math.round(score * 100)} 分` : "无评分";
  }

  private withEpisode(actionRun: ActionRun, scriptId: string): ActionRun {
    return { ...actionRun, episodeId: entityId("episode", scriptId) };
  }

  private async linkScriptAsset(scriptId: string, assetId: number): Promise<void> {
    if (!(await db.schema.hasTable("o_scriptAssets"))) return;
    const exists = await db("o_scriptAssets").where({ scriptId: Number(scriptId), assetId }).first();
    if (!exists) await db("o_scriptAssets").insert({ scriptId: Number(scriptId), assetId });
  }

  private async getAgentWorkData(projectId: number): Promise<Record<string, any>> {
    const row = await db("o_agentWorkData").where({ projectId, key: "scriptAgent" }).first();
    if (!row?.data) return {};
    try { return JSON.parse(row.data); } catch { return {}; }
  }

  private async updateAgentWorkData(projectId: number, patch: Record<string, unknown>): Promise<void> {
    const row = await db("o_agentWorkData").where({ projectId, key: "scriptAgent" }).first();
    const current = await this.getAgentWorkData(projectId);
    const data = JSON.stringify({ ...current, ...patch });
    if (row) await db("o_agentWorkData").where({ id: row.id }).update({ data, updateTime: Date.now() });
    else await db("o_agentWorkData").insert({ projectId, key: "scriptAgent", data, createTime: Date.now(), updateTime: Date.now() });
  }

  private async updateProductionWorkData(projectId: number, scriptId: string, patch: Record<string, unknown>): Promise<void> {
    const where = { projectId, key: "productionAgent", episodesId: Number(scriptId) };
    const row = await db("o_agentWorkData").where(where).first();
    let current: Record<string, unknown> = {};
    try { current = row?.data ? JSON.parse(row.data) : {}; } catch {}
    const data = JSON.stringify({
      script: "",
      scriptPlan: "",
      storyboardTable: "",
      assets: [],
      storyboard: [],
      workbench: { videoList: [] },
      ...current,
      ...patch,
    });
    if (row) await db("o_agentWorkData").where({ id: row.id }).update({ data, updateTime: Date.now() });
    else await db("o_agentWorkData").insert({ ...where, data, createTime: Date.now(), updateTime: Date.now() });
  }

  private storyboardTableMarkdown(shots: StoryboardDraft["shots"]): string {
    if (!shots.length) return "";
    const cell = (value: unknown) => String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
    const rows = shots.map((shot, index) => [
      `S${String(index + 1).padStart(2, "0")}`,
      shot.shotSize || "-",
      shot.cameraMovement || "-",
      `${shot.duration || 0}s`,
      shot.videoDesc,
      shot.prompt,
    ]);
    return [
      "| 镜号 | 景别 | 运镜 | 时长 | 画面与动作 | 生成提示词 |",
      "| --- | --- | --- | --- | --- | --- |",
      ...rows.map(row => `| ${row.map(cell).join(" | ")} |`),
    ].join("\n");
  }

  private textStageResult(actionRun: ActionRun, stage: ProductionStage, summary: string, content: string, delegation: DelegationEvidence, field: string, domain: WorkbenchDomain = "script"): StageResult {
    const target: ContextEntityRef = { type: "artifact", id: entityId("artifact", `${field}-${numericEntityId(actionRun.projectId, "project")}`), label: field };
    return {
      stage,
      summary,
      delegatedSteps: [
        this.delegatedStep(delegation, `production.${stage}`, `${field} 已写入现有 Toonflow 工作台`),
        { role: "Quality Supervisor", tool: "review.request", status: "pending", detail: "等待阶段审核" },
      ],
      artifactIds: [String(target.id)],
      reviewRequired: true,
      uiPatch: this.patch(actionRun, domain, target, "refresh", { field, contentPreview: content.slice(0, 180) }),
      content,
      field,
      delegation,
      nextAction: stage === "skeleton" ? "生成改编策略" : stage === "adaptation" ? "生成剧本" : stage === "director_plan" ? "生成分镜" : undefined,
    };
  }

  private delegatedStep(evidence: DelegationEvidence, tool: string, detail: string): StageResult["delegatedSteps"][number] {
    return {
      role: evidence.agentName,
      tool,
      status: "completed",
      detail: `${detail} · Skill: ${evidence.skillName} · Model: ${evidence.modelName}`,
    };
  }

  private draftDelegation(stage: string): DelegationEvidence {
    return { role: stage, agentKey: `verification:${stage}`, agentName: `${stage} verification`, skillId: `verification-${stage}`, skillName: "deterministic verification", modelName: "none" };
  }

  private patch(actionRun: ActionRun, domain: WorkbenchDomain, target: ContextEntityRef, operation: UiPatch["operation"], changes: Record<string, unknown>): UiPatch {
    return { id: `patch-${uuid()}`, actionRunId: actionRun.id, domain, operation, target, changes, timestamp: Date.now() };
  }

  private makeDraftScreenplay(projectName: string, novel: string, episodeName?: string): ScreenplayDraft {
    const excerpt = novel.slice(0, 1800).trim();
    return { name: episodeName || `${projectName} Episode 1`, content: `# ${episodeName || projectName}\n\n## Source adaptation draft\n${excerpt}`, delegation: this.draftDelegation("screenplay") };
  }

  private makeDraftAssets(scriptName: string, script: string): AssetDraft {
    const excerpt = script.slice(0, 240);
    return {
      characters: [{ name: `${scriptName} protagonist`, description: excerpt || "Primary character derived from screenplay.", prompt: `Character reference sheet for ${scriptName} protagonist. Preserve facial identity, age, body proportions, hairstyle, costume colors and accessories across every shot. Neutral three-quarter pose, clean separation from background, cinematic key light, production-ready detail.` }],
      props: [{ name: `${scriptName} key prop`, description: "Key story object derived from screenplay.", prompt: `Production prop reference for ${scriptName}. Show the complete silhouette, materials, scale, wear marks, functional details and hero-side variations. Use controlled studio lighting and a neutral background so the prop remains consistent across storyboard shots.` }],
      locations: [{ name: `${scriptName} main location`, description: "Primary setting derived from screenplay.", prompt: `Location concept reference for ${scriptName}. Establish geography, entrances, foreground/midground/background layers, time of day, motivated lighting, palette and continuity anchors. Keep camera-readable space for the planned action and repeatable details for future shots.` }],
      delegation: this.draftDelegation("assets"),
    };
  }

  private makeDraftStoryboard(script: string): StoryboardDraft {
    const summary = script.replace(/\s+/g, " ").slice(0, 260) || "Story action";
    return { shots: [
      { prompt: `Establish the story setting: ${summary}`, videoDesc: "Establish the scene and the character objective.", duration: 4, shotSize: "wide shot", cameraMovement: "slow push" },
      { prompt: `Character reacts to the conflict: ${summary}`, videoDesc: "Show the decisive reaction and story conflict.", duration: 5, shotSize: "medium shot", cameraMovement: "handheld follow" },
      { prompt: `Resolve the beat and transition: ${summary}`, videoDesc: "End on the next-action hook.", duration: 4, shotSize: "close-up", cameraMovement: "slow pull back" },
    ], delegation: this.draftDelegation("storyboard") };
  }
}
