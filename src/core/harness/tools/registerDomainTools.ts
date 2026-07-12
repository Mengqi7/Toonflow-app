import type { ShotId } from "../domain/ids";
import { toonflowDomainService, type UpdateShotInput, type UpdateShotOutput } from "../domain/ToonflowDomainService";
import { filmDomainService } from "../domain/FilmDomainService";
import { artifactVersionService } from "../domain/ArtifactVersionService";
import type { ProductionDomainService } from "../domain/ProductionDomainService";
import Ai from "@/utils/ai";
import { reviewDomainService } from "../domain/ReviewDomainService";
import { ProductionStageService } from "../workbench/ProductionStageService";
import { ToolRegistry } from "./ToolRegistry";

export function registerDomainTools(registry: ToolRegistry, production: ProductionDomainService): ToolRegistry {
  const genericObjectOutput = { type: "object", additionalProperties: true } as const;
  const stringId = (kind: string) => ({ type: "string", pattern: `^${kind}:.+$` });
  const stages = new ProductionStageService(production);

  registry.register({
    name: "project.read_context",
    description: "读取当前项目、剧集、页面、选择对象、相关产物和最近操作上下文。",
    authorization: "read",
    idempotency: "none",
    requiresConfirmation: false,
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
    outputSchema: genericObjectOutput,
    execute: async (_input, context) => context.projectContext,
  });

  registry.register({
    name: "director.project_status",
    description: "汇总当前项目从小说、编剧、资产、分镜到视频的真实完成状态和下一步。",
    authorization: "read",
    idempotency: "none",
    requiresConfirmation: false,
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
    outputSchema: genericObjectOutput,
    execute: async (_input, context) => {
      const state = context.projectContext.productionState;
      return {
        summary: `当前项目：骨架${state.hasStorySkeleton ? "已完成" : "未完成"}，改编策略${state.hasAdaptationStrategy ? "已完成" : "未完成"}，剧本 ${state.scriptCount} 个，资产 ${state.assetCount} 个，分镜 ${state.shotCount} 个，视频 ${state.videoCount} 个。`,
        reply: `当前制作进度：\n- 故事骨架：${state.hasStorySkeleton ? "已完成" : "未完成"}\n- 改编策略：${state.hasAdaptationStrategy ? "已完成" : "未完成"}\n- 剧本：${state.scriptCount} 个\n- 资产：${state.assetCount} 个\n- 导演规划：${state.hasDirectorPlan ? "已完成" : "未完成"}\n- 分镜：${state.shotCount} 个\n- 视频：${state.videoCount}/${state.shotCount} 个\n\n建议下一步：${state.nextStage}`,
        productionState: state,
        nextAction: state.nextStage,
        noMutation: true,
      };
    },
  });

  registry.register({
    name: "director.answer",
    description: "基于当前项目上下文回答不需要修改业务数据的开放式问题。",
    authorization: "read",
    idempotency: "none",
    requiresConfirmation: false,
    inputSchema: { type: "object", additionalProperties: false, required: ["question"], properties: { question: { type: "string", minLength: 1 } } },
    outputSchema: genericObjectOutput,
    execute: async (input: any, context) => {
      const result = await Ai.Text("universalAi", false, 0).invoke({ messages: [
        { role: "system", content: "你是 Toonflow AI Director。基于给定项目上下文直接、专业地回答。不要声称已修改或生成任何产物。" },
        { role: "user", content: `项目上下文：${JSON.stringify({ project: context.projectContext.project, route: context.projectContext.route, productionState: context.projectContext.productionState, selected: context.projectContext.selected })}\n\n用户问题：${input.question}` },
      ] });
      return { reply: result.text.trim(), noMutation: true };
    },
  });

  registry.register({
    name: "production.run_stage",
    description: "Run an AI Director production stage using the existing Script and Production Agent profiles, then write the result into Toonflow domain records.",
    authorization: "generate",
    idempotency: "action_run",
    requiresConfirmation: (input: any) => input.stage === "video",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["stage"],
      properties: {
        stage: { enum: ["skeleton", "adaptation", "development", "screenplay", "assets", "director_plan", "storyboard", "video", "pipeline"] },
        instruction: { type: "string" },
        scriptId: { type: "string", pattern: "^(script|episode):.+$" },
        sceneId: stringId("scene"),
        shotId: stringId("shot"),
        mode: { enum: ["ai", "draft"] },
      },
    },
    outputSchema: genericObjectOutput,
    execute: async (input: any, context) => stages.run(context.actionRun, input, context.projectContext, context.reportProgress),
  });

  registry.register({
    name: "script.read",
    description: "读取当前项目中的剧本。",
    authorization: "read",
    idempotency: "none",
    requiresConfirmation: false,
    inputSchema: { type: "object", additionalProperties: false, required: ["scriptId"], properties: { scriptId: stringId("script") } },
    outputSchema: genericObjectOutput,
    execute: async (input: any, context) => filmDomainService.readScript(context.actionRun, input.scriptId.split(":").pop()),
  });

  registry.register({
    name: "script.create",
    description: "在当前项目中创建剧本并建立版本。",
    authorization: "write",
    idempotency: "action_run",
    requiresConfirmation: false,
    inputSchema: {
      type: "object", additionalProperties: false, required: ["name", "content"],
      properties: { name: { type: "string", minLength: 1 }, content: { type: "string", minLength: 1 } },
    },
    outputSchema: genericObjectOutput,
    execute: async (input: any, context) => filmDomainService.createScript(context.actionRun, input),
  });

  registry.register({
    name: "script.update",
    description: "修改剧本名称或正文，保留修改前基线并创建新版本。",
    authorization: "write",
    idempotency: "action_run",
    requiresConfirmation: false,
    inputSchema: {
      type: "object", additionalProperties: false, required: ["scriptId", "patch"],
      properties: {
        scriptId: stringId("script"),
        patch: { type: "object", minProperties: 1, additionalProperties: false, properties: { name: { type: "string", minLength: 1 }, content: { type: "string", minLength: 1 } } },
      },
    },
    outputSchema: genericObjectOutput,
    execute: async (input: any, context) => filmDomainService.updateScript(context.actionRun, input.scriptId.split(":").pop(), input.patch),
  });

  registry.register({
    name: "beat.list",
    description: "列出当前剧集的剧情节拍。",
    authorization: "read",
    idempotency: "none",
    requiresConfirmation: false,
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
    outputSchema: { type: "array", items: genericObjectOutput },
    execute: async (_input, context) => filmDomainService.listBeats(context.actionRun),
  });

  registry.register({
    name: "beat.create",
    description: "为当前剧集创建剧情节拍。",
    authorization: "write",
    idempotency: "action_run",
    requiresConfirmation: false,
    inputSchema: {
      type: "object", additionalProperties: false, required: ["title"],
      properties: { title: { type: "string", minLength: 1 }, summary: { type: "string" }, orderIndex: { type: "integer", minimum: 0 }, scriptId: stringId("script") },
    },
    outputSchema: genericObjectOutput,
    execute: async (input: any, context) => filmDomainService.createBeat(context.actionRun, { ...input, scriptId: input.scriptId?.split(":").pop() }),
  });

  registry.register({
    name: "beat.update",
    description: "修改剧情节拍。",
    authorization: "write",
    idempotency: "action_run",
    requiresConfirmation: false,
    inputSchema: {
      type: "object", additionalProperties: false, required: ["beatId", "patch"],
      properties: {
        beatId: stringId("beat"),
        patch: { type: "object", minProperties: 1, additionalProperties: false, properties: { title: { type: "string" }, summary: { type: "string" }, orderIndex: { type: "integer", minimum: 0 }, status: { type: "string" } } },
      },
    },
    outputSchema: genericObjectOutput,
    execute: async (input: any, context) => filmDomainService.updateBeat(context.actionRun, input.beatId.split(":").pop(), input.patch),
  });

  registry.register({
    name: "scene.read",
    description: "读取场次及关联人物、道具、地点。",
    authorization: "read",
    idempotency: "none",
    requiresConfirmation: false,
    inputSchema: { type: "object", additionalProperties: false, required: ["sceneId"], properties: { sceneId: stringId("scene") } },
    outputSchema: genericObjectOutput,
    execute: async (input: any, context) => filmDomainService.readScene(context.actionRun, input.sceneId.split(":").pop()),
  });

  registry.register({
    name: "scene.create",
    description: "在当前剧集中创建场次，并关联节拍、人物、道具和地点。",
    authorization: "write",
    idempotency: "action_run",
    requiresConfirmation: false,
    inputSchema: {
      type: "object", additionalProperties: false, required: ["title"],
      properties: {
        title: { type: "string", minLength: 1 }, summary: { type: "string" }, description: { type: "string" },
        beatId: stringId("beat"), locationId: stringId("location"),
        characterIds: { type: "array", items: stringId("character"), uniqueItems: true },
        propIds: { type: "array", items: stringId("prop"), uniqueItems: true },
        orderIndex: { type: "integer", minimum: 0 },
      },
    },
    outputSchema: genericObjectOutput,
    execute: async (input: any, context) => filmDomainService.createScene(context.actionRun, input),
  });

  registry.register({
    name: "scene.update",
    description: "修改场次内容或关联设定。",
    authorization: "write",
    idempotency: "action_run",
    requiresConfirmation: false,
    inputSchema: {
      type: "object", additionalProperties: false, required: ["sceneId", "patch"],
      properties: {
        sceneId: stringId("scene"),
        patch: { type: "object", minProperties: 1, additionalProperties: false, properties: {
          title: { type: "string" }, summary: { type: "string" }, description: { type: "string" }, locationId: stringId("location"),
          characterIds: { type: "array", items: stringId("character") }, propIds: { type: "array", items: stringId("prop") },
          orderIndex: { type: "integer", minimum: 0 }, status: { type: "string" },
        } },
      },
    },
    outputSchema: genericObjectOutput,
    execute: async (input: any, context) => filmDomainService.updateScene(context.actionRun, input.sceneId.split(":").pop(), input.patch),
  });

  for (const kind of ["character", "prop", "location"] as const) {
    registry.register({
      name: `${kind}.create`,
      description: `在当前项目中创建${kind === "character" ? "人物" : kind === "prop" ? "道具" : "地点"}设定。`,
      authorization: "write",
      idempotency: "action_run",
      requiresConfirmation: false,
      inputSchema: {
        type: "object", additionalProperties: false, required: ["name"],
        properties: { name: { type: "string", minLength: 1 }, description: { type: "string" }, prompt: { type: "string" }, scriptId: stringId("script") },
      },
      outputSchema: genericObjectOutput,
      execute: async (input: any, context) => filmDomainService.createAsset(context.actionRun, kind, input),
    });
    registry.register({
      name: `${kind}.update`,
      description: `修改${kind === "character" ? "人物" : kind === "prop" ? "道具" : "地点"}设定并创建版本。`,
      authorization: "write",
      idempotency: "action_run",
      requiresConfirmation: false,
      inputSchema: {
        type: "object", additionalProperties: false, required: [`${kind}Id`, "patch"],
        properties: {
          [`${kind}Id`]: stringId(kind),
          patch: { type: "object", minProperties: 1, additionalProperties: false, properties: { name: { type: "string" }, description: { type: "string" }, prompt: { type: "string" }, remark: { type: "string" } } },
        },
      },
      outputSchema: genericObjectOutput,
      execute: async (input: any, context) => filmDomainService.updateAsset(context.actionRun, kind, input[`${kind}Id`].split(":").pop(), input.patch),
    });
    registry.register({
      name: `${kind}.generate_reference`,
      description: `为${kind === "character" ? "人物" : kind === "prop" ? "道具" : "地点"}生成参考图并写回资产库。`,
      authorization: "generate",
      idempotency: "action_run",
      requiresConfirmation: false,
      inputSchema: { type: "object", additionalProperties: false, required: [`${kind}Id`], properties: { [`${kind}Id`]: stringId(kind), prompt: { type: "string" } } },
      outputSchema: genericObjectOutput,
      execute: async (input: any, context) => production.generateReference(context.actionRun, { kind, entityId: input[`${kind}Id`], prompt: input.prompt }),
    });
  }

  registry.register<UpdateShotInput, UpdateShotOutput>({
    name: "storyboard.update_shot",
    description: "修改当前项目中的单个分镜字段，并保留指定的人物、服装、道具或场景引用。",
    authorization: "write",
    idempotency: "action_run",
    requiresConfirmation: false,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["shotId", "patch"],
      properties: {
        shotId: { type: "string", pattern: "^shot:.+$" },
        patch: {
          type: "object",
          additionalProperties: false,
          minProperties: 1,
          properties: {
            shotSize: { type: "string", minLength: 1 },
            cameraMovement: { type: "string", minLength: 1 },
            prompt: { type: "string" },
            videoDesc: { type: "string" },
            duration: { type: "number", minimum: 0.1 },
          },
        },
        preserve: {
          type: "array",
          uniqueItems: true,
          items: { enum: ["characterRefs", "propRefs", "locationRef", "costume", "visualIdentity"] },
        },
        reason: { type: "string" },
      },
    },
    outputSchema: {
      type: "object",
      required: ["shotId", "changedFields", "preservedFields", "version", "shot", "uiPatch"],
      properties: {
        shotId: { type: "string", pattern: "^shot:.+$" },
        changedFields: { type: "array", items: { type: "string" } },
        preservedFields: { type: "array", items: { type: "string" } },
        version: { type: "integer", minimum: 1 },
        shot: { type: "object", additionalProperties: true },
        uiPatch: { type: "object", additionalProperties: true },
      },
      additionalProperties: false,
    },
    execute: (input, context) => toonflowDomainService.updateShot({ ...input, shotId: input.shotId as ShotId }, context.actionRun, context.signal),
  });

  registry.register({
    name: "storyboard.generate_plan",
    description: "为场次创建结构化分镜计划和镜头记录。",
    authorization: "write",
    idempotency: "action_run",
    requiresConfirmation: (input: any) => input.shots?.length > 6,
    inputSchema: {
      type: "object", additionalProperties: false, required: ["sceneId", "shots"],
      properties: {
        sceneId: stringId("scene"),
        shots: { type: "array", minItems: 1, items: { type: "object", additionalProperties: false, required: ["prompt", "videoDesc"], properties: {
          prompt: { type: "string", minLength: 1 }, videoDesc: { type: "string", minLength: 1 }, duration: { type: "number", minimum: 0.1 }, shotSize: { type: "string" }, cameraMovement: { type: "string" }, assetIds: { type: "array", items: { type: "string" } },
        } } },
      },
    },
    outputSchema: genericObjectOutput,
    execute: async (input: any, context) => production.generateStoryboardPlan(context.actionRun, input),
  });

  registry.register({
    name: "storyboard.generate_image",
    description: "为一个或多个分镜生成图片，自动使用项目配置的供应商与模型。",
    authorization: "generate",
    idempotency: "action_run",
    requiresConfirmation: (input: any) => input.shotIds?.length > 1,
    inputSchema: { type: "object", additionalProperties: false, required: ["shotIds"], properties: { shotIds: { type: "array", minItems: 1, uniqueItems: true, items: stringId("shot") } } },
    outputSchema: genericObjectOutput,
    execute: async (input: any, context) => production.generateStoryboardImages(context.actionRun, input),
  });

  registry.register({
    name: "video.generate_clip",
    description: "根据分镜图和镜头描述生成视频片段。",
    authorization: "generate",
    idempotency: "action_run",
    requiresConfirmation: true,
    inputSchema: { type: "object", additionalProperties: false, required: ["shotId"], properties: { shotId: stringId("shot"), prompt: { type: "string" }, duration: { type: "number", minimum: 0.1 }, resolution: { type: "string" }, audio: { type: "boolean" } } },
    outputSchema: genericObjectOutput,
    execute: async (input: any, context) => production.generateVideoClip(context.actionRun, input),
  });

  registry.register({
    name: "audio.generate_track",
    description: "生成配音、旁白、音效或配乐轨道并保存到资产中心。",
    authorization: "generate",
    idempotency: "action_run",
    requiresConfirmation: true,
    inputSchema: { type: "object", additionalProperties: false, required: ["name", "prompt"], properties: { name: { type: "string", minLength: 1 }, prompt: { type: "string", minLength: 1 }, referenceIds: { type: "array", items: { type: "string" } } } },
    outputSchema: genericObjectOutput,
    execute: async (input: any, context) => production.generateAudioTrack(context.actionRun, input),
  });

  registry.register({
    name: "timeline.save",
    description: "保存视频片段和音轨的剪辑时间线。",
    authorization: "write",
    idempotency: "action_run",
    requiresConfirmation: false,
    inputSchema: { type: "object", additionalProperties: false, required: ["name", "clips"], properties: { name: { type: "string", minLength: 1 }, clips: { type: "array", minItems: 1, items: { type: "object", additionalProperties: false, required: ["videoId", "start", "duration"], properties: { videoId: { type: "integer" }, start: { type: "number", minimum: 0 }, duration: { type: "number", minimum: 0.1 } } } }, audioIds: { type: "array", items: { type: "integer" } } } },
    outputSchema: genericObjectOutput,
    execute: async (input: any, context) => production.saveTimeline(context.actionRun, input),
  });

  registry.register({
    name: "artifact.list_versions",
    description: "查询业务对象的所有历史版本和来源信息。",
    authorization: "read",
    idempotency: "none",
    requiresConfirmation: false,
    inputSchema: {
      type: "object", additionalProperties: false, required: ["artifactType", "artifactId"],
      properties: {
        artifactType: { enum: ["script", "beat", "scene", "shot", "character", "prop", "location"] },
        artifactId: { type: "string", minLength: 1 },
      },
    },
    outputSchema: { type: "array", items: genericObjectOutput },
    execute: async (input: any, context) => artifactVersionService.list(
      Number(String(context.actionRun.projectId).split(":").pop()),
      input.artifactType,
      `${input.artifactType}:${String(input.artifactId).split(":").pop()}`,
    ),
  });

  registry.register({
    name: "artifact.rollback",
    description: "回滚业务对象到历史版本；历史不会被覆盖，而是创建新的当前版本。",
    authorization: "write",
    idempotency: "action_run",
    requiresConfirmation: true,
    inputSchema: {
      type: "object", additionalProperties: false, required: ["artifactType", "artifactId", "version", "reason"],
      properties: {
        artifactType: { enum: ["script", "beat", "scene", "shot", "character", "prop", "location"] },
        artifactId: { type: "string", minLength: 1 }, version: { type: "integer", minimum: 1 }, reason: { type: "string", minLength: 1 },
      },
    },
    outputSchema: genericObjectOutput,
    execute: async (input: any, context) => artifactVersionService.rollback({
      actionRun: context.actionRun,
      artifactType: input.artifactType,
      artifactId: String(input.artifactId).split(":").pop()!,
      version: input.version,
      reason: input.reason,
    }),
  });

  registry.register({
    name: "review.request",
    description: "对剧本、节拍、场次、分镜、人物设定、生成媒体或时间线发起质量审核。",
    authorization: "review",
    idempotency: "action_run",
    requiresConfirmation: false,
    inputSchema: { type: "object", additionalProperties: false, required: ["artifactType", "artifactId"], properties: { artifactType: { enum: ["script", "beat", "scene", "shot", "character", "prop", "location", "video", "audio", "timeline"] }, artifactId: { type: "string", minLength: 1 }, reviewer: { type: "string" }, reference: {} } },
    outputSchema: genericObjectOutput,
    execute: async (input: any, context) => reviewDomainService.request(context.actionRun, input),
  });

  registry.register({
    name: "video.review_clip",
    description: "审核视频片段的技术质量、艺术表现和内容一致性。",
    authorization: "review",
    idempotency: "action_run",
    requiresConfirmation: false,
    inputSchema: { type: "object", additionalProperties: false, required: ["videoId"], properties: { videoId: { type: "string", pattern: "^(video:)?[0-9]+$" }, reference: {} } },
    outputSchema: genericObjectOutput,
    execute: async (input: any, context) => reviewDomainService.request(context.actionRun, { artifactType: "video", artifactId: input.videoId, reviewer: "supervisor", reference: input.reference }),
  });

  registry.register({
    name: "review.approve",
    description: "批准审核结果；终审批准会放行下游阶段。",
    authorization: "review",
    idempotency: "action_run",
    requiresConfirmation: true,
    inputSchema: { type: "object", additionalProperties: false, required: ["reviewId"], properties: { reviewId: { type: "string", minLength: 1 }, note: { type: "string" }, final: { type: "boolean" } } },
    outputSchema: genericObjectOutput,
    execute: async (input: any, context) => reviewDomainService.approve(context.actionRun, input),
  });

  registry.register({
    name: "review.reroute",
    description: "根据审核结果跨工种打回，并生成结构化返工指令。",
    authorization: "review",
    idempotency: "action_run",
    requiresConfirmation: true,
    inputSchema: { type: "object", additionalProperties: false, required: ["reviewId", "targetAgent", "instruction"], properties: { reviewId: { type: "string", minLength: 1 }, targetAgent: { type: "string", minLength: 1 }, instruction: { type: "string", minLength: 1 } } },
    outputSchema: genericObjectOutput,
    execute: async (input: any, context) => reviewDomainService.reroute(context.actionRun, input),
  });
  return registry;
}
