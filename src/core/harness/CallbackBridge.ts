/**
 * CallbackBridge — 产物回写业务表
 *
 * 每个 Agent 完成后, 通过 CallbackBridge 把结构化输出写入对应业务表。
 * 写入是幂等的 (upsert), 失败时事务回滚 + 重试 + 发出 callback.failed 事件。
 *
 * 所有写入标注 source="harness", instanceId=<当前实例>, 区分手工操作产物。
 */
import { db } from "@/utils/db";
import { harnessEventBus } from "./HarnessEventBus";
import { v4 as uuid } from "uuid";

export interface PersistOptions {
  instanceId: string;
  projectId: number;
  agentRole: string;
  output: any;
}

export class CallbackBridge {
  private maxRetries = 3;
  private retryDelayMs = 500;

  /**
   * 持久化 Agent 产物到业务表
   * 根据 agentRole 分发到对应的 persist 方法
   */
  async persist(opts: PersistOptions): Promise<void> {
    const { agentRole, instanceId, projectId, output } = opts;

    try {
      switch (agentRole) {
        case "screenwriter":
          await this.persistScript(instanceId, projectId, output);
          break;
        case "assistant_director":
          await this.persistStoryboard(instanceId, projectId, output);
          break;
        case "dp":
          await this.persistImageAssets(instanceId, projectId, output);
          break;
        case "vfx":
          await this.persistVideoAssets(instanceId, projectId, output);
          break;
        case "sound":
        case "sound_designer":
          await this.persistAudioAssets(instanceId, projectId, output);
          break;
        case "editor":
          await this.persistTimelineAsset(instanceId, projectId, output);
          break;
        case "costume":
        case "makeup":
          await this.persistCharacter(instanceId, projectId, output, agentRole);
          break;
        case "lighting":
          await this.persistScene(instanceId, projectId, output);
          break;
        case "set_decorator":
          await this.persistProp(instanceId, projectId, output);
          break;
        case "wardrobe":
          await this.persistWardrobe(instanceId, projectId, output);
          break;
        default:
          console.warn(`[CallbackBridge] Unknown agentRole: ${agentRole}, skipping persist`);
          return;
      }

      // 发出持久化成功事件
      await harnessEventBus.emitEvent({
        kind: "callback.persisted",
        instanceId,
        table: this.getTableForAgent(agentRole),
        rowCount: this.estimateRowCount(output),
        artifactKey: output?.shotId || output?.sceneNumber || agentRole,
        timestamp: Date.now(),
      } as any);
    } catch (err) {
      console.error(`[CallbackBridge] Failed to persist ${agentRole}:`, err);
      await harnessEventBus.emitEvent({
        kind: "callback.failed",
        instanceId,
        table: this.getTableForAgent(agentRole),
        error: err instanceof Error ? err.message : String(err),
        timestamp: Date.now(),
      } as any);
    }
  }

  // ── 各 Agent 的具体回写逻辑 ────────────────────

  /** 编剧 → o_script */
  private async persistScript(instanceId: string, projectId: number, output: any): Promise<void> {
    const script = typeof output === "string" ? output : output?.script || "";
    const scenes = this.parseScenes(script);
    if (scenes.length === 0) return;

    for (const scene of scenes) {
      await this.withRetry(() =>
        db("o_script")
          .insert({
            projectId,
            sceneNumber: scene.sceneNumber,
            content: scene.content,
            source: "harness",
            instanceId,
            createTime: Date.now(),
            updateTime: Date.now(),
          })
          .onConflict(["projectId", "sceneNumber", "source"])
          .merge({
            content: scene.content,
            instanceId,
            updateTime: Date.now(),
          }),
      );
    }
  }

  /** 副导演 → o_storyboard */
  private async persistStoryboard(instanceId: string, projectId: number, output: any): Promise<void> {
    const shots = output?.storyboardPlan?.shots || output?.shots || [];
    for (const shot of shots) {
      await this.withRetry(() =>
        db("o_storyboard")
          .insert({
            projectId,
            shotId: shot.id,
            scene: shot.scene,
            shotType: shot.shotType,
            angle: shot.angle,
            movement: shot.movement,
            duration: shot.duration,
            description: shot.description,
            characters: JSON.stringify(shot.characters || []),
            source: "harness",
            instanceId,
            createTime: Date.now(),
          })
          .onConflict(["projectId", "shotId", "source"])
          .merge({
            shotType: shot.shotType,
            angle: shot.angle,
            movement: shot.movement,
            duration: shot.duration,
            description: shot.description,
            characters: JSON.stringify(shot.characters || []),
            instanceId,
            updateTime: Date.now(),
          }),
      );
    }
  }

  /** DP → o_assets (image) + o_storyboard.imageUrl */
  private async persistImageAssets(instanceId: string, projectId: number, output: any): Promise<void> {
    const images = Array.isArray(output) ? output : output?.images || [];
    for (const img of images) {
      // 写入 o_assets
      await this.withRetry(() =>
        db("o_assets")
          .insert({
            projectId,
            type: "image",
            url: img.imageUrl,
            shotId: img.shotId,
            source: "harness",
            instanceId,
            createTime: Date.now(),
          })
          .onConflict(["projectId", "shotId", "type", "source"])
          .merge({
            url: img.imageUrl,
            instanceId,
            updateTime: Date.now(),
          }),
      );
      // 更新 o_storyboard.imageUrl
      if (img.shotId) {
        await this.withRetry(() =>
          db("o_storyboard")
            .where({ projectId, shotId: img.shotId, source: "harness" })
            .update({ imageUrl: img.imageUrl, updateTime: Date.now() }),
        );
      }
    }
  }

  /** 视效 → o_assets (video) */
  private async persistVideoAssets(instanceId: string, projectId: number, output: any): Promise<void> {
    const videos = Array.isArray(output) ? output : output?.videos || [output];
    for (const v of videos) {
      if (!v?.videoUrl) continue;
      await this.withRetry(() =>
        db("o_assets")
          .insert({
            projectId,
            type: "video",
            url: v.videoUrl,
            shotId: v.shotId || v.clipId,
            source: "harness",
            instanceId,
            createTime: Date.now(),
          })
          .onConflict(["projectId", "shotId", "type", "source"])
          .merge({
            url: v.videoUrl,
            instanceId,
            updateTime: Date.now(),
          }),
      );
    }
  }

  /** 录音/声音设计 → o_assets (audio) */
  private async persistAudioAssets(instanceId: string, projectId: number, output: any): Promise<void> {
    const audios = Array.isArray(output) ? output : [output];
    for (const a of audios) {
      const url = a?.audioUrl || a?.url;
      if (!url) continue;
      await this.withRetry(() =>
        db("o_assets").insert({
          projectId,
          type: "audio",
          url,
          source: "harness",
          instanceId,
          createTime: Date.now(),
        }),
      );
    }
  }

  /** 剪辑 → o_assets (timeline) */
  private async persistTimelineAsset(instanceId: string, projectId: number, output: any): Promise<void> {
    const timeline = output?.editTimeline || output;
    await this.withRetry(() =>
      db("o_assets").insert({
        projectId,
        type: "timeline",
        url: null,
        content: JSON.stringify(timeline),
        source: "harness",
        instanceId,
        createTime: Date.now(),
      }),
    );
  }

  /** 服装/化妆 → o_character_library */
  private async persistCharacter(instanceId: string, projectId: number, output: any, agentRole: string): Promise<void> {
    const costume = output?.costume || output?.makeup || output;
    const charName = costume?.characterName || "未命名角色";
    await this.withRetry(() =>
      db("o_character_library")
        .insert({
          projectId,
          characterName: charName,
          description: costume?.description || "",
          referenceImage: costume?.referenceImage || "",
          outfitStyle: costume?.outfit || "",
          hairStyle: costume?.hairStyle || "",
          accessories: JSON.stringify(costume?.accessories || []),
          makeup: costume?.makeup || (agentRole === "makeup" ? JSON.stringify(costume) : ""),
          source: "harness",
          instanceId,
          createTime: Date.now(),
          updateTime: Date.now(),
        })
        .onConflict(["projectId", "characterName", "source"])
        .merge({
          outfitStyle: costume?.outfit || "",
          hairStyle: costume?.hairStyle || "",
          makeup: costume?.makeup || (agentRole === "makeup" ? JSON.stringify(costume) : ""),
          instanceId,
          updateTime: Date.now(),
        }),
    );
  }

  /** 灯光 → o_scene_library */
  private async persistScene(instanceId: string, projectId: number, output: any): Promise<void> {
    const lighting = output?.lightingSpec || output?.lighting || output;
    const artDir = output?.artDirectionSpec || output?.artDirection || {};
    await this.withRetry(() =>
      db("o_scene_library")
        .insert({
          projectId,
          sceneName: lighting?.sceneName || `场景_${Date.now()}`,
          lightingSpec: JSON.stringify(lighting),
          artDirection: JSON.stringify(artDir),
          source: "harness",
          instanceId,
          createTime: Date.now(),
        })
        .onConflict(["projectId", "sceneName", "source"])
        .merge({
          lightingSpec: JSON.stringify(lighting),
          artDirection: JSON.stringify(artDir),
          instanceId,
          updateTime: Date.now(),
        }),
    );
  }

  /** 置景 → o_prop_library */
  private async persistProp(instanceId: string, projectId: number, output: any): Promise<void> {
    const setDecor = output?.setDecor || output;
    const props = setDecor?.props || [setDecor];
    for (const prop of props) {
      await this.withRetry(() =>
        db("o_prop_library").insert({
          projectId,
          type: "prop",
          name: prop?.name || `道具_${uuid().slice(0, 8)}`,
          description: prop?.description || "",
          source: "harness",
          instanceId,
          createTime: Date.now(),
        }),
      );
    }
  }

  /** 服装穿戴 → o_prop_library (type=clothing) */
  private async persistWardrobe(instanceId: string, projectId: number, output: any): Promise<void> {
    const wardrobe = output?.wardrobe || output;
    const pieces = wardrobe?.pieces || [wardrobe];
    for (const piece of pieces) {
      await this.withRetry(() =>
        db("o_prop_library").insert({
          projectId,
          type: "clothing",
          name: piece?.name || `服装_${uuid().slice(0, 8)}`,
          description: piece?.description || "",
          source: "harness",
          instanceId,
          createTime: Date.now(),
        }),
      );
    }
  }

  // ── 保存历史版本 ────────────────────────────────

  /** 保存产物到 o_artifact_version (审核失败或打回时调用) */
  async saveVersion(opts: {
    instanceId: string;
    projectId: number;
    artifactType: "script" | "image" | "video" | "audio" | "timeline";
    artifactKey: string;
    content?: string;
    filePath?: string;
    reviewScore?: any;
    reviewFeedback?: string;
  }): Promise<number> {
    const { instanceId, projectId, artifactType, artifactKey, content, filePath, reviewScore, reviewFeedback } = opts;

    // 获取当前最大版本号
    const maxVersionRow = await db("o_artifact_version")
      .where({ artifactType, artifactKey, projectId })
      .max("version as maxVersion")
      .first();
    const nextVersion = (maxVersionRow?.maxVersion || 0) + 1;

    const [id] = await db("o_artifact_version").insert({
      artifactType: artifactType as "script" | "image" | "video" | "audio" | "timeline",
      artifactKey,
      projectId,
      instanceId,
      version: nextVersion,
      content: content || null,
      filePath: filePath || null,
      reviewScore: reviewScore ? JSON.stringify(reviewScore) : null,
      reviewFeedback: reviewFeedback || null,
      source: "harness",
      createdAt: Date.now(),
    });

    await harnessEventBus.emitEvent({
      kind: "version.created",
      instanceId,
      artifactType: artifactType as "script" | "image" | "video" | "audio" | "timeline",
      artifactKey,
      version: nextVersion,
      source: "save",
      timestamp: Date.now(),
    } as any);

    return id;
  }

  /** 查询历史版本 */
  async listVersions(projectId: number, artifactType: string, artifactKey: string): Promise<any[]> {
    return db("o_artifact_version")
      .where({ projectId, artifactType, artifactKey })
      .orderBy("version", "desc");
  }

  /** 回滚到指定版本 */
  async rollbackToVersion(projectId: number, artifactType: string, artifactKey: string, version: number): Promise<any> {
    const targetVersion = await db("o_artifact_version")
      .where({ projectId, artifactType, artifactKey, version })
      .first();
    if (!targetVersion) throw new Error(`Version ${version} not found`);

    // 创建新版本 (内容复制自目标版本)
    return this.saveVersion({
      instanceId: targetVersion.instanceId,
      projectId,
      artifactType: artifactType as "script" | "image" | "video" | "audio" | "timeline",
      artifactKey,
      content: targetVersion.content,
      filePath: targetVersion.filePath,
      reviewScore: targetVersion.reviewScore ? JSON.parse(targetVersion.reviewScore) : null,
      reviewFeedback: `回滚自 v${version}`,
    });
  }

  // ── 辅助方法 ────────────────────────────────────

  /** 解析剧本为场景数组 */
  private parseScenes(script: string): Array<{ sceneNumber: number; content: string }> {
    const scenes: Array<{ sceneNumber: number; content: string }> = [];
    // 按"场 X"或"场X"分割
    const lines = script.split("\n");
    let currentScene: number | null = null;
    let currentContent: string[] = [];

    for (const line of lines) {
      const match = line.match(/^场\s*(\d+)/);
      if (match) {
        if (currentScene !== null) {
          scenes.push({ sceneNumber: currentScene, content: currentContent.join("\n") });
        }
        currentScene = parseInt(match[1], 10);
        currentContent = [line];
      } else if (currentScene !== null) {
        currentContent.push(line);
      }
    }
    if (currentScene !== null) {
      scenes.push({ sceneNumber: currentScene, content: currentContent.join("\n") });
    }
    return scenes;
  }

  /** 带重试的 DB 操作 */
  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastErr: unknown;
    for (let i = 0; i < this.maxRetries; i++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        if (i < this.maxRetries - 1) {
          await new Promise(r => setTimeout(r, this.retryDelayMs * (i + 1)));
        }
      }
    }
    throw lastErr;
  }

  private getTableForAgent(agentRole: string): string {
    const map: Record<string, string> = {
      screenwriter: "o_script",
      assistant_director: "o_storyboard",
      dp: "o_assets",
      vfx: "o_assets",
      sound: "o_assets",
      sound_designer: "o_assets",
      editor: "o_assets",
      costume: "o_character_library",
      makeup: "o_character_library",
      lighting: "o_scene_library",
      set_decorator: "o_prop_library",
      wardrobe: "o_prop_library",
    };
    return map[agentRole] || "unknown";
  }

  private estimateRowCount(output: any): number {
    if (Array.isArray(output)) return output.length;
    if (output?.images) return output.images.length;
    if (output?.storyboardPlan?.shots) return output.storyboardPlan.shots.length;
    return 1;
  }
}

/** 全局单例 */
export const callbackBridge = new CallbackBridge();
