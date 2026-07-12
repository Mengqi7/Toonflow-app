import { v4 as uuid } from "uuid";
import { db } from "@/utils/db";
import { entityId, numericEntityId } from "../domain/ids";
import { filmDomainService } from "../domain/FilmDomainService";
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
  delegatedSteps: Array<{ role: string; tool: string; status: "completed" | "pending"; detail: string }>;
  artifactIds: string[];
  reviewRequired: boolean;
  uiPatch: UiPatch;
  [key: string]: unknown;
}

/**
 * The production pipeline is intentionally server-side. Legacy agent profiles
 * and skills are reused, while writes remain typed Harness domain operations.
 */
export class ProductionStageService {
  private readonly legacy = new LegacyAgentBridge();

  constructor(private readonly production: ProductionDomainService) {}

  async run(actionRun: ActionRun, input: ProductionStageInput, context: ProjectContext, reportProgress: (percent: number, message: string) => Promise<void>): Promise<StageResult> {
    const mode = input.mode || "ai";
    if (input.stage === "screenplay") return this.screenplay(actionRun, input, mode, reportProgress);
    if (input.stage === "skeleton") return this.skeleton(actionRun, input, mode, reportProgress);
    if (input.stage === "adaptation") return this.adaptation(actionRun, input, mode, reportProgress);
    if (input.stage === "development") return this.development(actionRun, input, mode, reportProgress);
    if (input.stage === "assets") return this.assets(actionRun, input, mode, reportProgress);
    if (input.stage === "director_plan") return this.directorPlan(actionRun, input, mode, reportProgress);
    if (input.stage === "storyboard") return this.storyboard(actionRun, input, mode, reportProgress);
    if (input.stage === "video") return this.video(actionRun, input, context, reportProgress);
    return this.pipeline(actionRun, input, mode, reportProgress);
  }

  private async pipeline(actionRun: ActionRun, input: ProductionStageInput, mode: ProductionStageMode, reportProgress: (percent: number, message: string) => Promise<void>): Promise<StageResult> {
    await reportProgress(3, "Director is assembling story, screenplay, art and storyboard stages");
    const development = await this.development(actionRun, { ...input, stage: "development" }, mode, progress => reportProgress(Math.round(progress * 0.16), "Story development: " + progress));
    const screenplay = await this.screenplay(actionRun, { ...input, stage: "screenplay" }, mode, progress => reportProgress(16 + Math.round(progress * 0.20), "Screenplay stage: " + progress));
    const scriptId = String(screenplay.scriptId);
    const scopedRun = this.withEpisode(actionRun, scriptId);
    const assets = await this.assets(scopedRun, { ...input, stage: "assets", scriptId }, mode, progress => reportProgress(36 + Math.round(progress * 0.20), "Asset stage: " + progress));
    const directorPlan = await this.directorPlan(scopedRun, { ...input, stage: "director_plan", scriptId }, mode, progress => reportProgress(56 + Math.round(progress * 0.16), "Director plan: " + progress));
    const storyboard = await this.storyboard(scopedRun, { ...input, stage: "storyboard", scriptId }, mode, progress => reportProgress(72 + Math.round(progress * 0.27), "Storyboard stage: " + progress));
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
      reviewRequired: true,
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
    await this.updateProductionWorkData(projectId, scriptId, { directorPlan: draft.content });
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
    const draft = mode === "draft"
      ? this.makeDraftAssets(script.name, script.content || "")
      : await this.legacy.deriveAssets({ script: script.content || "", instruction: input.instruction || actionRun.userInstruction });
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
    const data = JSON.stringify({ ...current, ...patch });
    if (row) await db("o_agentWorkData").where({ id: row.id }).update({ data, updateTime: Date.now() });
    else await db("o_agentWorkData").insert({ ...where, data, createTime: Date.now(), updateTime: Date.now() });
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
      characters: [{ name: `${scriptName} protagonist`, description: excerpt || "Primary character derived from screenplay.", prompt: `Character reference for ${scriptName}, consistent costume and facial identity` }],
      props: [{ name: `${scriptName} key prop`, description: "Key story object derived from screenplay.", prompt: `Cinematic prop reference for ${scriptName}` }],
      locations: [{ name: `${scriptName} main location`, description: "Primary setting derived from screenplay.", prompt: `Location concept reference for ${scriptName}` }],
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
