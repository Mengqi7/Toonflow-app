import assert from "node:assert/strict";
import { db } from "../src/utils/db";
import { entityId } from "../src/core/harness/domain/ids";
import { ContextResolver } from "../src/core/harness/workbench/ContextResolver";
import { workbenchToolRuntime, conversationalDirector } from "../src/core/harness/workbench";
import { artifactVersionService } from "../src/core/harness/domain/ArtifactVersionService";
import { actionRunStore } from "../src/core/harness/tools/ActionRunStore";
import { SkillsRegistry } from "../src/core/harness/SkillsRegistry";
import { directorCapabilityCatalog } from "../src/core/harness/workbench/DirectorCapabilityCatalog";
import { harness } from "../src/core/harness/init";
import { ReviewPipeline } from "../src/review/ReviewPipeline";

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
    harness.reviewPipeline = new ReviewPipeline();
    await db("o_project").insert({ id: projectId, name: "__HARNESS_V3_VERIFY__", projectType: "novel", videoRatio: "16:9", imageQuality: "1K", createTime: Date.now(), userId: 1 });
    await db("o_novel").insert({ projectId, chapterIndex: 1, chapter: "Verification source", chapterData: "A courier discovers a sealed letter at an abandoned station and must deliver it before sunrise." });
    await db("o_script").insert({ id: scriptId, projectId, name: "验证剧集", content: "场 1：验证场景", createTime: Date.now(), extractState: 1 });
    await db("o_videoTrack").insert({ id: trackId, projectId, scriptId, state: "未生成" });
    await db("o_storyboard").insert({ id: shotId, projectId, scriptId, trackId, index: 0, prompt: "wide shot", videoDesc: "验证镜头", duration: "5", state: "未生成", shouldGenerateImage: 1, createTime: Date.now() });
    await db("o_assets").insert({ projectId, scriptId, name: "验证场景", type: "scene", describe: "用于验证自动续接会定位项目剧本。" });
    await db("o_agentWorkData").insert({ projectId, key: "scriptAgent", data: JSON.stringify({ storySkeleton: "已生成的故事骨架", adaptationStrategy: "已生成的改编策略" }), createTime: Date.now(), updateTime: Date.now() });

    const resolver = new ContextResolver();
    const skills = new SkillsRegistry();
    await skills.scanSkills();
    assert.ok(skills.getBySourceName("script_execution_script.md"));
    assert.ok(skills.listAll().length >= 20);
    const capabilities = await directorCapabilityCatalog.list();
    assert.equal(capabilities.length, 7);
    assert.equal(capabilities.every(item => item.enabled), true);
    const baseInput = { route: "/production", domain: "storyboard" as const, projectId, episodeId: scriptId, selected: [{ type: "shot" as const, id: shotId, label: "镜头 1" }], visible: [] };
    const context = await resolver.resolve(baseInput);
    assert.equal(context.route.projectId, entityId("project", projectId));
    assert.equal(context.selected.some(ref => ref.id === entityId("shot", shotId)), true);

    const sceneContext = await resolver.resolve({ ...baseInput, domain: "scenes", route: "/scriptAgent", selected: [] });
    const novelContext = await resolver.resolve({ route: "/novel", domain: "script", projectId, selected: [], visible: [] });
    const noSelectionContext = await resolver.resolve({ route: "/scriptAgent", domain: "script", projectId, selected: [], visible: [] });
    const directorPlan = await conversationalDirector.planInstruction("继续", noSelectionContext);
    assert.equal(directorPlan.input.stage, "director_plan");
    const naturalContinuePlan = await conversationalDirector.planInstruction("继续进入下一阶段", noSelectionContext);
    assert.equal(naturalContinuePlan.toolName, "production.run_stage");
    assert.equal(naturalContinuePlan.input.stage, "director_plan");
    const directorPlanRun = await workbenchToolRuntime.execute({
      instanceId,
      userInstruction: "继续",
      context: noSelectionContext,
      plan: directorPlan.plan,
      toolName: directorPlan.toolName,
      input: { ...directorPlan.input, mode: "draft" },
    });
    assert.equal(directorPlanRun.status, "completed", directorPlanRun.error?.message);
    assert.equal((directorPlanRun.result as any).selectedScriptId, String(scriptId));
    assert.equal((directorPlanRun.result as any).reviews?.length, 1);
    assert.equal((directorPlanRun.result as any).reviews?.[0]?.score?.passed, true);
    const reviewContext = await resolver.resolve({ route: "/scriptAgent", domain: "script", projectId, selected: [], visible: [] });
    const manualReviewPlan = await conversationalDirector.planInstruction("审核", reviewContext);
    assert.equal(manualReviewPlan.toolName, "review.request");
    assert.equal(manualReviewPlan.input.artifactType, "stage");
    assert.equal(manualReviewPlan.input.artifactId, `directorPlan:${scriptId}`);
    const explicitAdaptationReview = await conversationalDirector.planInstruction("审核当前改编策略", reviewContext);
    assert.equal(explicitAdaptationReview.toolName, "review.request");
    assert.equal(explicitAdaptationReview.input.artifactId, "adaptationStrategy");
    const generateThenReviewPlan = await conversationalDirector.planInstruction("重新生成资产设定并根据审核自动优化", reviewContext);
    assert.equal(generateThenReviewPlan.toolName, "production.run_stage");
    assert.equal(generateThenReviewPlan.input.stage, "assets");
    const manualReviewRun = await workbenchToolRuntime.execute({
      instanceId,
      userInstruction: "审核",
      context: reviewContext,
      plan: manualReviewPlan.plan,
      toolName: manualReviewPlan.toolName,
      input: manualReviewPlan.input,
    });
    assert.equal(manualReviewRun.status, "completed", manualReviewRun.error?.message);
    assert.equal((manualReviewRun.result as any).artifactId, `directorPlan:${scriptId}`);
    const repeatReviewA = await conversationalDirector.executeInstruction(instanceId, "审核当前改编策略", reviewContext, false, `${suffix}-review-a`);
    const repeatReviewAReplay = await conversationalDirector.executeInstruction(instanceId, "审核当前改编策略", reviewContext, false, `${suffix}-review-a`);
    const repeatReviewB = await conversationalDirector.executeInstruction(instanceId, "审核当前改编策略", reviewContext, false, `${suffix}-review-b`);
    assert.equal(repeatReviewA.id, repeatReviewAReplay.id);
    assert.notEqual(repeatReviewA.id, repeatReviewB.id);
    assert.equal((repeatReviewB.result as any).artifactId, "adaptationStrategy");
    assert.equal((await actionRunStore.listByProject(projectId)).every(run => run.projectId === entityId("project", projectId)), true);

    const strictReviewPipeline = new ReviewPipeline({
      rulesEngine: {
        listAll: () => [{
          id: "verify-producer",
          name: "verify producer",
          scope: "agent:producer",
          priority: 1,
          conflictResolution: "merge",
          content: "## Review Criteria\n- completeness (weight: 0.4, threshold: 0.8) — 完整度\n- specificity (weight: 0.6, threshold: 0.75) — 具体度",
        } as any],
        getRulesForAgent: () => "",
      },
      aiEvaluate: async () => JSON.stringify({
        technical: { resolution: 0.77, artifacts: 0.77, colorSpace: 0.77, format: 0.77 },
        artistic: { composition: 0.77, styleMatch: 0.77, lighting: 0.77, aesthetic: 0.77 },
        contentMatch: { sceneAccuracy: 0.77, characterMatch: 0.77, propAccuracy: 0.77 },
        issues: ["设定细节不足"],
        feedback: "补全可直接生成的视觉细节。",
      }),
    });
    const strictReviewScore = await strictReviewPipeline.review("producer", { assets: [{ name: "测试资产" }] }, "测试剧本");
    assert.equal(strictReviewScore.passed, false);
    assert.match(strictReviewScore.feedback || "", /0\.80/);

    const normalPipeline = harness.reviewPipeline;
    let qualityCalls = 0;
    harness.reviewPipeline = {
      review: async () => {
        qualityCalls += 1;
        const passed = qualityCalls > 1;
        return {
          technical: { resolution: passed ? 0.9 : 0.5, artifacts: 0.9, colorSpace: 0.9, format: 0.9 },
          artistic: { composition: passed ? 0.9 : 0.5, styleMatch: 0.9, lighting: 0.9, aesthetic: 0.9 },
          contentMatch: { sceneAccuracy: passed ? 0.9 : 0.5, characterMatch: 0.9, propAccuracy: 0.9 },
          overall: passed ? 0.9 : 0.62,
          passed,
          issues: passed ? [] : ["核心冲突不够明确"],
          feedback: passed ? undefined : "强化主角目标、阻力和失败代价。",
        };
      },
      generateRetryInstruction: async (targetAgentId: string, _output: unknown, score: any, attemptNumber: number, maxAttempts: number) => ({
        targetAgentId,
        originalOutput: _output,
        failedCriterion: score.feedback || "quality",
        failedScore: score.overall,
        suggestions: [score.feedback || "revise"],
        priorityParams: {},
        attemptNumber,
        maxAttempts,
      }),
    } as any;
    const skeletonInstruction = "重新生成故事骨架并验证自动返工";
    const skeletonPlan = await conversationalDirector.planInstruction(skeletonInstruction, reviewContext);
    const qualityLoopRun = await workbenchToolRuntime.execute({
      instanceId,
      userInstruction: skeletonInstruction,
      context: reviewContext,
      plan: skeletonPlan.plan,
      toolName: skeletonPlan.toolName,
      input: { ...skeletonPlan.input, mode: "draft" },
    });
    harness.reviewPipeline = normalPipeline;
    assert.equal(qualityLoopRun.status, "completed", qualityLoopRun.error?.message);
    assert.equal((qualityLoopRun.result as any).qualityLoop?.attempts, 2);
    assert.equal((qualityLoopRun.result as any).qualityLoop?.passed, true);
    assert.equal((qualityLoopRun.result as any).delegatedSteps.some((step: any) => step.tool === "review.reroute"), true);
    assert.equal(qualityCalls, 2);
    const pipelineInstruction = "Start production from the novel";
    const pipelinePlan = await conversationalDirector.planInstruction(pipelineInstruction, novelContext);
    assert.equal(pipelinePlan.toolName, "production.run_stage");
    assert.equal(pipelinePlan.input.stage, "pipeline");
    const pipelineRun = await workbenchToolRuntime.execute({
      instanceId,
      userInstruction: pipelineInstruction,
      context: novelContext,
      plan: pipelinePlan.plan,
      toolName: pipelinePlan.toolName,
      input: { ...pipelinePlan.input, mode: "draft" },
    });
    assert.equal(pipelineRun.status, "completed");
    const pipelineResult = pipelineRun.result as any;
    assert.equal(pipelineResult.stage, "pipeline");
    assert.equal(pipelineResult.development.skeleton.field, "storySkeleton");
    assert.equal(pipelineResult.development.adaptation.field, "adaptationStrategy");
    assert.equal(pipelineResult.directorPlan.field, "directorPlan");
    assert.equal(pipelineResult.storyboard.shotIds.length >= 3, true);
    const scriptWorkData = JSON.parse((await db("o_agentWorkData").where({ projectId, key: "scriptAgent" }).first()).data);
    assert.ok(scriptWorkData.storySkeleton);
    assert.ok(scriptWorkData.adaptationStrategy);
    const productionWorkData = JSON.parse((await db("o_agentWorkData").where({ projectId, key: "productionAgent", episodesId: Number(pipelineResult.screenplay.scriptId) }).first()).data);
    assert.ok(productionWorkData.directorPlan);
    assert.equal(productionWorkData.scriptPlan, productionWorkData.directorPlan);
    assert.match(productionWorkData.storyboardTable, /\| 镜号 \| 景别 \| 运镜 \| 时长 \|/);
    assert.match(productionWorkData.storyboardTable, /\| S01 \|/);
    assert.deepEqual(productionWorkData.workbench, { videoList: [] });
    assert.equal((await db("o_assets").where({ projectId, scriptId: Number(pipelineResult.screenplay.scriptId) })).length >= 3, true);
    assert.equal((await db("o_storyboard").where({ projectId, scriptId: Number(pipelineResult.screenplay.scriptId) })).length >= 3, true);
    const continuedContext = await resolver.resolve({ route: "/production", domain: "storyboard", projectId, episodeId: Number(pipelineResult.screenplay.scriptId), selected: [], visible: [] });
    const shotsBeforeStoryboardRetry = Number((await db("o_storyboard").where({ projectId, scriptId: Number(pipelineResult.screenplay.scriptId) }).count({ count: "*" }).first())?.count || 0);
    const storyboardPipeline = harness.reviewPipeline;
    let storyboardReviewCalls = 0;
    harness.reviewPipeline = {
      review: async () => {
        storyboardReviewCalls += 1;
        const passed = storyboardReviewCalls > 1;
        return {
          technical: { resolution: passed ? 0.9 : 0.6, artifacts: 0.9, colorSpace: 0.9, format: 0.9 },
          artistic: { composition: passed ? 0.9 : 0.6, styleMatch: 0.9, lighting: 0.9, aesthetic: 0.9 },
          contentMatch: { sceneAccuracy: passed ? 0.9 : 0.6, characterMatch: 0.9, propAccuracy: 0.9 },
          overall: passed ? 0.9 : 0.65,
          passed,
          issues: passed ? [] : ["镜头节奏不连贯"],
          feedback: passed ? undefined : "调整镜头景别和动作衔接。",
        };
      },
      generateRetryInstruction: async () => ({ targetAgentId: "assistant_director", suggestions: ["调整镜头景别和动作衔接。"] }),
    } as any;
    const storyboardRetryPlan = await conversationalDirector.planInstruction("重新生成分镜并根据审核自动优化", continuedContext);
    const storyboardRetryRun = await workbenchToolRuntime.execute({
      instanceId,
      userInstruction: "重新生成分镜并根据审核自动优化",
      context: continuedContext,
      plan: storyboardRetryPlan.plan,
      toolName: storyboardRetryPlan.toolName,
      input: { ...storyboardRetryPlan.input, mode: "draft" },
    });
    harness.reviewPipeline = storyboardPipeline;
    const shotsAfterStoryboardRetry = Number((await db("o_storyboard").where({ projectId, scriptId: Number(pipelineResult.screenplay.scriptId) }).count({ count: "*" }).first())?.count || 0);
    assert.equal(storyboardRetryRun.status, "completed", storyboardRetryRun.error?.message);
    assert.equal((storyboardRetryRun.result as any).qualityLoop?.attempts, 2);
    assert.equal((storyboardRetryRun.result as any).qualityLoop?.passed, true);
    assert.equal(storyboardReviewCalls, 2);
    assert.equal(shotsAfterStoryboardRetry, shotsBeforeStoryboardRetry + 3);
    const continuePlan = await conversationalDirector.planInstruction("继续", continuedContext);
    assert.equal(continuePlan.input.stage, "video");
    const sceneRun = await conversationalDirector.executeInstruction(instanceId, "创建一场“雨夜重逢”，两人在旧宅门口相遇", sceneContext);
    assert.equal(sceneRun.status, "completed");
    assert.equal(sceneRun.toolCalls[0].toolName, "scene.create");
    const createdSceneId = Number(String((sceneRun.result as any).entity.id).split(":").pop());
    createdSceneIds.push(createdSceneId);

    const shotRun = await conversationalDirector.executeInstruction(instanceId, "把当前镜头改成中近景，保留人物服装和场景不变", context);
    assert.equal(shotRun.status, "completed", shotRun.error?.message);
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

    console.log(JSON.stringify({ ok: true, context: true, unifiedCapabilities: true, intermediatePersistence: true, contextualContinuation: true, naturalLanguageContinuation: true, requestScopedIdempotency: true, projectScopedActionHistory: true, strictQualityThreshold: true, automaticScriptResolution: true, deterministicManualReview: true, boundedQualityLoop: true, storyboardQualityLoop: true, pipelinePlanning: true, novelToStoryboard: true, sceneCreation: true, storyboardRevision: true, versionRollback: true, confirmationCancellation: true }));
  } finally {
    await db("o_action_run").where("instanceId", instanceId).delete().catch(() => undefined);
    await db("o_generation_job").where("actionRunId", "like", `${instanceId}%`).delete().catch(() => undefined);
    await db("o_review_report").where("workflowInstanceId", instanceId).delete().catch(() => undefined);
    await db("o_artifact_version").where("projectId", projectId).delete().catch(() => undefined);
    await db("o_artifact_link").where("projectId", projectId).delete().catch(() => undefined);
    if (createdSceneIds.length && await db.schema.hasTable("o_scene")) await (db as any)("o_scene").whereIn("id", createdSceneIds).delete();
    if (await db.schema.hasTable("o_scene")) await (db as any)("o_scene").where("projectId", projectId).delete();
    await db("o_assets2Storyboard").whereIn("storyboardId", db("o_storyboard").where("projectId", projectId).select("id")).delete().catch(() => undefined);
    await db("o_storyboard").where("projectId", projectId).delete();
    await db("o_scriptAssets").whereIn("scriptId", db("o_script").where("projectId", projectId).select("id")).delete().catch(() => undefined);
    await db("o_assets").where("projectId", projectId).delete();
    await db("o_videoTrack").where("projectId", projectId).delete();
    await db("o_agentWorkData").where("projectId", projectId).delete();
    await db("o_script").where("projectId", projectId).delete();
    await db("o_novel").where("projectId", projectId).delete();
    await db("o_project").where("id", projectId).delete();
    await db.destroy();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
