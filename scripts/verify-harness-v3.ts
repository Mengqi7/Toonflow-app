import assert from "node:assert/strict";
import { db } from "../src/utils/db";
import { entityId } from "../src/core/harness/domain/ids";
import { ContextResolver } from "../src/core/harness/workbench/ContextResolver";
import { workbenchToolRuntime, conversationalDirector } from "../src/core/harness/workbench";
import { artifactVersionService } from "../src/core/harness/domain/ArtifactVersionService";
import { actionRunStore } from "../src/core/harness/tools/ActionRunStore";

async function main() {
  await new Promise(resolve => setTimeout(resolve, 500));
  const suffix = Date.now();
  const projectId = suffix;
  const scriptId = suffix + 1;
  const shotId = suffix + 2;
  const trackId = suffix + 3;
  const instanceId = `verify-harness-v3-${suffix}`;
  const createdSceneIds: number[] = [];

  try {
    await db("o_project").insert({ id: projectId, name: "__HARNESS_V3_VERIFY__", projectType: "novel", videoRatio: "16:9", imageQuality: "1K", createTime: Date.now(), userId: 1 });
    await db("o_script").insert({ id: scriptId, projectId, name: "验证剧集", content: "场 1：验证场景", createTime: Date.now(), extractState: 1 });
    await db("o_videoTrack").insert({ id: trackId, projectId, scriptId, state: "未生成" });
    await db("o_storyboard").insert({ id: shotId, projectId, scriptId, trackId, index: 0, prompt: "wide shot", videoDesc: "验证镜头", duration: "5", state: "未生成", shouldGenerateImage: 1, createTime: Date.now() });

    const resolver = new ContextResolver();
    const baseInput = { route: "/production", domain: "storyboard" as const, projectId, episodeId: scriptId, selected: [{ type: "shot" as const, id: shotId, label: "镜头 1" }], visible: [] };
    const context = await resolver.resolve(baseInput);
    assert.equal(context.route.projectId, entityId("project", projectId));
    assert.equal(context.selected.some(ref => ref.id === entityId("shot", shotId)), true);

    const sceneContext = await resolver.resolve({ ...baseInput, domain: "scenes", route: "/scriptAgent", selected: [] });
    const sceneRun = await conversationalDirector.executeInstruction(instanceId, "创建一场“雨夜重逢”，两人在旧宅门口相遇", sceneContext);
    assert.equal(sceneRun.status, "completed");
    assert.equal(sceneRun.toolCalls[0].toolName, "scene.create");
    const createdSceneId = Number(String((sceneRun.result as any).entity.id).split(":").pop());
    createdSceneIds.push(createdSceneId);

    const shotRun = await conversationalDirector.executeInstruction(instanceId, "把当前镜头改成中近景，保留人物服装和场景不变", context);
    assert.equal(shotRun.status, "completed");
    assert.equal((await db("o_storyboard").where("id", shotId).first()).shotSize, "中近景");
    const versions = await artifactVersionService.list(projectId, "shot", `shot:${shotId}`);
    assert.equal(versions.length >= 2, true);

    const rollbackPlan = {
      summary: "回滚分镜",
      steps: [{ toolName: "artifact.rollback", purpose: "验证回滚", targetIds: [`shot:${shotId}`] }],
      affectedObjects: [{ type: "shot" as const, id: entityId("shot", shotId) }],
      requiresConfirmation: true,
    };
    const rollbackPending = await workbenchToolRuntime.execute({ instanceId, userInstruction: "回滚到版本1", context, plan: rollbackPlan, toolName: "artifact.rollback", input: { artifactType: "shot", artifactId: `shot:${shotId}`, version: 1, reason: "自动验证" } });
    assert.equal(rollbackPending.status, "awaiting_confirmation");
    const rollbackDone = await workbenchToolRuntime.confirm(rollbackPending.id);
    assert.equal(rollbackDone.status, "completed");
    const afterRollback = await artifactVersionService.list(projectId, "shot", `shot:${shotId}`);
    assert.equal(afterRollback.length, versions.length + 1);

    const batchPlan = { summary: "批量生图", steps: [{ toolName: "storyboard.generate_image", purpose: "验证确认", targetIds: [`shot:${shotId}`, `shot:${shotId + 1}`] }], affectedObjects: [], requiresConfirmation: true };
    const batchPending = await workbenchToolRuntime.execute({ instanceId, userInstruction: "批量生成两张分镜图", context, plan: batchPlan, toolName: "storyboard.generate_image", input: { shotIds: [`shot:${shotId}`, `shot:${shotId + 1}`] } });
    assert.equal(batchPending.status, "awaiting_confirmation");
    assert.equal(await workbenchToolRuntime.cancel(batchPending.id), true);
    assert.equal((await actionRunStore.get(batchPending.id))?.status, "cancelled");

    console.log(JSON.stringify({ ok: true, context: true, sceneCreation: true, storyboardRevision: true, versionRollback: true, confirmationCancellation: true }));
  } finally {
    await db("o_action_run").where("instanceId", instanceId).delete().catch(() => undefined);
    await db("o_generation_job").where("actionRunId", "like", `${instanceId}%`).delete().catch(() => undefined);
    await db("o_review_report").where("workflowInstanceId", instanceId).delete().catch(() => undefined);
    await db("o_artifact_version").where("projectId", projectId).delete().catch(() => undefined);
    await db("o_artifact_link").where("projectId", projectId).delete().catch(() => undefined);
    if (createdSceneIds.length && await db.schema.hasTable("o_scene")) await (db as any)("o_scene").whereIn("id", createdSceneIds).delete();
    await db("o_storyboard").where("projectId", projectId).delete();
    await db("o_videoTrack").where("projectId", projectId).delete();
    await db("o_script").where("projectId", projectId).delete();
    await db("o_project").where("id", projectId).delete();
    await db.destroy();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
