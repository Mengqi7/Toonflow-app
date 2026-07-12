import { v4 as uuid } from "uuid";
import { db } from "@/utils/db";
import { harnessEventBus } from "../HarnessEventBus";
import { entityId, numericEntityId, type ShotId } from "./ids";
import { artifactGraph } from "../workbench/ArtifactGraph";
import type { ActionRun, ContextEntityRef, UiPatch } from "../workbench/contracts";

export interface UpdateShotInput {
  shotId: ShotId;
  patch: {
    shotSize?: string;
    cameraMovement?: string;
    prompt?: string;
    videoDesc?: string;
    duration?: number;
  };
  preserve?: Array<"characterRefs" | "propRefs" | "locationRef" | "costume" | "visualIdentity">;
  reason?: string;
}

export interface UpdateShotOutput {
  shotId: ShotId;
  changedFields: string[];
  preservedFields: string[];
  version: number;
  shot: Record<string, unknown>;
  uiPatch: UiPatch;
}

export class ToonflowDomainService {
  async ensureSchema(): Promise<void> {
    if (await db.schema.hasTable("o_storyboard")) {
      const columns: Array<[string, (table: any) => void]> = [
        ["shotSize", table => table.string("shotSize")],
        ["cameraMovement", table => table.string("cameraMovement")],
        ["lockedRefs", table => table.text("lockedRefs")],
        ["updateTime", table => table.integer("updateTime")],
      ];
      for (const [column, add] of columns) {
        if (!(await db.schema.hasColumn("o_storyboard", column))) {
          await db.schema.alterTable("o_storyboard", add);
        }
      }
    }
    await this.ensureVersionColumns();
    await artifactGraph.ensureTable();
  }

  async updateShot(input: UpdateShotInput, actionRun: ActionRun, signal: AbortSignal): Promise<UpdateShotOutput> {
    await this.ensureSchema();
    if (signal.aborted) throw new Error("Operation cancelled");
    const projectId = numericEntityId(actionRun.projectId, "project");
    const shotId = numericEntityId(input.shotId, "shot");
    const allowedFields = ["shotSize", "cameraMovement", "prompt", "videoDesc", "duration"] as const;
    const patch = Object.fromEntries(Object.entries(input.patch).filter(([key, value]) => allowedFields.includes(key as any) && value !== undefined));
    const changedFields = Object.keys(patch);
    if (!changedFields.length) throw new Error("No supported shot fields were provided");

    const result = await db.transaction(async trx => {
      const current = await trx("o_storyboard").where({ id: shotId, projectId }).first();
      if (!current) throw new Error(`Shot not found in current project: ${input.shotId}`);

      const artifactKey = `shot:${shotId}`;
      const existingVersion = await trx("o_artifact_version")
        .where({ projectId, artifactType: "shot", artifactKey })
        .max("version as maxVersion")
        .first();
      let version = Number(existingVersion?.maxVersion || 0);
      if (version === 0) {
        version = await this.insertVersion(trx, {
          projectId,
          artifactKey,
          actionRun,
          content: current,
          version: 1,
          source: "baseline",
          reason: "AI 修改前自动建立基线版本",
        });
      }

      const update = {
        ...patch,
        lockedRefs: JSON.stringify(input.preserve || []),
        updateTime: Date.now(),
      };
      await trx("o_storyboard").where({ id: shotId, projectId }).update(update);
      const updated = await trx("o_storyboard").where({ id: shotId, projectId }).first();
      version = await this.insertVersion(trx, {
        projectId,
        artifactKey,
        actionRun,
        content: updated,
        version: version + 1,
        source: "action_run",
        reason: input.reason || actionRun.userInstruction,
      });
      return { updated, version, scriptId: current.scriptId };
    });

    if (result.scriptId) {
      await artifactGraph.link({ projectId, sourceType: "script", sourceId: result.scriptId, targetType: "shot", targetId: shotId, relation: "contains", actionRunId: actionRun.id });
    }
    const assetRows = await db("o_assets2Storyboard")
      .join("o_assets", "o_assets.id", "o_assets2Storyboard.assetId")
      .where("o_assets2Storyboard.storyboardId", shotId)
      .select("o_assets.id", "o_assets.type");
    for (const asset of assetRows) {
      const kind = asset.type === "role" ? "character" : asset.type === "tool" ? "prop" : "location";
      await artifactGraph.link({ projectId, sourceType: "shot", sourceId: shotId, targetType: kind, targetId: asset.id, relation: "references", actionRunId: actionRun.id });
    }

    const target = { type: "shot", id: input.shotId, version: result.version } as ContextEntityRef;
    const uiPatch: UiPatch = {
      id: `patch-${uuid()}`,
      actionRunId: actionRun.id,
      domain: "storyboard",
      operation: "update",
      target,
      changes: patch,
      version: result.version,
      timestamp: Date.now(),
    };
    await harnessEventBus.emitWorkbenchEvent({
      kind: "entity.updated",
      actionRunId: actionRun.id,
      instanceId: actionRun.instanceId,
      projectId: actionRun.projectId,
      entity: target,
      payload: { changedFields, preservedFields: input.preserve || [], version: result.version },
    });
    await harnessEventBus.emitWorkbenchEvent({
      kind: "artifact.version_created",
      actionRunId: actionRun.id,
      instanceId: actionRun.instanceId,
      projectId: actionRun.projectId,
      entity: target,
      payload: { artifactKey: `shot:${shotId}`, version: result.version },
    });
    return {
      shotId: input.shotId,
      changedFields,
      preservedFields: input.preserve || [],
      version: result.version,
      shot: result.updated,
      uiPatch,
    };
  }

  private async ensureVersionColumns(): Promise<void> {
    if (!(await db.schema.hasTable("o_artifact_version"))) return;
    const columns: Array<[string, (table: any) => void]> = [
      ["actionRunId", table => table.string("actionRunId").index()],
      ["provider", table => table.string("provider")],
      ["model", table => table.string("model")],
      ["promptVersion", table => table.string("promptVersion")],
      ["inputReferences", table => table.text("inputReferences")],
      ["reviewResult", table => table.text("reviewResult")],
      ["createdBy", table => table.string("createdBy")],
      ["reason", table => table.text("reason")],
    ];
    for (const [column, add] of columns) {
      if (!(await db.schema.hasColumn("o_artifact_version", column))) {
        await db.schema.alterTable("o_artifact_version", add);
      }
    }
  }

  private async insertVersion(trx: any, input: {
    projectId: number;
    artifactKey: string;
    actionRun: ActionRun;
    content: unknown;
    version: number;
    source: string;
    reason: string;
  }): Promise<number> {
    await trx("o_artifact_version").insert({
      artifactType: "shot",
      artifactKey: input.artifactKey,
      projectId: input.projectId,
      instanceId: input.actionRun.instanceId,
      version: input.version,
      content: JSON.stringify(input.content),
      filePath: (input.content as any)?.filePath || null,
      reviewScore: null,
      reviewFeedback: null,
      source: input.source,
      actionRunId: input.actionRun.id,
      inputReferences: JSON.stringify(input.actionRun.contextSnapshot.selected.map(ref => String(ref.id))),
      createdBy: "ai-director",
      reason: input.reason,
      createdAt: Date.now(),
    });
    return input.version;
  }
}

export const toonflowDomainService = new ToonflowDomainService();
