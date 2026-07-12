import { v4 as uuid } from "uuid";
import { db } from "@/utils/db";
import { harnessEventBus } from "../HarnessEventBus";
import { entityId, numericEntityId } from "./ids";
import { artifactGraph } from "../workbench/ArtifactGraph";
import { artifactVersionService } from "./ArtifactVersionService";
import type { ActionRun, ContextEntityRef, UiPatch } from "../workbench/contracts";
import type { GenerationService } from "../generation/GenerationService";

export class ProductionDomainService {
  constructor(private readonly generation: GenerationService) {}

  async generateReference(actionRun: ActionRun, input: { kind: "character" | "prop" | "location"; entityId: string; prompt?: string }): Promise<any> {
    const projectId = numericEntityId(actionRun.projectId, "project");
    const id = Number(input.entityId.split(":").pop());
    const asset = await db("o_assets").where({ id, projectId }).first();
    if (!asset) throw new Error(`Asset not found: ${input.entityId}`);
    const job = await this.generation.submit({
      capability: "image",
      projectId,
      actionRunId: actionRun.id,
      prompt: input.prompt || asset.prompt || asset.describe || asset.name,
      model: undefined,
      inputReferences: asset.imageId ? [input.entityId] : [],
    });
    if (job.status !== "completed" || !job.result?.uri) throw new Error(job.error?.message || "参考图生成失败");
    const [imageId] = await db("o_image").insert({ filePath: job.result.uri, type: this.assetType(input.kind), assetsId: id, model: job.result.model, state: "已完成" });
    await db("o_assets").where({ id, projectId }).update({ imageId, updateTime: Date.now() } as any);
    const version = await artifactVersionService.save({
      projectId, artifactType: "image", artifactKey: `image:${imageId}`, instanceId: actionRun.instanceId,
      filePath: job.result.uri, content: { assetId: id, prompt: input.prompt || asset.prompt },
      provenance: { actionRunId: actionRun.id, provider: job.result.provider, model: job.result.model, promptVersion: "v1", inputReferences: [input.entityId] },
    });
    await artifactGraph.link({ projectId, sourceType: input.kind, sourceId: id, targetType: "artifact", targetId: `image-${imageId}`, relation: "generated_from", actionRunId: actionRun.id });
    return this.generatedResult(actionRun, input.kind === "location" ? "locations" : input.kind === "prop" ? "props" : "characters", { type: input.kind, id: entityId(input.kind, id), label: asset.name } as ContextEntityRef, { imageId, filePath: job.result.uri }, version);
  }

  async generateStoryboardPlan(actionRun: ActionRun, input: { sceneId: string; shots: Array<{ prompt: string; videoDesc: string; duration?: number; shotSize?: string; cameraMovement?: string; assetIds?: string[] }> }): Promise<any> {
    const projectId = numericEntityId(actionRun.projectId, "project");
    const episodeId = this.episodeId(actionRun);
    const sceneId = Number(input.sceneId.split(":").pop());
    const scene = await (db as any)("o_scene").where({ id: sceneId, projectId }).first();
    if (!scene) throw new Error(`Scene not found: ${input.sceneId}`);
    const created = [];
    for (const [index, shot] of input.shots.entries()) {
      const [trackId] = await db("o_videoTrack").insert({ projectId, scriptId: episodeId, state: "未生成", duration: shot.duration || 5 });
      const [id] = await db("o_storyboard").insert({
        projectId, scriptId: episodeId, sceneId, trackId, index,
        prompt: shot.prompt, videoDesc: shot.videoDesc, duration: String(shot.duration || 5),
        shotSize: shot.shotSize || null, cameraMovement: shot.cameraMovement || null,
        state: "未生成", shouldGenerateImage: 1, createTime: Date.now(), updateTime: Date.now(),
      } as any);
      for (const ref of shot.assetIds || []) {
        await db("o_assets2Storyboard").insert({ storyboardId: id, assetId: Number(ref.split(":").pop()) });
      }
      await artifactGraph.link({ projectId, sourceType: "scene", sourceId: sceneId, targetType: "shot", targetId: id, relation: "contains", actionRunId: actionRun.id });
      created.push({ id: entityId("shot", id), ...shot, index });
    }
    const version = await artifactVersionService.save({ projectId, artifactType: "scene", artifactKey: `scene:${sceneId}:storyboard-plan`, instanceId: actionRun.instanceId, content: created, provenance: { actionRunId: actionRun.id, inputReferences: [input.sceneId], reason: actionRun.userInstruction } });
    return this.generatedResult(actionRun, "storyboard", { type: "scene", id: entityId("scene", sceneId), label: scene.title } as ContextEntityRef, { shots: created }, version, "refresh");
  }

  async generateStoryboardImages(actionRun: ActionRun, input: { shotIds: string[] }): Promise<any> {
    const projectId = numericEntityId(actionRun.projectId, "project");
    const results = [];
    for (const shotRef of input.shotIds) {
      const id = Number(shotRef.split(":").pop());
      const shot = await db("o_storyboard").where({ id, projectId }).first();
      if (!shot) throw new Error(`Shot not found: ${shotRef}`);
      const refs = await db("o_assets2Storyboard").where("storyboardId", id).pluck("assetId");
      const job = await this.generation.submit({ capability: "image", projectId, actionRunId: actionRun.id, prompt: shot.prompt || shot.videoDesc || "", inputReferences: refs.map((assetId: number) => `artifact:${assetId}`) });
      if (job.status !== "completed" || !job.result?.uri) throw new Error(job.error?.message || `镜头 ${id} 生图失败`);
      await db("o_storyboard").where({ id, projectId }).update({ filePath: job.result.uri, state: "已完成", updateTime: Date.now() } as any);
      const version = await artifactVersionService.save({ projectId, artifactType: "image", artifactKey: `shot:${id}:image`, instanceId: actionRun.instanceId, filePath: job.result.uri, content: { shotId: id, prompt: shot.prompt }, provenance: { actionRunId: actionRun.id, provider: job.result.provider, model: job.result.model, promptVersion: "v1", inputReferences: [shotRef, ...refs.map((assetId: number) => `artifact:${assetId}`)] } });
      await artifactGraph.link({ projectId, sourceType: "shot", sourceId: id, targetType: "artifact", targetId: `storyboard-image-${id}-v${version}`, relation: "generated_from", actionRunId: actionRun.id });
      results.push({ shotId: shotRef, filePath: job.result.uri, version });
    }
    return this.generatedResult(actionRun, "storyboard", { type: "shot", id: entityId("shot", input.shotIds[0].split(":").pop()!) } as ContextEntityRef, { images: results }, Math.max(...results.map(item => item.version)), "refresh");
  }

  async generateVideoClip(actionRun: ActionRun, input: { shotId: string; prompt?: string; duration?: number; resolution?: string; audio?: boolean }): Promise<any> {
    const projectId = numericEntityId(actionRun.projectId, "project");
    const episodeId = this.episodeId(actionRun);
    const shotId = Number(input.shotId.split(":").pop());
    const shot = await db("o_storyboard").where({ id: shotId, projectId }).first();
    if (!shot) throw new Error(`Shot not found: ${input.shotId}`);
    const job = await this.generation.submit({ capability: "video", projectId, actionRunId: actionRun.id, prompt: input.prompt || shot.videoDesc || shot.prompt || "", inputReferences: shot.filePath ? [input.shotId] : [], options: { duration: input.duration || Number(shot.duration || 5), resolution: input.resolution || "1080p", audio: input.audio } });
    if (job.status !== "completed" || !job.result?.uri) throw new Error(job.error?.message || "视频生成失败");
    const [videoId] = await db("o_video").insert({ filePath: job.result.uri, time: Date.now(), state: "生成成功", scriptId: episodeId, projectId, videoTrackId: shot.trackId });
    await db("o_videoTrack").where({ id: shot.trackId, projectId }).update({ selectVideoId: videoId, state: "已完成" });
    const version = await artifactVersionService.save({ projectId, artifactType: "video", artifactKey: `shot:${shotId}:video`, instanceId: actionRun.instanceId, filePath: job.result.uri, content: { videoId, shotId, prompt: input.prompt || shot.videoDesc }, provenance: { actionRunId: actionRun.id, provider: job.result.provider, model: job.result.model, promptVersion: "v1", inputReferences: [input.shotId] } });
    await artifactGraph.link({ projectId, sourceType: "shot", sourceId: shotId, targetType: "artifact", targetId: `video-${videoId}`, relation: "generated_from", actionRunId: actionRun.id });
    return this.generatedResult(actionRun, "video", { type: "shot", id: entityId("shot", shotId) } as ContextEntityRef, { videoId, filePath: job.result.uri }, version);
  }

  async generateAudioTrack(actionRun: ActionRun, input: { name: string; prompt: string; referenceIds?: string[] }): Promise<any> {
    const projectId = numericEntityId(actionRun.projectId, "project");
    const job = await this.generation.submit({ capability: "audio", projectId, actionRunId: actionRun.id, prompt: input.prompt, inputReferences: input.referenceIds || [] });
    if (job.status !== "completed" || !job.result?.uri) throw new Error(job.error?.message || "音频生成失败");
    const [assetId] = await db("o_assets").insert({ name: input.name, describe: input.prompt, type: "audio", projectId, startTime: Date.now(), source: "harness-v3", createdBy: "ai-director" } as any);
    const [imageId] = await db("o_image").insert({ filePath: job.result.uri, type: "audio", assetsId: assetId, state: "已完成", model: job.result.model });
    await db("o_assets").where({ id: assetId, projectId }).update({ imageId });
    const version = await artifactVersionService.save({ projectId, artifactType: "audio", artifactKey: `audio:${assetId}`, instanceId: actionRun.instanceId, filePath: job.result.uri, content: { assetId, prompt: input.prompt }, provenance: { actionRunId: actionRun.id, provider: job.result.provider, model: job.result.model, promptVersion: "v1", inputReferences: input.referenceIds || [] } });
    return this.generatedResult(actionRun, "assets", { type: "artifact", id: entityId("artifact", `audio-${assetId}`), label: input.name } as ContextEntityRef, { assetId, filePath: job.result.uri }, version);
  }

  async saveTimeline(actionRun: ActionRun, input: { name: string; clips: Array<{ videoId: number; start: number; duration: number }>; audioIds?: number[] }): Promise<any> {
    const projectId = numericEntityId(actionRun.projectId, "project");
    if (!(await db.schema.hasTable("o_timeline"))) {
      await db.schema.createTable("o_timeline", table => { table.increments("id").primary(); table.integer("projectId").index(); table.integer("episodeId").index(); table.string("name"); table.text("clips"); table.text("audioIds"); table.string("source"); table.integer("createTime"); table.integer("updateTime"); });
    }
    const [id] = await (db as any)("o_timeline").insert({ projectId, episodeId: this.episodeId(actionRun), name: input.name, clips: JSON.stringify(input.clips), audioIds: JSON.stringify(input.audioIds || []), source: "harness-v3", createTime: Date.now(), updateTime: Date.now() });
    const version = await artifactVersionService.save({ projectId, artifactType: "timeline", artifactKey: `timeline:${id}`, instanceId: actionRun.instanceId, content: input, provenance: { actionRunId: actionRun.id, inputReferences: input.clips.map(clip => `video:${clip.videoId}`) } });
    return this.generatedResult(actionRun, "video", { type: "artifact", id: entityId("artifact", `timeline-${id}`), label: input.name } as ContextEntityRef, { timelineId: id, ...input }, version);
  }

  private generatedResult(actionRun: ActionRun, domain: UiPatch["domain"], target: ContextEntityRef, data: Record<string, unknown>, version: number, operation: UiPatch["operation"] = "update") {
    return { ...data, version, uiPatch: { id: `patch-${uuid()}`, actionRunId: actionRun.id, domain, operation, target: { ...target, version }, changes: data, version, timestamp: Date.now() } as UiPatch };
  }

  private episodeId(actionRun: ActionRun): number {
    if (!actionRun.episodeId) throw new Error("当前操作需要选择一个剧集/剧本");
    return numericEntityId(actionRun.episodeId, "episode");
  }

  private assetType(kind: "character" | "prop" | "location") { return kind === "character" ? "role" : kind === "prop" ? "tool" : "scene"; }
}
