/**
 * Toonflow AI供应商模板 - MiniMax H3 (官方对齐版)
 * @version 7.1 - 对齐 MiniMax H3 官方分辨率要求
 */

// ============================================================
// 类型定义
// ============================================================
type VideoMode =
  | "singleImage"
  | "startEndRequired"
  | "endFrameOptional"
  | "startFrameOptional"
  | "text"
  | (`videoReference:${number}` | `imageReference:${number}` | `audioReference:${number}`)[];

interface TextModel { name: string; modelName: string; type: "text"; think: boolean; }
interface ImageModel { name: string; modelName: string; type: "image"; mode: ("text" | "singleImage" | "multiReference")[]; associationSkills?: string; }
interface VideoModel {
  name: string; modelName: string; type: "video"; mode: VideoMode[]; associationSkills?: string;
  audio: "optional" | false | true; durationResolutionMap: { duration: number[]; resolution: string[] }[];
}
interface TTSModel { name: string; modelName: string; type: "tts"; voices: { title: string; voice: string }[]; }
interface VendorConfig {
  id: string; version: string; name: string; author: string; description?: string; icon?: string;
  inputs: { key: string; label: string; type: "text" | "password" | "url"; required: boolean; placeholder?: string }[];
  inputValues: Record<string, string>; models: (TextModel | ImageModel | VideoModel | TTSModel)[];
}
type ReferenceList =
  | { type: "image"; sourceType: "base64"; base64: string }
  | { type: "audio"; sourceType: "base64"; base64: string }
  | { type: "video"; sourceType: "base64"; base64: string };
interface ImageConfig { prompt: string; referenceList?: Extract<ReferenceList, { type: "image" }>[]; size: "1K" | "2K" | "4K"; aspectRatio: `${number}:${number}`; }
interface VideoConfig { duration: number; resolution: string; aspectRatio: "16:9" | "9:16" | "1:1"; prompt: string; referenceList?: ReferenceList[]; audio?: boolean; mode: VideoMode[]; enableLightning?: boolean; }
interface PollResult { completed: boolean; data?: string; error?: string; }
interface TTSConfig { text: string; voice: string; speed?: number; volume?: number; }

// ============================================================
// 全局声明
// ============================================================
declare const axios: any;
declare const logger: (msg: string) => void;
declare const jsonwebtoken: any;
declare const zipImage: (base64: string, size: number) => Promise<string>;
declare const zipImageResolution: (base64: string, w: number, h: number) => Promise<string>;
declare const mergeImages: (base64Arr: string[], maxSize?: string) => Promise<string>;
declare const urlToBase64: (url: string) => Promise<string>;
declare const pollTask: (fn: () => Promise<PollResult>, interval?: number, timeout?: number) => Promise<PollResult>;
declare const createOpenAI: any;
declare const createDeepSeek: any;
declare const createZhipu: any;
declare const createQwen: any;
declare const createAnthropic: any;
declare const createOpenAICompatible: any;
declare const createXai: any;
declare const createMinimax: any;
declare const createGoogleGenerativeAI: any;
declare const exports: {
  vendor: VendorConfig;
  textRequest: (m: TextModel) => any;
  imageRequest: (c: ImageConfig, m: ImageModel) => Promise<string>;
  videoRequest: (c: VideoConfig, m: VideoModel) => Promise<string>;
  ttsRequest: (c: TTSConfig, m: TTSModel) => Promise<string>;
  checkForUpdates?: () => Promise<{ hasUpdate: boolean; latestVersion: string; notice: string }>;
  updateVendor?: () => Promise<string>;
};

// ============================================================
// 供应商配置
// ============================================================
const vendor: VendorConfig = {
  id: "comfyui_local_minimax_h3_official",
  version: "7.1",
  name: "Local ComfyUI MiniMax H3 (官方对齐版)",
  author: "Toonflow",
  description: `## MiniMax H3 图生视频工作流 (官方对齐版)

**MiniMax H3** 是 MiniMax 的通用全模态生成模型，支持：
- 📷 首帧/尾帧双帧控制
- 🔊 原生立体声音频生成
- 🎬 最高 1088p (1920x1088) 分辨率，24fps
- 🎯 单次前向传播联合建模
- ⚡ **动态 LoRA 开关**：可随时启用/禁用 4-step Lightning LoRA
- ⚡ **动态步数切换**：启用 LoRA 时自动切换为 8 步，禁用时为 20 步

**模型要求**（需放入 ComfyUI/models/ 目录）：
- \`diffusion_models/minimax_h3_fl2va_int8_convrot.safetensors\`
- \`text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors\`
- \`vae/minimax_h3_video_vae_fp16.safetensors\`
- \`vae/minimax_h3_audio_vae_fp32.safetensors\`
- \`loras/minimax_h3_fl2v_turbo_4step_v1.0_768p_comfyui_bf16.safetensors\`

**支持分辨率（通过 megapixels 控制）**：
| 分辨率 | megapixels | 16:9 尺寸 | 9:16 尺寸 | 1:1 尺寸 |
|--------|------------|-----------|-----------|----------|
| 352p | 0.2 | 608x352 | 352x608 | 448x448 |
| 416p | 0.3 | 736x416 | 416x736 | 544x544 |
| 480p | 0.4 | 864x480 | 480x864 | 640x640 |
| 544p | 0.5 | 960x544 | 544x960 | 704x704 |
| 608p | 0.6 | 1056x608 | 608x1056 | 768x768 |
| 640p | 0.7 | 1152x640 | 640x1152 | 832x832 |
| 672p | 0.8 | 1216x672 | 672x1216 | 864x864 |
| **736p** | **0.9** | **1280x736** | **736x1280** | **928x928** |
| **768p** ⭐ | **0.98** | **1344x768** | **768x1344** | **992x992** |
| 832p | 1.2 | 1504x832 | 832x1504 | 1088x1088 |
| 928p | 1.5 | 1664x928 | 928x1664 | 1216x1216 |
| 1024p | 1.8 | 1824x1024 | 1024x1824 | 1344x1344 |
| 1088p | 2.0 | 1920x1088 | 1088x1920 | 1408x1408 |

⭐ **768p (0.98 megapixels)** 为 MiniMax H3 官方推荐分辨率

**帧数规则**：自动对齐到 17k+5
**时长范围**：3-15 秒`,
  inputs: [
    { key: "baseUrl", label: "ComfyUI 地址", type: "text", required: true, placeholder: "http://localhost:8188" },
  ],
  inputValues: { baseUrl: "http://localhost:8188" },
  models: [{
    name: "MiniMax H3 (官方对齐版)",
    modelName: "minimax-h3-i2v-official",
    type: "video",
    mode: ["singleImage", "startEndRequired"],
    audio: true,
    durationResolutionMap: [
      { duration: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], resolution: ["480p", "544p", "608p", "640p", "672p", "736p", "768p", "832p", "928p", "1024p", "1088p"] }
    ],
    associationSkills: "对齐 MiniMax H3 官方要求，支持首帧+尾帧双帧控制，动态 LoRA 开关，自动步数切换。"
  }],
};

// ============================================================
// 分辨率映射表（对齐 MiniMax H3 官方要求）
// 短边 768px 为官方推荐值，所有尺寸均为 32 倍数对齐
// ============================================================
const RESOLUTION_MAP: Record<string, Record<"16:9" | "9:16" | "1:1", { megapixels: number; width: number; height: number }>> = {
  // 低分辨率（快速测试）
  "352p": {
    "16:9": { megapixels: 0.2, width: 608, height: 352 },
    "9:16": { megapixels: 0.2, width: 352, height: 608 },
    "1:1": { megapixels: 0.2, width: 448, height: 448 }
  },
  "416p": {
    "16:9": { megapixels: 0.3, width: 736, height: 416 },
    "9:16": { megapixels: 0.3, width: 416, height: 736 },
    "1:1": { megapixels: 0.3, width: 544, height: 544 }
  },
  // 480p - 常用测试分辨率
  "480p": {
    "16:9": { megapixels: 0.4, width: 864, height: 480 },
    "9:16": { megapixels: 0.4, width: 480, height: 864 },
    "1:1": { megapixels: 0.4, width: 640, height: 640 }
  },
  "544p": {
    "16:9": { megapixels: 0.5, width: 960, height: 544 },
    "9:16": { megapixels: 0.5, width: 544, height: 960 },
    "1:1": { megapixels: 0.5, width: 704, height: 704 }
  },
  "608p": {
    "16:9": { megapixels: 0.6, width: 1056, height: 608 },
    "9:16": { megapixels: 0.6, width: 608, height: 1056 },
    "1:1": { megapixels: 0.6, width: 768, height: 768 }
  },
  "640p": {
    "16:9": { megapixels: 0.7, width: 1152, height: 640 },
    "9:16": { megapixels: 0.7, width: 640, height: 1152 },
    "1:1": { megapixels: 0.7, width: 832, height: 832 }
  },
  "672p": {
    "16:9": { megapixels: 0.8, width: 1216, height: 672 },
    "9:16": { megapixels: 0.8, width: 672, height: 1216 },
    "1:1": { megapixels: 0.8, width: 864, height: 864 }
  },
  "736p": {
    "16:9": { megapixels: 0.9, width: 1280, height: 736 },
    "9:16": { megapixels: 0.9, width: 736, height: 1280 },
    "1:1": { megapixels: 0.9, width: 928, height: 928 }
  },
  // ⭐ 官方推荐：768p（短边 768px）
  "768p": {
    "16:9": { megapixels: 0.98, width: 1344, height: 768 },
    "9:16": { megapixels: 0.98, width: 768, height: 1344 },
    "1:1": { megapixels: 0.98, width: 992, height: 992 }
  },
  "832p": {
    "16:9": { megapixels: 1.2, width: 1504, height: 832 },
    "9:16": { megapixels: 1.2, width: 832, height: 1504 },
    "1:1": { megapixels: 1.2, width: 1088, height: 1088 }
  },
  "928p": {
    "16:9": { megapixels: 1.5, width: 1664, height: 928 },
    "9:16": { megapixels: 1.5, width: 928, height: 1664 },
    "1:1": { megapixels: 1.5, width: 1216, height: 1216 }
  },
  "1024p": {
    "16:9": { megapixels: 1.8, width: 1824, height: 1024 },
    "9:16": { megapixels: 1.8, width: 1024, height: 1824 },
    "1:1": { megapixels: 1.8, width: 1344, height: 1344 }
  },
  "1088p": {
    "16:9": { megapixels: 2.0, width: 1920, height: 1088 },
    "9:16": { megapixels: 2.0, width: 1088, height: 1920 },
    "1:1": { megapixels: 2.0, width: 1408, height: 1408 }
  }
};

const DEFAULT_RESOLUTION = "768p";

// ============================================================
// 解析分辨率
// ============================================================
const parseResolution = (
  resolution: string,
  aspectRatio: "16:9" | "9:16" | "1:1"
): { megapixels: number; width: number; height: number } => {

  // 1. 匹配 "宽x高" 格式
  const exactMatch = resolution.match(/^(\d+)x(\d+)$/);
  if (exactMatch) {
    const w = parseInt(exactMatch[1]);
    const h = parseInt(exactMatch[2]);
    let bestMatch = RESOLUTION_MAP[DEFAULT_RESOLUTION][aspectRatio];
    let minDiff = Infinity;
    for (const [key, value] of Object.entries(RESOLUTION_MAP)) {
      const target = value[aspectRatio];
      const diff = Math.abs(target.width - w) + Math.abs(target.height - h);
      if (diff < minDiff) {
        minDiff = diff;
        bestMatch = target;
      }
    }
    return bestMatch;
  }

  // 2. 匹配 "768p" 格式
  const key = resolution.toLowerCase();
  if (RESOLUTION_MAP[key] && RESOLUTION_MAP[key][aspectRatio]) {
    return RESOLUTION_MAP[key][aspectRatio];
  }

  // 3. 匹配数字 "0.98"
  const numMatch = parseFloat(resolution);
  if (!isNaN(numMatch)) {
    let bestMatch = RESOLUTION_MAP[DEFAULT_RESOLUTION][aspectRatio];
    let minDiff = Infinity;
    for (const [key, value] of Object.entries(RESOLUTION_MAP)) {
      const target = value[aspectRatio];
      const diff = Math.abs(target.megapixels - numMatch);
      if (diff < minDiff) {
        minDiff = diff;
        bestMatch = target;
      }
    }
    return bestMatch;
  }

  // 4. 默认返回 768p
  return RESOLUTION_MAP[DEFAULT_RESOLUTION][aspectRatio];
};

// ============================================================
// 工具函数：计算 H3 合法帧数（17k+5 对齐）
// ============================================================
const calculateH3FrameCount = (seconds: number): number => {
  const rawFrames = Math.round(seconds * 24);
  const base = Math.max(5, rawFrames);
  const remainder = base % 17;
  const adjustment = (5 - remainder) % 17;
  return base + adjustment;
};

// ============================================================
// API 格式工作流
// ============================================================
const getWorkflowJSON = (
  aspectRatio: "16:9" | "9:16" | "1:1",
  prompt: string,
  duration: number,
  resolution: string,
  enableLightning: boolean
) => {
  const aspectRatioLabel = aspectRatio === "16:9" ? "16:9 (Widescreen)" : 
                           aspectRatio === "9:16" ? "9:16 (Portrait)" : 
                           "1:1 (Square)";
  const res = parseResolution(resolution, aspectRatio);
  
  logger(`=== MiniMax H3 生成配置 ===`);
  logger(`分辨率: ${resolution} → ${res.width}x${res.height} (megapixels: ${res.megapixels})`);
  logger(`宽高比: ${aspectRatio}`);
  logger(`Lightning LoRA: ${enableLightning ? "启用 ✅" : "禁用 ❌"}`);
  logger(`采样步数: ${enableLightning ? "8 步 (加速模式)" : "20 步 (标准模式)"}`);
  logger(`============================`);

  return {
    "92": {
      inputs: {
        filename_prefix: "video/MiniMax_H3",
        format: "auto",
        codec: "auto",
        video: ["105:91", 0]
      },
      class_type: "SaveVideo",
      _meta: { title: "保存视频" }
    },
    "114": {
      inputs: {
        image: "Krea2_turbo_00002_.png"
      },
      class_type: "LoadImage",
      _meta: { title: "加载图像" }
    },
    "115": {
      inputs: {
        aspect_ratio: aspectRatioLabel,
        megapixels: res.megapixels,
        multiple: 32
      },
      class_type: "ResolutionSelector",
      _meta: { title: "分辨率选择器" }
    },
    "119": {
      inputs: {
        upscale_method: "nearest-exact",
        megapixels: 0.9,
        resolution_steps: 32
      },
      class_type: "ImageScaleToTotalPixels",
      _meta: { title: "缩放图像（像素）" }
    },
    "120": {
      inputs: {
        image: ["119", 0]
      },
      class_type: "GetImageSize",
      _meta: { title: "获取图像尺寸" }
    },
    "105:11": {
      inputs: {
        vae_name: "Minimax-h3\\minimax_h3_video_vae_fp16.safetensors"
      },
      class_type: "VAELoader",
      _meta: { title: "加载VAE" }
    },
    "105:24": {
      inputs: {
        vae_name: "Minimax-h3\\minimax_h3_audio_vae_fp32.safetensors"
      },
      class_type: "VAELoader",
      _meta: { title: "加载VAE" }
    },
    "105:17": {
      inputs: {
        sampler_name: "res_multistep"
      },
      class_type: "KSamplerSelect",
      _meta: { title: "K采样器选择" }
    },
    "105:6": {
      inputs: {
        unet_name: "Minimax-h3\\minimax_h3_fl2va_pruned_int8_convrot.safetensors",
        weight_dtype: "default"
      },
      class_type: "UNETLoader",
      _meta: { title: "UNet加载器" }
    },
    "105:13": {
      inputs: {
        clip_name: "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
        type: "minimax",
        device: "default"
      },
      class_type: "CLIPLoader",
      _meta: { title: "加载CLIP" }
    },
    "105:15": {
      inputs: {
        noise_seed: Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)
      },
      class_type: "RandomNoise",
      _meta: { title: "随机噪波" }
    },
    "105:125": {
      inputs: {
        value: 8
      },
      class_type: "PrimitiveInt",
      _meta: { title: "整数 (Lightning步数)" }
    },
    "105:126": {
      inputs: {
        value: enableLightning
      },
      class_type: "PrimitiveBoolean",
      _meta: { title: "Boolean (Enable Lightning LoRA)" }
    },
    "105:111": {
      inputs: {
        value: duration
      },
      class_type: "PrimitiveFloat",
      _meta: { title: "Float (duration)" }
    },
    "105:124": {
      inputs: {
        value: 20
      },
      class_type: "PrimitiveInt",
      _meta: { title: "整数 (标准步数)" }
    },
    "105:121": {
      inputs: {
        lora_name: "minimax_h3_fl2v_turbo_4step_v1.0_768p_comfyui_bf16.safetensors",
        strength_model: 1,
        model: ["105:6", 0]
      },
      class_type: "LoraLoaderModelOnly",
      _meta: { title: "LoRA加载器（仅模型）" }
    },
    "105:107": {
      inputs: {
        expression: "max(5, round(a * 24)) + (5 - (max(5, round(a * 24)) % 17)) % 17",
        "values.a": ["105:111", 0]
      },
      class_type: "ComfyMathExpression",
      _meta: { title: "数学表达式" }
    },
    "105:123": {
      inputs: {
        switch: ["105:126", 0],
        on_false: ["105:124", 0],
        on_true: ["105:125", 0]
      },
      class_type: "ComfySwitchNode",
      _meta: { title: "If/Else Switch (Steps)" }
    },
    "105:122": {
      inputs: {
        switch: ["105:126", 0],
        on_false: ["105:6", 0],
        on_true: ["105:121", 0]
      },
      class_type: "ComfySwitchNode",
      _meta: { title: "If/Else Switch (Model)" }
    },
    "105:104": {
      inputs: {
        prompt: prompt,
        width: ["115", 0],
        height: ["115", 1],
        length: ["105:107", 1],
        clip: ["105:13", 0],
        vae: ["105:11", 0],
        first_frame: ["114", 0]
      },
      class_type: "MiniMaxH3ImageToVideo",
      _meta: { title: "MiniMax H3 Image to Video" }
    },
    "105:9": {
      inputs: {
        scheduler: "simple",
        steps: ["105:123", 0],
        denoise: 1,
        model: ["105:122", 0]
      },
      class_type: "BasicScheduler",
      _meta: { title: "基本调度器" }
    },
    "105:16": {
      inputs: {
        model: ["105:122", 0],
        conditioning: ["105:104", 0]
      },
      class_type: "BasicGuider",
      _meta: { title: "基本引导器" }
    },
    "105:14": {
      inputs: {
        noise: ["105:15", 0],
        guider: ["105:16", 0],
        sampler: ["105:17", 0],
        sigmas: ["105:9", 0],
        latent_image: ["105:104", 1]
      },
      class_type: "SamplerCustomAdvanced",
      _meta: { title: "自定义采样器（高级）" }
    },
    "105:23": {
      inputs: {
        samples: ["105:14", 0],
        vae: ["105:24", 0]
      },
      class_type: "VAEDecodeAudio",
      _meta: { title: "VAE解码（音频）" }
    },
    "105:10": {
      inputs: {
        samples: ["105:14", 0],
        vae: ["105:11", 0]
      },
      class_type: "VAEDecode",
      _meta: { title: "VAE解码" }
    },
    "105:91": {
      inputs: {
        fps: 24,
        bit_depth: 8,
        images: ["105:10", 0],
        audio: ["105:23", 0]
      },
      class_type: "CreateVideo",
      _meta: { title: "创建视频" }
    }
  };
};

// ============================================================
// 视频转 Base64
// ============================================================
const videoToBase64 = async (url: string): Promise<string> => {
  try {
    const resp = await axios({
      method: 'GET',
      url: url,
      responseType: 'arraybuffer',
      timeout: 180000
    });
    const base64 = Buffer.from(resp.data).toString('base64');
    return `data:video/mp4;base64,${base64}`;
  } catch (err: any) {
    logger(`视频转Base64失败: ${err.message}`);
    throw err;
  }
};

// ============================================================
// 适配器函数
// ============================================================
const textRequest = (model: TextModel) => { throw new Error("不支持文本生成"); };
const imageRequest = async (config: ImageConfig, model: ImageModel): Promise<string> => { return ""; };

// ============================================================
// 核心：视频生成请求
// ============================================================
const videoRequest = async (config: VideoConfig, model: VideoModel): Promise<string> => {
  const baseUrl = vendor.inputValues.baseUrl || "http://localhost:8188";

  // 1. 参数校验
  if (!config.prompt) throw new Error("缺少视频生成提示词");
  if (!config.referenceList || config.referenceList.length === 0) {
    throw new Error("缺少参考图片（至少需要首帧）");
  }

  // 2. 处理首帧图片
  let firstFrameBase64 = config.referenceList[0].base64;
  if (firstFrameBase64.includes(',')) {
    firstFrameBase64 = firstFrameBase64.split(',')[1];
  }
  if (!firstFrameBase64 || firstFrameBase64.trim().length < 100) {
    throw new Error("首帧图片 Base64 数据为空或格式错误");
  }

  // 3. 处理尾帧图片（可选）
  let lastFrameBase64: string | null = null;
  if (config.referenceList.length > 1) {
    lastFrameBase64 = config.referenceList[1].base64;
    if (lastFrameBase64.includes(',')) {
      lastFrameBase64 = lastFrameBase64.split(',')[1];
    }
  }

  // 4. Lightning LoRA 开关（默认启用）
  const enableLightning = config.enableLightning !== undefined ? config.enableLightning : true;

  // 5. 获取工作流
  const workflow = getWorkflowJSON(
    config.aspectRatio as "16:9" | "9:16" | "1:1",
    config.prompt,
    config.duration,
    config.resolution,
    enableLightning
  );

  // 6. 注入首帧（替换 LoadImage 为 LoadImageBase64）
  workflow["114"] = {
    inputs: {
      base64_data: firstFrameBase64,
      image_output: "Preview",
      save_prefix: "ComfyUI"
    },
    class_type: "easy loadImageBase64",
    _meta: { title: "加载图像(Base64)" }
  };

  // 7. 注入尾帧（如果有）
  if (lastFrameBase64) {
    workflow["200"] = {
      inputs: {
        base64_data: lastFrameBase64,
        image_output: "Preview",
        save_prefix: "ComfyUI_lastframe"
      },
      class_type: "easy loadImageBase64",
      _meta: { title: "加载图像(Base64)" }
    };
    workflow["105:104"]["inputs"]["last_frame"] = ["200", 0];
    logger("尾帧已注入");
  } else {
    delete workflow["105:104"]["inputs"]["last_frame"];
    logger("未提供尾帧，使用单帧模式");
  }

  // 8. 日志
  const frameCount = calculateH3FrameCount(config.duration);
  logger(`时长：${config.duration}秒 → 帧数：${frameCount} (17k+5对齐)`);

  if (config.audio === false) {
    workflow["105:91"]["inputs"]["audio"] = null;
    logger("音频已禁用");
  } else {
    logger("音频已启用");
  }

  // 9. 提交任务
  logger("提交任务到 ComfyUI...");
  logger(`提示词: ${config.prompt.substring(0, 100)}${config.prompt.length > 100 ? "..." : ""}`);

  try {
    const submitResp = await fetch(`${baseUrl}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: workflow }),
    });

    if (!submitResp.ok) {
      const errorText = await submitResp.text();
      throw new Error(`HTTP ${submitResp.status}: ${errorText || submitResp.statusText}`);
    }

    const submitData = await submitResp.json();
    const promptId = submitData.prompt_id;
    logger(`任务提交成功，ID: ${promptId}`);

    // 10. 轮询结果
    const result = await pollTask(async () => {
      const historyResp = await fetch(`${baseUrl}/history`);
      const history = await historyResp.json();

      const run = history[promptId];
      if (!run) return { completed: false };

      if (run.status?.exec_info?.error) {
        const errorMsg = typeof run.status.exec_info.error === 'string'
          ? run.status.exec_info.error
          : JSON.stringify(run.status.exec_info.error);
        return { completed: true, error: errorMsg };
      }

      const output = run.outputs?.["92"];
      if (output?.videos && output.videos.length > 0) {
        return { completed: true, data: output.videos[0] };
      }
      if (output?.images && output.images.length > 0) {
        return { completed: true, data: output.images[0] };
      }

      return { completed: false };
    }, 3000, 600000);

    if (result.error) throw new Error(`生成失败: ${result.error}`);
    if (!result.data) throw new Error("未找到生成的视频文件");

    // 11. 下载视频
    const fileInfo = result.data;
    const downloadUrl = `${baseUrl}/view?filename=${encodeURIComponent(fileInfo.filename)}&subfolder=${encodeURIComponent(fileInfo.subfolder || '')}&type=${fileInfo.type || 'output'}`;

    logger(`下载视频: ${fileInfo.filename}`);
    return await urlToBase64(downloadUrl);

  } catch (e: any) {
    logger(`错误: ${e.message}`);
    throw new Error(`ComfyUI 视频生成失败: ${e.message}`);
  }
};

const ttsRequest = async (config: TTSConfig, model: TTSModel): Promise<string> => { return ""; };

const checkForUpdates = async () => ({
  hasUpdate: false,
  latestVersion: "7.1",
  notice: `✅ MiniMax H3 适配完成 v7.1 (官方对齐版)

📐 **分辨率控制（通过 megapixels）**：
| 分辨率 | megapixels | 16:9 尺寸 |
|--------|------------|-----------|
| 352p | 0.2 | 608x352 |
| 416p | 0.3 | 736x416 |
| 480p | 0.4 | 864x480 |
| 544p | 0.5 | 960x544 |
| 608p | 0.6 | 1056x608 |
| 640p | 0.7 | 1152x640 |
| 672p | 0.8 | 1216x672 |
| 736p | 0.9 | 1280x736 |
| ⭐768p | 0.98 | 1344x768 |
| 832p | 1.2 | 1504x832 |
| 928p | 1.5 | 1664x928 |
| 1024p | 1.8 | 1824x1024 |
| 1088p | 2.0 | 1920x1088 |

⭐ **768p (0.98 megapixels)** = MiniMax H3 官方推荐

⚡ **动态控制**：
- LoRA 开关：启用 → 8步 / 禁用 → 20步
- 支持比例：16:9 | 9:16 | 1:1

💡 **使用建议**：
- 快速测试: 480p (0.4) 或 608p (0.6)
- 官方推荐: 768p (0.98) ← 最佳平衡
- 高清输出: 1088p (2.0)`
});

const updateVendor = async () => { return ""; };

// ============================================================
// 导出
// ============================================================
exports.vendor = vendor;
exports.textRequest = textRequest;
exports.imageRequest = imageRequest;
exports.videoRequest = videoRequest;
exports.ttsRequest = ttsRequest;
exports.checkForUpdates = checkForUpdates;
exports.updateVendor = updateVendor;

export { };