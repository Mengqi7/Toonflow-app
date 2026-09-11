/**
 * Toonflow AI供应商模板 - LTX 2.5 图生视频适配器
 * @version 5.0 (适配 video_ltx2_5_i2v_api.json 工作流)
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
interface VideoConfig { duration: number; resolution: string; aspectRatio: "16:9" | "9:16"; prompt: string; referenceList?: ReferenceList[]; audio?: boolean; mode: VideoMode[]; }
interface PollResult { completed: boolean; data?: string; error?: string; }
interface TTSConfig { text: string; voice: string; speed?: number; volume?: number; }

// ============================================================
// 全局声明
// ============================================================
declare const axios: any;
declare const logger: (msg: string | number) => void;
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
  id: "comfyui_local_ltx25_v5",
  version: "5.0",
  name: "Local ComfyUI LTX 2.5 (API)",
  author: "Toonflow",
  description: "## 基于 video_ltx2_5_i2v_api.json 工作流适配器。\n支持图生视频、Prompt增强、一镜到底、多分辨率输出。\n使用 CreateVideo + SaveVideo 输出节点。",
  inputs: [
    { key: "baseUrl", label: "ComfyUI 地址", type: "text", required: true, placeholder: "http://localhost:8188" },
  ],
  inputValues: { baseUrl: "http://localhost:8188" },
  models: [{
    name: "LTX 2.5 (图生视频 - API)",
    modelName: "local-ltx-2.5-api",
    type: "video",
    mode: ["singleImage"],
    audio: false,
    durationResolutionMap: [
      { duration: [3, 5, 8, 10, 15], resolution: ["480p", "720p", "1080p"] }
    ],
    associationSkills: "基于 video_ltx2_5_i2v_api.json 工作流运行本地 ComfyUI 节点进行视频生成。支持Prompt增强、一镜到底、自定义Sigmas采样。"
  }],
};

// ============================================================
// LTX 2.5 工作流 JSON（直接从 video_ltx2_5_i2v_api.json 导入）
// ============================================================
const WORKFLOW_JSON = {
  "75": {
    "inputs": {
      "filename_prefix": "video/LTX-2.5_i2v",
      "format": "auto",
      "codec": "auto",
      "video-preview": "",
      "video": ["398:370", 0]
    },
    "class_type": "SaveVideo",
    "_meta": {
      "title": "保存视频"
    }
  },
  "395": {
    "inputs": {
      "image": ""
    },
    "class_type": "LoadImage",
    "_meta": {
      "title": "Load First Frame"
    }
  },
  "403": {
    "inputs": {
      "aspect_ratio": "16:9 (Widescreen)",
      "megapixels": 0.9,
      "multiple": 32
    },
    "class_type": "ResolutionSelector",
    "_meta": {
      "title": "分辨率选择器"
    }
  },
  "398:393": {
    "inputs": {
      "clip_name": "gemma4_e2b_it_bf16.safetensors",
      "type": "ltxv",
      "device": "default"
    },
    "class_type": "CLIPLoader",
    "_meta": {
      "title": "加载CLIP"
    }
  },
  "398:380": {
    "inputs": {
      "prompt": ["398:376", 0],
      "max_length": 600,
      "sampling_mode": "on",
      "sampling_mode.temperature": 0.7,
      "sampling_mode.top_k": 64,
      "sampling_mode.top_p": 0.95,
      "sampling_mode.min_p": 0.05,
      "sampling_mode.repetition_penalty": 1.15,
      "sampling_mode.seed": 0,
      "sampling_mode.presence_penalty": 0,
      "thinking": false,
      "use_default_template": true,
      "clip": ["398:393", 0],
      "image": ["398:350", 0]
    },
    "class_type": "TextGenerateLTX2Prompt",
    "_meta": {
      "title": "TextGenerateLTX2Prompt"
    }
  },
  "398:383": {
    "inputs": {
      "value": true
    },
    "class_type": "PrimitiveBoolean",
    "_meta": {
      "title": "Boolean (Enable Prompt Enhance)"
    }
  },
  "398:364": {
    "inputs": {
      "text": ["398:382", 0],
      "clip": ["398:387", 0]
    },
    "class_type": "CLIPTextEncode",
    "_meta": {
      "title": "CLIP文本编码"
    }
  },
  "398:376": {
    "inputs": {
      "value": ""
    },
    "class_type": "PrimitiveStringMultiline",
    "_meta": {
      "title": "Prompt"
    }
  },
  "398:382": {
    "inputs": {
      "switch": ["398:383", 0],
      "on_false": ["398:376", 0],
      "on_true": ["398:380", 0]
    },
    "class_type": "ComfySwitchNode",
    "_meta": {
      "title": "切换"
    }
  },
  "398:384": {
    "inputs": {
      "unet_name": "ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors",
      "weight_dtype": "default"
    },
    "class_type": "UNETLoader",
    "_meta": {
      "title": "UNet加载器"
    }
  },
  "398:381": {
    "inputs": {
      "source": ["398:382", 0]
    },
    "class_type": "PreviewAny",
    "_meta": {
      "title": "预览任意"
    }
  },
  "398:362": {
    "inputs": {
      "value": 5
    },
    "class_type": "PrimitiveInt",
    "_meta": {
      "title": "Duration"
    }
  },
  "398:363": {
    "inputs": {
      "value": false
    },
    "class_type": "PrimitiveBoolean",
    "_meta": {
      "title": "Switch to Text to Video?"
    }
  },
  "398:365": {
    "inputs": {
      "frame_rate": ["398:359", 0],
      "positive": ["398:364", 0],
      "negative": ["398:373", 0]
    },
    "class_type": "LTXVConditioning",
    "_meta": {
      "title": "LTXV条件"
    }
  },
  "398:385": {
    "inputs": {
      "vae_name": "ltx-2.5-video-vae-conv-bf16.safetensors"
    },
    "class_type": "VAELoader",
    "_meta": {
      "title": "加载VAE"
    }
  },
  "398:386": {
    "inputs": {
      "vae_name": "ltx-2.5-audio-vae-bf16.safetensors"
    },
    "class_type": "VAELoader",
    "_meta": {
      "title": "加载VAE"
    }
  },
  "398:372": {
    "inputs": {
      "value": ["403", 0]
    },
    "class_type": "PrimitiveInt",
    "_meta": {
      "title": "Width"
    }
  },
  "398:373": {
    "inputs": {
      "text": "pc game, console game, video game, cartoon, childish, ugly",
      "clip": ["398:387", 0]
    },
    "class_type": "CLIPTextEncode",
    "_meta": {
      "title": "CLIP文本编码"
    }
  },
  "398:387": {
    "inputs": {
      "clip_name": "gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors",
      "type": "ltxv",
      "device": "default"
    },
    "class_type": "CLIPLoader",
    "_meta": {
      "title": "加载CLIP"
    }
  },
  "398:360": {
    "inputs": {
      "value": ["403", 1]
    },
    "class_type": "PrimitiveInt",
    "_meta": {
      "title": "Height"
    }
  },
  "398:352": {
    "inputs": {
      "sampler_name": "euler_ancestral"
    },
    "class_type": "KSamplerSelect",
    "_meta": {
      "title": "K采样器选择"
    }
  },
  "398:339": {
    "inputs": {
      "noise_seed": 508777618758128
    },
    "class_type": "RandomNoise",
    "_meta": {
      "title": "随机噪波"
    }
  },
  "398:397": {
    "inputs": {
      "sigmas": "1.0, 0.99375, 0.9875, 0.98125, 0.975, 0.909375, 0.725, 0.421875, 0.0"
    },
    "class_type": "ManualSigmas",
    "_meta": {
      "title": "自定义Sigmas"
    }
  },
  "398:361": {
    "inputs": {
      "value": 24
    },
    "class_type": "PrimitiveInt",
    "_meta": {
      "title": "Frame Rate"
    }
  },
  "398:371": {
    "inputs": {
      "model_name": "ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors"
    },
    "class_type": "LatentUpscaleModelLoader",
    "_meta": {
      "title": "加载Latent放大模型"
    }
  },
  "398:388": {
    "inputs": {
      "model": ["398:384", 0],
      "conditioning": ["398:365", 0]
    },
    "class_type": "BasicGuider",
    "_meta": {
      "title": "LTXV Dual CFG Guider"
    }
  },
  "398:344": {
    "inputs": {
      "noise": ["398:339", 0],
      "guider": ["398:388", 0],
      "sampler": ["398:352", 0],
      "sigmas": ["398:397", 0],
      "latent_image": ["398:377", 0]
    },
    "class_type": "SamplerCustomAdvanced",
    "_meta": {
      "title": "自定义采样器（高级）"
    }
  },
  "398:357": {
    "inputs": {
      "strength": 0.7,
      "bypass": ["398:363", 0],
      "vae": ["398:385", 0],
      "image": ["398:350", 0],
      "latent": ["398:356", 0]
    },
    "class_type": "LTXVImgToVideoInplace",
    "_meta": {
      "title": "LTXV图像转视频（原地）"
    }
  },
  "398:366": {
    "inputs": {
      "frames_number": ["398:378", 1],
      "frame_rate": ["398:359", 1],
      "batch_size": 1,
      "audio_vae": ["398:386", 0]
    },
    "class_type": "LTXVEmptyLatentAudio",
    "_meta": {
      "title": "LTXV 空音频潜空间"
    }
  },
  "398:367": {
    "inputs": {
      "av_latent": ["398:344", 0]
    },
    "class_type": "LTXVSeparateAVLatent",
    "_meta": {
      "title": "LTXV分离音视频潜空间"
    }
  },
  "398:377": {
    "inputs": {
      "video_latent": ["398:357", 0],
      "audio_latent": ["398:366", 0]
    },
    "class_type": "LTXVConcatAVLatent",
    "_meta": {
      "title": "LTXVConcatAVLatent"
    }
  },
  "398:351": {
    "inputs": {
      "resize_type": "scale longer dimension",
      "resize_type.longer_size": 1536,
      "scale_method": "lanczos",
      "input": ["395", 0]
    },
    "class_type": "ResizeImageMaskNode",
    "_meta": {
      "title": "调整图像/掩码大小"
    }
  },
  "398:353": {
    "inputs": {
      "expression": "a/2",
      "values.a": ["398:372", 0]
    },
    "class_type": "ComfyMathExpression",
    "_meta": {
      "title": "数学表达式"
    }
  },
  "398:355": {
    "inputs": {
      "expression": "a/2",
      "values.a": ["398:360", 0]
    },
    "class_type": "ComfyMathExpression",
    "_meta": {
      "title": "数学表达式"
    }
  },
  "398:350": {
    "inputs": {
      "img_compression": 18,
      "image": ["398:351", 0]
    },
    "class_type": "LTXVPreprocess",
    "_meta": {
      "title": "LTXV预处理"
    }
  },
  "398:356": {
    "inputs": {
      "width": ["398:353", 1],
      "height": ["398:355", 1],
      "length": ["398:378", 1],
      "batch_size": 1
    },
    "class_type": "EmptyLTXVLatentVideo",
    "_meta": {
      "title": "空Latent视频（LTXV）"
    }
  },
  "398:348": {
    "inputs": {
      "samples": ["398:367", 0],
      "upscale_model": ["398:371", 0],
      "vae": ["398:385", 0]
    },
    "class_type": "LTXVLatentUpsampler",
    "_meta": {
      "title": "LTXV潜空间上采样器"
    }
  },
  "398:349": {
    "inputs": {
      "strength": 1,
      "bypass": ["398:363", 0],
      "vae": ["398:385", 0],
      "image": ["398:350", 0],
      "latent": ["398:348", 0]
    },
    "class_type": "LTXVImgToVideoInplace",
    "_meta": {
      "title": "LTXV图像转视频（原地）"
    }
  },
  "398:359": {
    "inputs": {
      "expression": "a",
      "values.a": ["398:361", 0]
    },
    "class_type": "ComfyMathExpression",
    "_meta": {
      "title": "Math Expression (fps)"
    }
  },
  "398:378": {
    "inputs": {
      "expression": "a * b + 1",
      "values.a": ["398:362", 0],
      "values.b": ["398:361", 0]
    },
    "class_type": "ComfyMathExpression",
    "_meta": {
      "title": "Math Expression (length)"
    }
  },
  "398:338": {
    "inputs": {
      "noise_seed": 42
    },
    "class_type": "RandomNoise",
    "_meta": {
      "title": "随机噪波"
    }
  },
  "398:340": {
    "inputs": {
      "video_latent": ["398:349", 0],
      "audio_latent": ["398:367", 1]
    },
    "class_type": "LTXVConcatAVLatent",
    "_meta": {
      "title": "LTXVConcatAVLatent"
    }
  },
  "398:396": {
    "inputs": {
      "sigmas": "0.85, 0.7250, 0.4219, 0.0"
    },
    "class_type": "ManualSigmas",
    "_meta": {
      "title": "自定义Sigmas"
    }
  },
  "398:391": {
    "inputs": {
      "model": ["398:384", 0],
      "conditioning": ["398:365", 0]
    },
    "class_type": "BasicGuider",
    "_meta": {
      "title": "LTXV Dual CFG Guider"
    }
  },
  "398:341": {
    "inputs": {
      "sampler_name": "euler_ancestral"
    },
    "class_type": "KSamplerSelect",
    "_meta": {
      "title": "K采样器选择"
    }
  },
  "398:368": {
    "inputs": {
      "noise": ["398:338", 0],
      "guider": ["398:391", 0],
      "sampler": ["398:341", 0],
      "sigmas": ["398:396", 0],
      "latent_image": ["398:340", 0]
    },
    "class_type": "SamplerCustomAdvanced",
    "_meta": {
      "title": "自定义采样器（高级）"
    }
  },
  "398:369": {
    "inputs": {
      "av_latent": ["398:368", 0]
    },
    "class_type": "LTXVSeparateAVLatent",
    "_meta": {
      "title": "LTXV分离音视频潜空间"
    }
  },
  "398:374": {
    "inputs": {
      "tile_size": 512,
      "overlap": 64,
      "temporal_size": 64,
      "temporal_overlap": 16,
      "samples": ["398:369", 0],
      "vae": ["398:385", 0]
    },
    "class_type": "VAEDecodeTiled",
    "_meta": {
      "title": "VAE解码（分块）"
    }
  },
  "398:358": {
    "inputs": {
      "samples": ["398:369", 1],
      "audio_vae": ["398:386", 0]
    },
    "class_type": "LTXVAudioVAEDecode",
    "_meta": {
      "title": "LTXV音频VAE解码"
    }
  },
  "398:370": {
    "inputs": {
      "fps": ["398:359", 0],
      "bit_depth": 8,
      "images": ["398:374", 0],
      "audio": ["398:358", 0]
    },
    "class_type": "CreateVideo",
    "_meta": {
      "title": "创建视频"
    }
  }
};

// ============================================================
// 工具函数：视频转Base64
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
// 工具函数：保存Base64图片到临时文件
// ============================================================
const saveBase64ToTempFile = async (base64Data: string): Promise<string> => {
  // 这里假设 toonflow 环境提供了临时文件写入功能
  // 实际可能需要使用 fs 模块或 ComfyUI 的 API 上传
  // 由于 ComfyUI 的 LoadImage 需要读取本地文件，我们需要把图片保存到 ComfyUI 的 input 目录
  
  // 方案：通过 ComfyUI 的 /upload/image API 上传图片
  // 或者将 base64 保存到临时目录并返回文件名
  
  // 为了简化，这里返回一个占位符，实际需要根据 ComfyUI 环境实现
  // 如果 ComfyUI 支持 easy loadImageBase64，可以直接使用
  
  // 这里我们使用 ComfyUI 原生 LoadImage 需要文件存在
  // 所以需要将 base64 保存为文件，并返回文件名
  const timestamp = Date.now();
  const filename = `temp_${timestamp}.jpg`;
  
  // 注意：这里需要实际的 fs 写入操作，但 toonflow 环境可能不提供
  // 建议使用 ComfyUI 的 /upload/image 接口上传图片
  // 或者直接使用 easy loadImageBase64 节点
  
  return filename;
};

// ============================================================
// 适配器函数
// ============================================================
const textRequest = (model: TextModel) => { throw new Error("不支持文本生成"); };
const imageRequest = async (config: ImageConfig, model: ImageModel): Promise<string> => { return ""; };

const videoRequest = async (config: VideoConfig, model: VideoModel): Promise<string> => {
  const baseUrl = vendor.inputValues.baseUrl || "http://localhost:8188";
  
  if (!config.prompt) throw new Error("缺少视频生成提示词");
  if (!config.referenceList || config.referenceList.length === 0) throw new Error("缺少参考图片");

  // ---- 提取图片Base64 ----
  let rawBase64 = config.referenceList[0].base64;
  if (rawBase64.includes(',')) {
    rawBase64 = rawBase64.split(',')[1];
  }
  if (!rawBase64 || rawBase64.trim().length < 100) {
    throw new Error("图片 Base64 数据为空或格式错误，请检查图片是否损坏。");
  }

  // ---- 深拷贝工作流 ----
  const workflow = JSON.parse(JSON.stringify(WORKFLOW_JSON));

  // ---- 设置输入图片 ----
  // 方案1：使用 ComfyUI 的 /upload/image API 上传图片，然后使用 LoadImage
  // 方案2：使用 easy loadImageBase64 替换 LoadImage
  // 这里采用方案2：替换 395 节点为 easy loadImageBase64
  
  workflow["395"] = {
    inputs: {
      base64_data: rawBase64,
      image_output: "Preview",
      save_prefix: "ComfyUI"
    },
    class_type: "easy loadImageBase64",
    _meta: {
      title: "加载图像 (Base64)"
    }
  };

  // ---- 设置 Prompt ----
  workflow["398:376"]["inputs"]["value"] = config.prompt;

  // ---- 设置 Prompt 增强开关 ----
  workflow["398:383"]["inputs"]["value"] = true;

  // ---- 设置时长 ----
  const seconds = config.duration;
  workflow["398:362"]["inputs"]["value"] = seconds;
  logger(`时长：${seconds}秒`);

  // ---- 设置分辨率 ----
  let width = 1920, height = 1080;
  let aspectRatioStr = "16:9 (Widescreen)";
  let megapixels = 0.9;
  
  if (config.aspectRatio === "9:16") {
    aspectRatioStr = "9:16 (Vertical)";
  }
  
  // 根据分辨率设置
  if (config.resolution === "480p") {
    megapixels = 0.5;
    if (config.aspectRatio === "16:9") { width = 854; height = 480; }
    else { width = 480; height = 854; }
  } else if (config.resolution === "720p") {
    megapixels = 0.9;
    if (config.aspectRatio === "16:9") { width = 1280; height = 720; }
    else { width = 720; height = 1280; }
  } else if (config.resolution === "1080p") {
    megapixels = 2.1;
    if (config.aspectRatio === "16:9") { width = 1920; height = 1080; }
    else { width = 1080; height = 1920; }
  }
  
  workflow["403"]["inputs"]["aspect_ratio"] = aspectRatioStr;
  workflow["403"]["inputs"]["megapixels"] = megapixels;
  
  // 注意：由于工作流中 398:351 节点的 resize_type.longer_size 固定为 1536
  // 我们直接覆盖宽度和高度值
  workflow["398:372"]["inputs"]["value"] = width;
  workflow["398:360"]["inputs"]["value"] = height;
  
  // 调整图片缩放的长边尺寸（如果图片需要缩放）
  workflow["398:351"]["inputs"]["resize_type.longer_size"] = Math.max(width, height);
  
  logger(`尺寸：${config.aspectRatio} ${config.resolution} → ${width}x${height}`);

  // ---- 发送到 ComfyUI ----
  logger("发送到 ComfyUI...");

  try {
    // ---- 提交任务 ----
    const submitResp = await fetch(`${baseUrl}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: workflow }),
    });
    const submitData = await submitResp.json();
    const promptId = submitData.prompt_id;
    logger(`任务提交成功：${promptId}`);

    // ---- 轮询任务 ----
    const result = await pollTask(async () => {
      const historyResp = await fetch(`${baseUrl}/history`);
      const history = await historyResp.json();
      const run = history[promptId];
      if (!run) return { completed: false };
      if (run.status?.exec_info?.error) return { completed: true, error: run.status.exec_info.error };
      
      // 检查 75 节点输出（SaveVideo）
      const output = run.outputs["75"];
      if (output?.videos?.length > 0) {
        return { completed: true, data: output.videos[0] };
      }
      // 兼容 images 输出
      if (output?.images?.length > 0) {
        return { completed: true, data: output.images[0] };
      }
      return { completed: false };
    }, 3000, 600000);

    if (result.error) throw new Error(`失败：${result.error}`);
    if (!result.data) throw new Error("未找到视频输出");

    // ---- 下载视频 ----
    const fileInfo = result.data;
    const downloadUrl = `${baseUrl}/view?filename=${encodeURIComponent(fileInfo.filename)}&subfolder=${encodeURIComponent(fileInfo.subfolder || '')}&type=${fileInfo.type || 'output'}`;
    const videoBase64 = await videoToBase64(downloadUrl);
    return videoBase64;

  } catch (e: any) {
    logger(`错误：${e.message}`);
    throw new Error(`ComfyUI 视频生成失败: ${e.message}`);
  }
};

const ttsRequest = async (config: TTSConfig, model: TTSModel): Promise<string> => { return ""; };

const checkForUpdates = async () => ({
  hasUpdate: false,
  latestVersion: "5.0",
  notice: "适配 video_ltx2_5_i2v_api.json 工作流：支持 CreateVideo + SaveVideo 输出节点，Prompt增强，多分辨率输出"
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