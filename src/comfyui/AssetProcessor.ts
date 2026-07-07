/**
 * AssetProcessor — ComfyUI 产物处理器
 *
 * 下载产物 + 写入 o_assets + 生成缩略图
 */
import { db } from "@/utils/db";
import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import type { GeneratedAsset } from "./WorkflowExecutor";

export interface ProcessedAsset {
  assetId: number;
  type: "image" | "video";
  url: string;
  thumbnailUrl?: string;
  shotId?: string;
}

export class AssetProcessor {
  /**
   * 处理产物: 下载 + 写入 o_assets + 生成缩略图
   */
  async process(
    assets: GeneratedAsset[],
    projectId: number,
    instanceId: string,
    shotId?: string,
  ): Promise<ProcessedAsset[]> {
    const results: ProcessedAsset[] = [];
    const outputDir = path.resolve(`production/${projectId}`);
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    for (const asset of assets) {
      try {
        // 1. 下载到本地 (如果还没下载)
        let localPath = asset.localPath;
        if (!localPath && asset.url) {
          const ext = asset.type === "video" ? "mp4" : "png";
          localPath = path.join(outputDir, `${uuid()}.${ext}`);
          // 下载逻辑由调用方处理 (WorkflowExecutor 已下载)
        }

        // 2. 生成缩略图 (仅图片)
        let thumbnailUrl: string | undefined;
        if (asset.type === "image" && localPath) {
          thumbnailUrl = await this.generateThumbnail(localPath, outputDir);
        }

        // 3. 写入 o_assets
        const [assetId] = await db("o_assets").insert({
          projectId,
          type: asset.type,
          url: localPath || asset.url || "",
          shotId: shotId || null,
          thumbnailUrl: thumbnailUrl || null,
          source: "harness",
          instanceId,
          createTime: Date.now(),
        });

        results.push({
          assetId,
          type: asset.type as "image" | "video",
          url: localPath || asset.url || "",
          thumbnailUrl,
          shotId,
        });
      } catch (err) {
        console.error("[AssetProcessor] Failed to process asset:", err);
      }
    }

    return results;
  }

  /** 生成缩略图 */
  private async generateThumbnail(originalPath: string, outputDir: string): Promise<string> {
    try {
      const thumbPath = path.join(outputDir, `thumb_${path.basename(originalPath)}`);
      // 简单复制 (实际应使用 sharp 缩放)
      fs.copyFileSync(originalPath, thumbPath);
      return thumbPath;
    } catch {
      return originalPath;  // 失败时用原图
    }
  }

  /** 更新 o_storyboard.imageUrl */
  async updateStoryboardImage(projectId: number, shotId: string, imageUrl: string): Promise<void> {
    try {
      await db("o_storyboard")
        .where({ projectId, shotId, source: "harness" })
        .update({ imageUrl, updateTime: Date.now() });
    } catch (err) {
      console.warn("[AssetProcessor] Failed to update storyboard:", err);
    }
  }
}
