import assert from "node:assert/strict";
import { db } from "../src/utils/db";
import { ContextResolver } from "../src/core/harness/workbench/ContextResolver";
import { conversationalDirector, workbenchToolRuntime } from "../src/core/harness/workbench";

async function main() {
  const projectId = Date.now();
  const instanceId = `verify-harness-v3-ai-${projectId}`;
  try {
    await db("o_project").insert({
      id: projectId,
      name: "__HARNESS_V3_AI_VERIFY__",
      projectType: "novel",
      type: "都市悬疑",
      artStyle: "cinematic",
      videoRatio: "16:9",
      createTime: Date.now(),
      userId: 1,
    });
    await db("o_novel").insert({
      projectId,
      chapterIndex: 1,
      chapter: "失踪的母带",
      chapterData: "暴雨夜，剪辑师林默在废弃影院收到一卷没有寄件人的母带。画面中记录着三天后才会发生的失踪案，而失踪者正是她自己。她必须在天亮前找出拍摄者，并决定是否公开母带。",
      createTime: Date.now(),
    });
    const context = await new ContextResolver().resolve({ route: "/novel", domain: "script", projectId, selected: [], visible: [] });
    const instruction = "根据当前小说生成故事骨架";
    const planned = await conversationalDirector.planInstruction(instruction, context);
    assert.equal(planned.input.stage, "skeleton");
    const run = await workbenchToolRuntime.execute({
      instanceId,
      userInstruction: instruction,
      context,
      plan: planned.plan,
      toolName: planned.toolName,
      input: planned.input,
    });
    assert.equal(run.status, "completed", run.error?.message);
    const row = await db("o_agentWorkData").where({ projectId, key: "scriptAgent" }).first();
    const workData = JSON.parse(row?.data || "{}");
    assert.ok(String(workData.storySkeleton || "").length > 50);
    const result = run.result as any;
    assert.equal(result.delegation.agentKey, "scriptAgent:storySkeletonAgent");
    assert.ok(result.delegation.skillId);
    assert.ok(result.delegation.modelName);
    console.log(JSON.stringify({ ok: true, realModel: true, stage: result.stage, agentKey: result.delegation.agentKey, skillId: result.delegation.skillId, modelName: result.delegation.modelName, chars: workData.storySkeleton.length }));
  } finally {
    await db("o_action_run").where({ instanceId }).delete().catch(() => undefined);
    await db("o_agentWorkData").where({ projectId }).delete().catch(() => undefined);
    await db("o_novel").where({ projectId }).delete().catch(() => undefined);
    await db("o_project").where({ id: projectId }).delete().catch(() => undefined);
    await db.destroy();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
