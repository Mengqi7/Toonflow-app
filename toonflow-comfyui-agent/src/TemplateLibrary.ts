import type { WorkflowJSON } from "./types";

export interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  workflow: WorkflowJSON;
}

/**
 * ComfyUI 工作流模板库
 * 预置常用工作流模板供 Agent 自动选择
 */
export class TemplateLibrary {
  private templates: Template[] = [];

  constructor() {
    this.initBuiltinTemplates();
  }

  /** 初始化内置模板 */
  private initBuiltinTemplates(): void {
    this.templates = [
      // ── SDXL 文生图 ──
      {
        id: "sdxl-txt2img",
        name: "SDXL 文生图",
        description: "Stable Diffusion XL 基础文生图工作流",
        category: "image",
        workflow: {
          version: 1,
          nodes: [
            { id: 1, type: "CheckpointLoaderSimple", pos: [50, 100], size: [315, 98], widgets_values: ["sd_xl_base_1.0.safetensors"] },
            { id: 2, type: "CLIPTextEncode", pos: [50, 300], size: [400, 200], widgets_values: ["masterpiece, best quality, {{prompt}}"] },
            { id: 3, type: "CLIPTextEncode", pos: [50, 550], size: [400, 200], widgets_values: ["lowres, bad anatomy, worst quality"] },
            { id: 4, type: "EmptyLatentImage", pos: [50, 800], size: [315, 106], widgets_values: [1024, 1024, 1] },
            { id: 5, type: "KSampler", pos: [500, 300], size: [315, 262], widgets_values: [156680208700286, "randomize", 20, 7, "euler_ancestral", "normal", 1] },
            { id: 6, type: "VAEDecode", pos: [900, 300], size: [210, 46], widgets_values: [] },
            { id: 7, type: "SaveImage", pos: [1200, 300], size: [315, 270], widgets_values: ["Toonflow"] },
          ],
          links: [
            [1, 0, 5, 0], [2, 0, 5, 1], [3, 0, 5, 2], [4, 0, 5, 4], [5, 0, 6, 0], [6, 0, 7, 0],
          ],
        },
      },
      // ── SDXL 图生图 ──
      {
        id: "sdxl-img2img",
        name: "SDXL 图生图",
        description: "基于参考图的风格迁移/变体生成",
        category: "image",
        workflow: {
          version: 1,
          nodes: [
            { id: 1, type: "CheckpointLoaderSimple", pos: [50, 100], size: [315, 98], widgets_values: ["sd_xl_base_1.0.safetensors"] },
            { id: 2, type: "LoadImage", pos: [50, 300], size: [315, 314], widgets_values: ["reference.png"] },
            { id: 3, type: "CLIPTextEncode", pos: [50, 700], size: [400, 200], widgets_values: ["{{prompt}}"] },
            { id: 4, type: "VAEEncode", pos: [450, 300], size: [210, 46], widgets_values: [] },
            { id: 5, type: "KSampler", pos: [450, 700], size: [315, 262], widgets_values: [156680208700286, "randomize", 25, 5.5, "euler", "normal", 0.75] },
            { id: 6, type: "VAEDecode", pos: [850, 500], size: [210, 46], widgets_values: [] },
            { id: 7, type: "SaveImage", pos: [1150, 500], size: [315, 270], widgets_values: ["Toonflow"] },
          ],
          links: [
            [1, 0, 5, 0], [2, 0, 4, 0], [3, 0, 5, 1], [4, 0, 5, 4], [5, 0, 6, 0], [6, 0, 7, 0],
          ],
        },
      },
      // ── ControlNet Canny ──
      {
        id: "controlnet-canny",
        name: "ControlNet Canny 边缘控制",
        description: "保持画面构图一致性的边缘控制生图",
        category: "image",
        workflow: {
          version: 1,
          nodes: [
            { id: 1, type: "CheckpointLoaderSimple", pos: [50, 100], size: [315, 98], widgets_values: ["sd_xl_base_1.0.safetensors"] },
            { id: 2, type: "LoadImage", pos: [50, 300], size: [315, 314], widgets_values: ["pose_ref.png"] },
            { id: 3, type: "CLIPTextEncode", pos: [50, 700], size: [400, 200], widgets_values: ["{{prompt}}"] },
            { id: 4, type: "Canny", pos: [450, 300], size: [315, 190], widgets_values: [100, 200] },
            { id: 5, type: "ControlNetLoader", pos: [50, 650], size: [315, 58], widgets_values: ["control-lora-canny-rank128.safetensors"] },
            { id: 6, type: "KSampler", pos: [800, 400], size: [315, 262], widgets_values: [156680208700286, "randomize", 20, 7, "euler_ancestral", "normal", 1] },
            { id: 7, type: "VAEDecode", pos: [1200, 400], size: [210, 46], widgets_values: [] },
            { id: 8, type: "SaveImage", pos: [1500, 400], size: [315, 270], widgets_values: ["Toonflow"] },
          ],
          links: [
            [1, 0, 6, 0], [2, 0, 4, 0], [3, 0, 6, 1], [4, 0, 5, 0], [5, 0, 6, 3], [6, 0, 7, 0], [7, 0, 8, 0],
          ],
        },
      },
      // ── AnimateDiff 图生视频 ──
      {
        id: "animatediff-txt2vid",
        name: "AnimateDiff 文生视频",
        description: "使用 AnimateDiff 从文本生成短视频",
        category: "video",
        workflow: {
          version: 1,
          nodes: [
            { id: 1, type: "CheckpointLoaderSimple", pos: [50, 100], size: [315, 98], widgets_values: ["sd_xl_base_1.0.safetensors"] },
            { id: 2, type: "CLIPTextEncode", pos: [50, 250], size: [400, 200], widgets_values: ["{{prompt}}"] },
            { id: 3, type: "AnimateDiffLoader", pos: [50, 500], size: [315, 98], widgets_values: ["mm_sd_v15_v2.ckpt", 16] },
            { id: 4, type: "EmptyLatentImage", pos: [50, 650], size: [315, 106], widgets_values: [512, 512, 16] },
            { id: 5, type: "KSampler", pos: [500, 350], size: [315, 262], widgets_values: [156680208700286, "randomize", 20, 8, "euler_ancestral", "normal", 1] },
            { id: 6, type: "VAEDecode", pos: [900, 350], size: [210, 46], widgets_values: [] },
            { id: 7, type: "VHS_VideoCombine", pos: [1200, 350], size: [400, 200], widgets_values: [16, 1, 0, "Toonflow", "video", "mp4", false, false, false] },
          ],
          links: [
            [1, 0, 5, 0], [2, 0, 5, 1], [3, 0, 5, 3], [4, 0, 5, 4], [5, 0, 6, 0], [6, 0, 7, 0],
          ],
        },
      },
      // ── IPAdapter 风格迁移 ──
      {
        id: "ipadapter-style",
        name: "IPAdapter 风格迁移",
        description: "将参考图的风格迁移到生成图像",
        category: "image",
        workflow: {
          version: 1,
          nodes: [
            { id: 1, type: "CheckpointLoaderSimple", pos: [50, 100], size: [315, 98], widgets_values: ["sd_xl_base_1.0.safetensors"] },
            { id: 2, type: "LoadImage", pos: [50, 300], size: [315, 314], widgets_values: ["style_ref.png"] },
            { id: 3, type: "CLIPTextEncode", pos: [50, 700], size: [400, 200], widgets_values: ["{{prompt}}"] },
            { id: 4, type: "IPAdapterModelLoader", pos: [450, 100], size: [315, 58], widgets_values: ["ip-adapter_sd15.safetensors"] },
            { id: 5, type: "CLIPVisionLoader", pos: [450, 200], size: [315, 58], widgets_values: ["CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors"] },
            { id: 6, type: "IPAdapterApply", pos: [450, 400], size: [315, 230], widgets_values: [0.8, 0, 0, "original"] },
            { id: 7, type: "KSampler", pos: [850, 400], size: [315, 262], widgets_values: [156680208700286, "randomize", 20, 7, "euler_ancestral", "normal", 1] },
            { id: 8, type: "VAEDecode", pos: [1250, 400], size: [210, 46], widgets_values: [] },
            { id: 9, type: "SaveImage", pos: [1550, 400], size: [315, 270], widgets_values: ["Toonflow"] },
          ],
          links: [
            [1, 0, 7, 0], [2, 0, 5, 0], [3, 0, 7, 1], [4, 0, 6, 0], [5, 0, 6, 1], [6, 0, 7, 3], [7, 0, 8, 0], [8, 0, 9, 0],
          ],
        },
      },
    ];
  }

  findById(id: string): Template | undefined {
    return this.templates.find(t => t.id === id);
  }

  findByCategory(c: string): Template[] {
    return this.templates.filter(t => t.category === c);
  }

  getClosestMatch(desc: string): Template | undefined {
    const lower = desc.toLowerCase();

    // 关键词匹配
    const keywords: Record<string, string[]> = {
      "sdxl-txt2img": ["text", "txt", "文生图", "generate", "from scratch"],
      "sdxl-img2img": ["img2img", "图生图", "reference", "variation", "variants", "base image"],
      "controlnet-canny": ["controlnet", "canny", "edge", "pose", "structure", "边缘", "姿势", "构图保持"],
      "animatediff-txt2vid": ["video", "animate", "animated", "motion", "视频", "动画"],
      "ipadapter-style": ["ipadapter", "ip adapter", "style transfer", "风格迁移", "style reference"],
    };

    let bestId = "";
    let bestScore = 0;
    for (const [id, kws] of Object.entries(keywords)) {
      const score = kws.filter(kw => lower.includes(kw)).length;
      if (score > bestScore) { bestScore = score; bestId = id; }
    }

    if (bestId) {
      const t = this.findById(bestId);
      if (t) return t;
    }

    // Fallback: 返回第一个模板
    return this.templates[0];
  }

  listAll(): Template[] {
    return [...this.templates];
  }

  addTemplate(t: Template): void {
    const idx = this.templates.findIndex(x => x.id === t.id);
    if (idx >= 0) this.templates[idx] = t;
    else this.templates.push(t);
  }
}
