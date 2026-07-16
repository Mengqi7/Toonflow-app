import { v4 as uuid } from "uuid";
import { db } from "@/utils/db";
import { harness } from "../init";
import { harnessEventBus } from "../HarnessEventBus";
import { entityId, numericEntityId, type EntityKind } from "./ids";
import type { ActionRun, ContextEntityRef, UiPatch, WorkbenchDomain } from "../workbench/contracts";

export type ReviewableType = "stage" | "script" | "beat" | "scene" | "shot" | "character" | "prop" | "location" | "video" | "audio" | "timeline";

export interface ReviewRequest {
  artifactType: ReviewableType;
  artifactId: string;
  reviewer?: string;
  criteriaAgent?: string;
  reference?: unknown;
  output?: unknown;
  attemptNumber?: number;
}

export class ReviewDomainService {
  async request(actionRun: ActionRun, input: ReviewRequest): Promise<any> {
    await this.ensureTable();
    if (!harness.reviewPipeline) throw new Error("ReviewPipeline 未初始化");
    const projectId = numericEntityId(actionRun.projectId, "project");
    const artifactId = this.normaliseArtifactId(input.artifactType, input.artifactId);
    const output = input.output === undefined ? await this.loadArtifact(projectId, input.artifactType, artifactId) : input.output;
    const reviewer = input.reviewer || this.defaultReviewer(input.artifactType, artifactId);
    const criteriaAgent = input.criteriaAgent || this.defaultCriteriaAgent(input.artifactType, artifactId);
    const reference = input.reference === undefined ? await this.loadReference(projectId, input.artifactType, artifactId, actionRun) : input.reference;
    await harnessEventBus.emitWorkbenchEvent({
      kind: "review.requested",
      actionRunId: actionRun.id,
      instanceId: actionRun.instanceId,
      projectId: actionRun.projectId,
      entity: this.ref(input.artifactType, artifactId, output),
      payload: { reviewer, criteriaAgent },
    });
    const score = await harness.reviewPipeline.review(criteriaAgent, output, reference);
    const id = await this.insertReviewReport({
      projectId,
      workflowInstanceId: actionRun.instanceId,
      nodeId: actionRun.id,
      targetType: input.artifactType,
      targetId: artifactId,
      attemptNumber: input.attemptNumber || 1,
      scores: JSON.stringify(score),
      totalScore: score.overall,
      decision: score.passed ? "approved" : "rejected",
      feedback: score.feedback || null,
      createTime: Date.now(),
    });
    const entity = this.ref(input.artifactType, artifactId, output);
    const uiPatch = this.patch(actionRun, entity, { reviewId: id, score, decision: score.passed ? "approved" : "rejected" });
    await harnessEventBus.emitWorkbenchEvent({
      kind: "review.completed",
      actionRunId: actionRun.id,
      instanceId: actionRun.instanceId,
      projectId: actionRun.projectId,
      entity,
      payload: { reviewId: id, reviewer, criteriaAgent, score },
    });
    const label = entity.label || `${input.artifactType}:${artifactId}`;
    return {
      reviewId: id,
      artifactType: input.artifactType,
      artifactId,
      reviewer,
      criteriaAgent,
      score,
      decision: score.passed ? "approved" : "rejected",
      summary: `${label} 审核${score.passed ? "通过" : "未通过"}，评分 ${Math.round(score.overall * 100)}。`,
      delegatedSteps: [{
        role: `Quality Supervisor · ${reviewer}`,
        tool: "review.request",
        status: score.passed ? "completed" : "failed",
        detail: `${Math.round(score.overall * 100)} 分${score.feedback ? ` · ${score.feedback}` : ""}`,
      }],
      artifactIds: [String(entity.id)],
      reviewRequired: !score.passed,
      nextAction: score.passed ? "审核已通过，可以继续下一制作阶段。" : "根据问题定向返工后重新审核。",
      uiPatch,
    };
  }

  private defaultCriteriaAgent(type: ReviewableType, id: string): string {
    if (type === "script" || type === "beat" || type === "scene") return "screenwriter";
    if (type === "shot") return "assistant_director";
    if (type === "character") return "costume";
    if (type === "prop" || type === "location") return "set_decorator";
    if (type === "video") return "vfx";
    if (type === "audio") return "sound_designer";
    if (type === "timeline") return "editor";
    const stage = id.split(":")[0];
    if (["storySkeleton", "adaptationStrategy"].includes(stage)) return "screenwriter";
    if (stage === "directorPlan") return "director";
    if (stage === "assets") return "set_decorator";
    if (stage === "storyboard") return "assistant_director";
    if (stage === "video") return "vfx";
    return "supervisor";
  }

  async approve(actionRun: ActionRun, input: { reviewId: string; note?: string; final?: boolean }): Promise<any> {
    await this.ensureTable();
    const report = await db("o_review_report").where("id", input.reviewId).first();
    if (!report) throw new Error(`Review report not found: ${input.reviewId}`);
    await db("o_review_report").where("id", input.reviewId).update({ decision: input.final ? "final_approved" : "approved", feedback: input.note || report.feedback });
    const entity = this.ref(report.targetType, report.targetId, {});
    const uiPatch = this.patch(actionRun, entity, { reviewId: input.reviewId, decision: input.final ? "final_approved" : "approved", note: input.note });
    await harnessEventBus.emitWorkbenchEvent({ kind: "review.approved", actionRunId: actionRun.id, instanceId: actionRun.instanceId, projectId: actionRun.projectId, entity, payload: { reviewId: input.reviewId, final: Boolean(input.final), note: input.note } });
    return { reviewId: input.reviewId, decision: input.final ? "final_approved" : "approved", uiPatch };
  }

  async reroute(actionRun: ActionRun, input: { reviewId: string; targetAgent: string; instruction: string }): Promise<any> {
    await this.ensureTable();
    const report = await db("o_review_report").where("id", input.reviewId).first();
    if (!report) throw new Error(`Review report not found: ${input.reviewId}`);
    const score = this.parse(report.scores, {});
    const retryInstruction = harness.reviewPipeline
      ? await harness.reviewPipeline.generateRetryInstruction(input.targetAgent, await this.loadArtifact(numericEntityId(actionRun.projectId, "project"), report.targetType, report.targetId), score as any, Number(report.attemptNumber || 1), 3, async () => [input.instruction])
      : { targetAgentId: input.targetAgent, suggestions: [input.instruction] };
    await db("o_review_report").where("id", input.reviewId).update({ decision: "rerouted", feedback: input.instruction, attemptNumber: Number(report.attemptNumber || 1) + 1 });
    const entity = this.ref(report.targetType, report.targetId, {});
    const uiPatch = this.patch(actionRun, entity, { reviewId: input.reviewId, decision: "rerouted", targetAgent: input.targetAgent, retryInstruction });
    await harnessEventBus.emitWorkbenchEvent({ kind: "review.rerouted", actionRunId: actionRun.id, instanceId: actionRun.instanceId, projectId: actionRun.projectId, entity, payload: { reviewId: input.reviewId, targetAgent: input.targetAgent, retryInstruction } });
    return { reviewId: input.reviewId, decision: "rerouted", targetAgent: input.targetAgent, retryInstruction, uiPatch };
  }

  private async ensureTable(): Promise<void> {
    if (!(await db.schema.hasTable("o_review_report"))) await db.schema.createTable("o_review_report", table => {
      table.string("id").primary();
      table.string("workflowInstanceId").index();
      table.string("nodeId");
      table.string("targetType");
      table.string("targetId");
      table.integer("attemptNumber");
      table.text("scores");
      table.float("totalScore");
      table.string("decision");
      table.text("feedback");
      table.integer("createTime");
    });
    const additions: Array<[string, (table: any) => void]> = [
      ["projectId", table => table.integer("projectId").index()],
      ["workflowInstanceId", table => table.string("workflowInstanceId").index()],
      ["nodeId", table => table.string("nodeId")],
      ["targetType", table => table.string("targetType")],
      ["targetId", table => table.string("targetId")],
      ["attemptNumber", table => table.integer("attemptNumber")],
      ["scores", table => table.text("scores")],
      ["totalScore", table => table.float("totalScore")],
      ["decision", table => table.string("decision")],
      ["feedback", table => table.text("feedback")],
      ["createTime", table => table.integer("createTime")],
    ];
    for (const [column, add] of additions) {
      if (!(await db.schema.hasColumn("o_review_report", column))) await db.schema.alterTable("o_review_report", add);
    }
  }

  private async insertReviewReport(record: Record<string, unknown>): Promise<string> {
    const columns = await db.raw("PRAGMA table_info(o_review_report)");
    const idColumn = (Array.isArray(columns) ? columns : columns?.[0] || []).find((column: any) => column.name === "id");
    const id = `review-${uuid()}`;
    const isNumericId = /int/i.test(String(idColumn?.type || ""));
    if (!isNumericId) {
      await db("o_review_report").insert({ id, ...record } as any);
      return id;
    }
    const inserted = await db("o_review_report").insert(record as any);
    return String(Array.isArray(inserted) ? inserted[0] : inserted);
  }

  private async loadArtifact(projectId: number, type: ReviewableType, id: string): Promise<any> {
    if (type === "stage") return this.loadStageArtifact(projectId, id);
    const numericId = Number(id);
    const table = type === "script" ? "o_script" : type === "beat" ? "o_beat" : type === "scene" ? "o_scene" : type === "shot" ? "o_storyboard" : ["character", "prop", "location", "audio"].includes(type) ? "o_assets" : type === "video" ? "o_video" : "o_timeline";
    if (!(await db.schema.hasTable(table))) throw new Error(`Artifact table is not available: ${table}`);
    let query = (db as any)(table).where({ id: numericId, projectId });
    if (["character", "prop", "location", "audio"].includes(type)) {
      const assetType = type === "character" ? "role" : type === "prop" ? "tool" : type === "location" ? "scene" : "audio";
      query = query.andWhere("type", assetType);
    }
    const row = await query.first();
    if (!row) throw new Error(`Artifact not found: ${type}:${id}`);
    return row;
  }

  private async loadStageArtifact(projectId: number, id: string): Promise<any> {
    const [field, scopedId] = id.split(":", 2);
    if (["storySkeleton", "adaptationStrategy"].includes(field)) {
      const row = await db("o_agentWorkData").where({ projectId, key: "scriptAgent" }).first();
      const data = this.parse(row?.data, {}) as Record<string, unknown>;
      const content = data[field];
      if (!content) throw new Error(`Stage artifact not found: ${field}`);
      return { stage: field, content, projectId };
    }
    if (field === "directorPlan") {
      const query = db("o_agentWorkData").where({ projectId, key: "productionAgent" });
      if (scopedId) query.andWhere("episodesId", Number(scopedId));
      const row = await query.orderBy("id", "desc").first();
      const data = this.parse(row?.data, {}) as Record<string, unknown>;
      if (!data.directorPlan) throw new Error("Stage artifact not found: directorPlan");
      return { stage: field, content: data.directorPlan, scriptId: row.episodesId, projectId };
    }
    if (field === "assets") {
      const rows = await db("o_assets").where({ projectId, ...(scopedId ? { scriptId: Number(scopedId) } : {}) }).select("id", "name", "type", "describe", "prompt");
      if (!rows.length) throw new Error("Stage artifact not found: assets");
      return { stage: field, scriptId: scopedId, assets: rows };
    }
    if (field === "storyboard") {
      const rows = await db("o_storyboard").where({ projectId, ...(scopedId ? { scriptId: Number(scopedId) } : {}) }).select("id", "index", "prompt", "videoDesc", "shotSize", "cameraMovement", "duration");
      if (!rows.length) throw new Error("Stage artifact not found: storyboard");
      return { stage: field, scriptId: scopedId, shots: rows };
    }
    throw new Error(`Unknown stage artifact: ${id}`);
  }

  private async loadReference(projectId: number, type: ReviewableType, id: string, actionRun: ActionRun): Promise<unknown> {
    if (["stage", "script", "beat", "scene"].includes(type)) {
      const chapters = await db("o_novel").where({ projectId }).orderBy("chapterIndex", "asc");
      const novel = chapters.map((row: any) => row.chapterData || row.content || "").filter(Boolean).join("\n\n");
      if (novel) return { novel: novel.slice(0, 12000), artifactId: id };
    }
    return actionRun.contextSnapshot.upstreamArtifacts;
  }

  private normaliseArtifactId(type: ReviewableType, value: string): string {
    const raw = String(value);
    return raw.startsWith(`${type}:`) ? raw.slice(type.length + 1) : raw;
  }

  private ref(type: ReviewableType, id: string, record: any): ContextEntityRef {
    const entityType: EntityKind = ["stage", "video", "audio", "timeline"].includes(type) ? "artifact" : type as EntityKind;
    return { type: entityType, id: entityId(entityType, entityType === "artifact" ? `${type}-${id}` : id), label: record?.name || record?.title || `${type}:${id}` } as ContextEntityRef;
  }

  private patch(actionRun: ActionRun, target: ContextEntityRef, changes: Record<string, unknown>): UiPatch {
    return { id: `patch-${uuid()}`, actionRunId: actionRun.id, domain: this.domainFor(target.type), operation: "update", target, changes, timestamp: Date.now() };
  }

  private domainFor(type: ContextEntityRef["type"]): WorkbenchDomain {
    if (type === "script") return "script";
    if (type === "beat") return "beats";
    if (type === "scene") return "scenes";
    if (type === "shot") return "storyboard";
    if (type === "character") return "characters";
    if (type === "prop") return "props";
    if (type === "location") return "locations";
    return "assets";
  }

  private defaultReviewer(type: ReviewableType, artifactId = ""): string {
    if (type === "stage") {
      if (/assets/i.test(artifactId)) return "producer";
      if (/storyboard|directorPlan/i.test(artifactId)) return "supervisor";
      return "script_supervisor";
    }
    if (["script", "beat", "scene"].includes(type)) return "script_supervisor";
    if (["shot", "video"].includes(type)) return "supervisor";
    return "producer";
  }

  private parse(value: string | null | undefined, fallback: unknown): unknown {
    if (!value) return fallback;
    try { return JSON.parse(value); } catch { return fallback; }
  }
}

export const reviewDomainService = new ReviewDomainService();
