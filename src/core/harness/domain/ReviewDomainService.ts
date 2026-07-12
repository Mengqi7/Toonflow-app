import { v4 as uuid } from "uuid";
import { db } from "@/utils/db";
import { harness } from "../init";
import { harnessEventBus } from "../HarnessEventBus";
import { entityId, numericEntityId, type EntityKind } from "./ids";
import type { ActionRun, ContextEntityRef, UiPatch, WorkbenchDomain } from "../workbench/contracts";

type ReviewableType = "script" | "beat" | "scene" | "shot" | "character" | "prop" | "location" | "video" | "audio" | "timeline";

export class ReviewDomainService {
  async request(actionRun: ActionRun, input: { artifactType: ReviewableType; artifactId: string; reviewer?: string; reference?: unknown }): Promise<any> {
    await this.ensureTable();
    if (!harness.reviewPipeline) throw new Error("ReviewPipeline 未初始化");
    const projectId = numericEntityId(actionRun.projectId, "project");
    const artifactId = String(input.artifactId).split(":").pop()!;
    const output = await this.loadArtifact(projectId, input.artifactType, artifactId);
    const reviewer = input.reviewer || this.defaultReviewer(input.artifactType);
    await harnessEventBus.emitWorkbenchEvent({
      kind: "review.requested",
      actionRunId: actionRun.id,
      instanceId: actionRun.instanceId,
      projectId: actionRun.projectId,
      entity: this.ref(input.artifactType, artifactId, output),
      payload: { reviewer },
    });
    const score = await harness.reviewPipeline.review(reviewer, output, input.reference || actionRun.contextSnapshot.upstreamArtifacts);
    const id = `review-${uuid()}`;
    await db("o_review_report").insert({
      id,
      workflowInstanceId: actionRun.instanceId,
      nodeId: actionRun.id,
      targetType: input.artifactType,
      targetId: artifactId,
      attemptNumber: 1,
      scores: JSON.stringify(score),
      totalScore: score.overall,
      decision: score.passed ? "approved" : "rejected",
      feedback: score.feedback || null,
      createTime: Date.now(),
    } as any);
    const entity = this.ref(input.artifactType, artifactId, output);
    const uiPatch = this.patch(actionRun, entity, { reviewId: id, score, decision: score.passed ? "approved" : "rejected" });
    await harnessEventBus.emitWorkbenchEvent({
      kind: "review.completed",
      actionRunId: actionRun.id,
      instanceId: actionRun.instanceId,
      projectId: actionRun.projectId,
      entity,
      payload: { reviewId: id, reviewer, score },
    });
    return { reviewId: id, artifactType: input.artifactType, artifactId, reviewer, score, uiPatch };
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
    if (await db.schema.hasTable("o_review_report")) return;
    await db.schema.createTable("o_review_report", table => {
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
  }

  private async loadArtifact(projectId: number, type: ReviewableType, id: string): Promise<any> {
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

  private ref(type: ReviewableType, id: string, record: any): ContextEntityRef {
    const entityType: EntityKind = ["video", "audio", "timeline"].includes(type) ? "artifact" : type as EntityKind;
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

  private defaultReviewer(type: ReviewableType): string {
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
