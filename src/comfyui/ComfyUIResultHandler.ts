import fs from "fs";
import path from "path";
import type { ComfyUIHistoryEntry } from "./ComfyUIClient";
import type { ComfyUIClient } from "./ComfyUIClient";

export interface GeneratedAsset { filename: string; subfolder: string; type: "image" | "video"; url: string; localPath?: string; }

export class ComfyUIResultHandler {
  constructor(private client: ComfyUIClient) {}

  extractOutputs(history: ComfyUIHistoryEntry): GeneratedAsset[] {
    const assets: GeneratedAsset[] = [];
    for (const [, output] of Object.entries(history.outputs || {})) {
      for (const img of output.images || []) {
        assets.push({ filename: img.filename, subfolder: img.subfolder, type: "image", url: this.client["baseUrl"] + "/view?filename=" + img.filename });
      }
      for (const gif of output.gifs || []) {
        assets.push({ filename: gif.filename, subfolder: gif.subfolder, type: "video", url: this.client["baseUrl"] + "/view?filename=" + gif.filename });
      }
    }
    return assets;
  }

  async downloadAssets(assets: GeneratedAsset[], targetDir: string): Promise<string[]> {
    const paths: string[] = [];
    fs.mkdirSync(targetDir, { recursive: true });
    for (const asset of assets) {
      const buf = await this.client.getImage(asset.filename, asset.subfolder, asset.type);
      const localPath = path.join(targetDir, asset.filename);
      fs.writeFileSync(localPath, buf);
      asset.localPath = localPath;
      paths.push(localPath);
    }
    return paths;
  }

  detectOutputType(filename: string): "image" | "video" | "unknown" {
    const ext = path.extname(filename).toLowerCase();
    if ([".png", ".jpg", ".jpeg", ".webp"].includes(ext)) return "image";
    if ([".mp4", ".webm", ".gif"].includes(ext)) return "video";
    return "unknown";
  }
}
