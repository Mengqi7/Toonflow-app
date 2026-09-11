/**
 * Toonflow AI供应商模板 - MiniMax H3-R2V 多参考图生视频适配器
 * @version 6.4-fixed-res-safe
 * @关联Skill文档: toonflow视频提示词生成Skill（完整版-适配MinimaxH3双模式）
 * Skill输出两种格式:
 *   1. minimax_base(T2VA/I2VA/FL2VA/L2VA): 直接透传
 *   2. minimax_fullref(全参考六段式): 适配器自动提取指令头+detailed_description+overall_soundscape+non_diegetic_music
 * 模式：videoReference/audioReference；业务层限制：最多9张参考图像、3个参考视频、3个独立参考音频；
 * ⚠️当前原始ComfyUI MiniMaxH3ReferenceToVideo节点仅支持2张ref_image输入；适配器取前2张，超出输出警告日志
 * ⚠️分辨率严格对齐MiniMax-H3 ComfyUI ResolutionSelector multiple=32官方输出表；最大0.98mp(768p)
 * ⚠️已清除U+2029(8209)特殊不可见字符，修复ByteString转换报错
 */
// ============================================================
// 常量：参考资源数量上限（业务层运行时截断）
// ============================================================
const MAX_REFERENCE_IMAGE = 9;
const MAX_REFERENCE_VIDEO = 3;
const MAX_REFERENCE_AUDIO = 3;

// ============================================================
// 类型定义
// ============================================================
type VideoMode =
  | "singleImage"
  | "startEndRequired"
  | "endFrameOptional"
  | "startFrameOptional"
  | "text"
  | "audioReference"
  | "videoReference";

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
interface VideoConfig {
  duration: number; resolution: string; aspectRatio: "16:9" | "9:16";
  prompt: string;
  referenceList?: ReferenceList[];
  audio?: boolean;
  mode: VideoMode[];
}

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
// 【辅助工具】解析Full-Ref六段式，提取模型可用prompt
// ============================================================
function extractUsablePromptFromFullRef(fullRefText: string): string {
  if (!fullRefText.trim().startsWith("subject_definitions:")) {
    return fullRefText;
  }
  const lines = fullRefText.split('\n');
  let inSubject = false;
  let inSummary = false;
  let inRetention = false;
  let collectBuffer: string[] = [];
  let hitDetailed = false;
  let hitOverall = false;
  let hitNonDiegetic = false;

  for (const line of lines) {
    const t = line.trimStart();
    if (t.startsWith("subject_definitions:")) { inSubject = true; continue; }
    if (inSubject && (t.startsWith("summary:") || t.startsWith("summary："))) { inSubject = false; inSummary = true; continue; }
    if (inSummary && (t.startsWith("retention_analysis:") || t.startsWith("retention_analysis："))) { inSummary = false; inRetention = true; continue; }
    if (inRetention && (t.startsWith("detailed_description:") || t.startsWith("detailed_description："))) {
      inRetention = false;
      hitDetailed = true;
      collectBuffer.push(line);
      continue;
    }
    if (hitDetailed && (t.startsWith("overall_soundscape:") || t.startsWith("overall_soundscape："))) {
      hitDetailed = false;
      hitOverall = true;
      collectBuffer.push(line);
      continue;
    }
    if (hitOverall && (t.startsWith("non_diegetic_music:") || t.startsWith("non_diegetic_music："))) {
      hitOverall = false;
      hitNonDiegetic = true;
      collectBuffer.push(line);
      continue;
    }
    if (inSubject || inSummary || inRetention) continue;
    collectBuffer.push(line);
  }
  const result = collectBuffer.join('\n').trim();
  logger("detect minimax_fullref input, extracted usable prompt for MiniMax-R2V node");
  return result;
}

// ============================================================
// 【辅助工具】参考资源数量校验与截断
// ============================================================
function filterReferenceList(refList: ReferenceList[]): {
  images: ReferenceList[],
  videos: ReferenceList[],
  audios: ReferenceList[]
} {
  const images = refList.filter(i => i.type === "image");
  const videos = refList.filter(i => i.type === "video");
  const audios = refList.filter(i => i.type === "audio");

  if (images.length > MAX_REFERENCE_IMAGE) {
    logger(`⚠️参考图像数量${images.length}超过上限${MAX_REFERENCE_IMAGE}，已截断取前${MAX_REFERENCE_IMAGE}张`);
  }
  if (videos.length > MAX_REFERENCE_VIDEO) {
    logger(`⚠️参考视频数量${videos.length}超过上限${MAX_REFERENCE_VIDEO}，已截断取前${MAX_REFERENCE_VIDEO}个`);
  }
  if (audios.length > MAX_REFERENCE_AUDIO) {
    logger(`⚠️参考音频数量${audios.length}超过上限${MAX_REFERENCE_AUDIO}，已截断取前${MAX_REFERENCE_AUDIO}个`);
  }

  return {
    images: images.slice(0, MAX_REFERENCE_IMAGE),
    videos: videos.slice(0, MAX_REFERENCE_VIDEO),
    audios: audios.slice(0, MAX_REFERENCE_AUDIO)
  };
}

// ============================================================
// H3帧数计算：max(5, round(a*24)) + (5-(max(5, round(a*24))%17))%17
// ============================================================
const calculateH3FrameCount = (seconds: number): number => {
  const rawFrames = Math.round(seconds * 24);
  const base = Math.max(5, rawFrames);
  const remainder = base % 17;
  const adjustment = (5 - remainder) % 17;
  return base + adjustment;
};

// ============================================================
// MiniMax-H3 官方ResolutionSelector multiple=32输出表
// ============================================================
const RESOLUTION_MAP: Record<string, Record<"16:9" | "9:16", { megapixels: number; width: number; height: number }>> = {
  "480p":  { "16:9": { megapixels:0.40, width:864, height:480 },  "9:16": { megapixels:0.40, width:480, height:864 } },
  "544p":  { "16:9": { megapixels:0.50, width:960, height:544 },  "9:16": { megapixels:0.50, width:544, height:960 } },
  "608p":  { "16:9": { megapixels:0.60, width:1056,height:608 },  "9:16": { megapixels:0.60, width:608, height:1056 } },
  "640p":  { "16:9": { megapixels:0.70, width:1152,height:640 },  "9:16": { megapixels:0.70, width:640, height:1152 } },
  "672p":  { "16:9": { megapixels:0.80, width:1216,height:672 },  "9:16": { megapixels:0.80, width:672, height:1216 } },
  "736p":  { "16:9": { megapixels:0.90, width:1280,height:736 },  "9:16": { megapixels:0.90, width:736, height:1280 } },
  "768p":  { "16:9": { megapixels:0.98, width:1344,height:768 },  "9:16": { megapixels:0.98, width:768, height:1344 } }
};
const DEFAULT_RESOLUTION = "768p";

const parseResolution = (resolution: string, aspectRatio: "16:9" | "9:16") => {
  const key = resolution.toLowerCase();
  if(RESOLUTION_MAP[key] && RESOLUTION_MAP[key][aspectRatio]){
    return RESOLUTION_MAP[key][aspectRatio];
  }
  logger(`[warn] 非法分辨率key ${resolution}, fallback到默认 ${DEFAULT_RESOLUTION}`);
  return RESOLUTION_MAP[DEFAULT_RESOLUTION][aspectRatio];
};

// ============================================================
// 原始ComfyUI工作流JSON：video_minimax_h3_r2v.json
// ============================================================
const WORKFLOW_JSON = {
  "92": {
    "inputs": {
      "filename_prefix": "video/MiniMax_H3",
      "format": "auto",
      "codec": "auto",
      "video-preview": "",
      "video": [
        "130",
        0
      ]
    },
    "class_type": "SaveVideo",
    "_meta": {
      "title": "保存视频"
    }
  },
  "115": {
    "inputs": {
      "aspect_ratio": "16:9 (Widescreen)",
      "megapixels": 0.4,
      "multiple": 32
    },
    "class_type": "ResolutionSelector",
    "_meta": {
      "title": "Resolution Selector (Size)"
    }
  },
  "119": {
    "inputs": {
      "vae_name": "Minimax-h3\\minimax_h3_video_vae_fp16.safetensors"
    },
    "class_type": "VAELoader",
    "_meta": {
      "title": "加载VAE"
    }
  },
  "120": {
    "inputs": {
      "vae_name": "Minimax-h3\\minimax_h3_audio_vae_fp32.safetensors"
    },
    "class_type": "VAELoader",
    "_meta": {
      "title": "加载VAE"
    }
  },
  "121": {
    "inputs": {
      "samples": [
        "125",
        0
      ],
      "vae": [
        "120",
        0
      ]
    },
    "class_type": "VAEDecodeAudio",
    "_meta": {
      "title": "VAE解码（音频）"
    }
  },
  "122": {
    "inputs": {
      "samples": [
        "125",
        0
      ],
      "vae": [
        "119",
        0
      ]
    },
    "class_type": "VAEDecode",
    "_meta": {
      "title": "VAE解码"
    }
  },
  "123": {
    "inputs": {
      "sampler_name": "res_multistep"
    },
    "class_type": "KSamplerSelect",
    "_meta": {
      "title": "K采样器选择"
    }
  },
  "124": {
    "inputs": {
      "scheduler": "simple",
      "steps": [
        "142",
        0
      ],
      "denoise": 1,
      "model": [
        "127",
        0
      ]
    },
    "class_type": "BasicScheduler",
    "_meta": {
      "title": "基本调度器"
    }
  },
  "125": {
    "inputs": {
      "noise": [
        "129",
        0
      ],
      "guider": [
        "126",
        0
      ],
      "sampler": [
        "123",
        0
      ],
      "sigmas": [
        "124",
        0
      ],
      "latent_image": [
        "136",
        1
      ]
    },
    "class_type": "SamplerCustomAdvanced",
    "_meta": {
      "title": "自定义采样器（高级）"
    }
  },
  "126": {
    "inputs": {
      "model": [
        "141",
        0
      ],
      "conditioning": [
        "136",
        0
      ]
    },
    "class_type": "BasicGuider",
    "_meta": {
      "title": "基本引导器"
    }
  },
  "127": {
    "inputs": {
      "unet_name": "Minimax-h3\\minimax_h3_ref2va_int8_convrot.safetensors",
      "weight_dtype": "default"
    },
    "class_type": "UNETLoader",
    "_meta": {
      "title": "UNet加载器"
    }
  },
  "128": {
    "inputs": {
      "clip_name": "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
      "type": "minimax",
      "device": "default"
    },
    "class_type": "CLIPLoader",
    "_meta": {
      "title": "加载CLIP"
    }
  },
  "129": {
    "inputs": {
      "noise_seed": 261662374822964
    },
    "class_type": "RandomNoise",
    "_meta": {
      "title": "随机噪波"
    }
  },
  "130": {
    "inputs": {
      "fps": 24,
      "bit_depth": 8,
      "images": [
        "122",
        0
      ],
      "audio": [
        "121",
        0
      ]
    },
    "class_type": "CreateVideo",
    "_meta": {
      "title": "创建视频"
    }
  },
  "131": {
    "inputs": {
      "expression": "max(5, round(a * 24)) + (5 - (max(5, round(a * 24)) % 17)) % 17",
      "values.a": [
        "132",
        0
      ]
    },
    "class_type": "ComfyMathExpression",
    "_meta": {
      "title": "数学表达式"
    }
  },
  "132": {
    "inputs": {
      "value": 5
    },
    "class_type": "PrimitiveFloat",
    "_meta": {
      "title": "Float (Duration)"
    }
  },
  "136": {
    "inputs": {
      "prompt": [
        "138",
        0
      ],
      "width": [
        "115",
        0
      ],
      "height": [
        "115",
        1
      ],
      "length": [
        "131",
        1
      ],
      "ref_image_size": "match",
      "clip": [
        "128",
        0
      ],
      "vae": [
        "119",
        0
      ],
      "audio_vae": [
        "120",
        0
      ],
      "ref_images.ref_image_0": [
        "137",
        0
      ],
      "ref_images.ref_image_1": [
        "139",
        0
      ]
    },
    "class_type": "MiniMaxH3ReferenceToVideo",
    "_meta": {
      "title": "MiniMax H3 Reference to Video"
    }
  },
  "137": {
    "inputs": {
      "image": "red_superboy_on_city_roof.png"
    },
    "class_type": "LoadImage",
    "_meta": {
      "title": "加载图像"
    }
  },
  "138": {
    "inputs": {
      "value": "Bold comic-book ink style, heavy linework, red and blue-black palette, night city. Use <Picture 2> and <Picture 1> as reference frames and <Audio 1> exactly as it is.\nCUT 1: top-down view of the little boy superhero on the rooftop — red cape fluttering in the wind, hands planted on his hips, freckles and a cocky grin as he looks straight up into the camera. The camera slowly descends toward him as he delivers his line — as he speaks, comic-book graphic overlay text word by word in sync with his voice: \"GET READY TO\" - \"MEET\" — \"YOUR\" — \"MAKER\" — huge jagged comic lettering, white with heavy black outlines and red drop shadows, tilted at scrappy angles, until the three words hang stacked in the air above him between his face and the lens.\nTRANSITION: a violent WHIP PAN off the rooftop that SMEARS the floating words away with it, motion-streaked —\nCUT 2: low hero angle on the colossal black mech-kaiju towering over the skyline as it rears back and unleashes a GIANT terrifying ROAR — jaws wide with fangs, red eyes and chest-core flaring blinding bright, blue lightning arcing off its head, the roar's shockwave rippling dust and rattling windows down the buildings, comic-style speed-lines and ink splatter bursting from the impact of the sound. It leans INTO the camera as the roar peaks. Hold on the roar."
    },
    "class_type": "PrimitiveStringMultiline",
    "_meta": {
      "title": "Input Text (Prompt)"
    }
  },
  "139": {
    "inputs": {
      "image": "mecha_dragon_lightning.png"
    },
    "class_type": "LoadImage",
    "_meta": {
      "title": "加载图像"
    }
  },
  "141": {
    "inputs": {
      "switch": [
        "146",
        0
      ],
      "on_false": [
        "127",
        0
      ],
      "on_true": [
        "145",
        0
      ]
    },
    "class_type": "ComfySwitchNode",
    "_meta": {
      "title": "If/Else Switch (model)"
    }
  },
  "142": {
    "inputs": {
      "switch": [
        "146",
        0
      ],
      "on_false": [
        "143",
        0
      ],
      "on_true": [
        "144",
        0
      ]
    },
    "class_type": "ComfySwitchNode",
    "_meta": {
      "title": "If/Else Switch (Steps)"
    }
  },
  "143": {
    "inputs": {
      "value": 20
    },
    "class_type": "PrimitiveInt",
    "_meta": {
      "title": "Int (Full)"
    }
  },
  "144": {
    "inputs": {
      "value": 4
    },
    "class_type": "PrimitiveInt",
    "_meta": {
      "title": "Int (Lightning LoRA)"
    }
  },
  "145": {
    "inputs": {
      "lora_name": "minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors",
      "strength_model": 1,
      "model": [
        "127",
        0
      ]
    },
    "class_type": "LoraLoaderModelOnly",
    "_meta": {
      "title": "LoRA加载器（仅模型）"
    }
  },
  "146": {
    "inputs": {
      "value": false
    },
    "class_type": "PrimitiveBoolean",
    "_meta": {
      "title": "Boolean (Enable Lightning LoRA)"
    }
  }
};

// ============================================================
// 供应商配置
// ============================================================
const vendor: VendorConfig = {
  id: "comfyui_local_minimax_h3_r2v",
  version: "6.4-fixed-res-safe",
  name: "Local ComfyUI MiniMax H3-R2V",
  author: "Toonflow",
  description: `## MiniMax H3-R2V多参考图生视频适配器 v6.4-fixed-res-safe
关联Skill: toonflow视频提示词生成Skill（完整版-适配MinimaxH3双模式）
适配工作流：video_minimax_h3_r2v.json
- 🖼️videoReference/audioReference多参考模式；业务层限制：最多9张参考图像、3个参考视频、3个独立参考音频
- ⚠️ComfyUI原始节点仅支持最多2张ref_image输入，超过会被适配器截断取前2张
- 🔊原生立体声音频生成
- 🎬严格对齐ComfyUI ResolutionSelector multiple=32官方输出；最大0.98mp(768p)，24fps
- ⚡Ref2V-Turbo LoRA加速开关
- 🧮帧数自动对齐17*N+5

**模型放置路径 ComfyUI/models/**:
- \`diffusion_models/minimax_h3_ref2va_int8_convrot.safetensors\`
- \`text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors\`
- \`vae/minimax_h3_video_vae_fp16.safetensors\`
- \`vae/minimax_h3_audio_vae_fp32.safetensors\`
- \`loras/minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors\`

**H3官方合规分辨率(multiple=32对齐)**:
| 分辨率 | megapixels | 16:9 尺寸 | 9:16 尺寸 |
|--------|------------|-----------|-----------|
| 480p | 0.4 | 864x480 | 480x864 |
| 544p | 0.5 | 960x544 | 544x960 |
| 608p | 0.6 | 1056x608 | 608x1056 |
| 640p | 0.7 | 1152x640 | 640x1152 |
| 672p | 0.8 | 1216x672 | 672x1216 |
| 736p | 0.9 | 1280x736 | 736x1280 |
| 768p | 0.98 | 1344x768 | 768x1344 |

**时长范围**:3-15秒
`,
  inputs: [
    { key: "baseUrl", label: "ComfyUI 地址", type: "text", required: true, placeholder: "http://localhost:8188" },
  ],
  inputValues: { baseUrl: "http://localhost:8188" },
  models: [{
    name: "MiniMax H3-R2V (多参考生视频)",
    modelName: "minimax-h3-r2v-fast",
    type: "video",
    mode: ["videoReference","audioReference"],
    audio: true,
    durationResolutionMap: [
      { duration: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], resolution: ["480p", "544p", "608p", "640p", "672p", "736p", "768p"] }
    ],
    associationSkills: "关联Skill：toonflow视频提示词生成Skill（完整版-适配MinimaxH3双模式）；支持minimax_base、minimax_fullref自动解析；业务层上限9张图、3视频、3音频；ComfyUI原始节点仅支持2张参考图；原生音频生成；分辨率严格遵循H3 multiple=32输出规则，最高768p。"
  }],
};

// ============================================================
// 视频转Base64
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
// 适配器存根
// ============================================================
const textRequest = (model: TextModel) => { throw new Error("不支持文本生成"); };
const imageRequest = async (config: ImageConfig, model: ImageModel): Promise<string> => { return ""; };

// ============================================================
// 核心视频生成请求 R2V
// ============================================================
const videoRequest = async (config: VideoConfig, _model: VideoModel): Promise<string> => {
  const baseUrl = vendor.inputValues.baseUrl || "http://localhost:8188";
  if (!config.prompt) throw new Error("缺少视频生成提示词");
  if (!config.referenceList || config.referenceList.length === 0) throw new Error("R2V模式至少需要传入一个参考资源");

  // 解析full-ref六段式
  const usablePrompt = extractUsablePromptFromFullRef(config.prompt);
  // 业务层资源数量过滤截断
  const { images, videos, audios } = filterReferenceList(config.referenceList);
  logger(`资源过滤完成：参考图像${images.length}张，参考视频${videos.length}个，参考音频${audios.length}个`);

  // 当前原始工作流节点仅支持 ref_image_0 / ref_image_1，取前2张图片
  const useImages = images.slice(0,2);
  if(images.length>2){
    logger("⚠️警告：输入参考图片大于2张，ComfyUI原始MiniMaxH3ReferenceToVideo节点仅支持2张输入，只取前2张送入节点");
  }
  if(useImages.length===0){
    throw new Error("R2V模式至少需要一张参考图片");
  }

  // 处理第0张参考图 ref_image_0
  let img0Base64 = useImages[0].base64;
  if(img0Base64.includes(',')) img0Base64 = img0Base64.split(',')[1];
  if(!img0Base64 || img0Base64.trim().length<100) throw new Error("ref_image_0图片base64数据异常");

  // 处理第1张参考图 ref_image_1
  let img1Base64:string|null = null;
  if(useImages.length>=2){
    img1Base64 = useImages[1].base64;
    if(img1Base64.includes(',')) img1Base64 = img1Base64.split(',')[1];
  }

  // 深拷贝工作流
  const workflow = JSON.parse(JSON.stringify(WORKFLOW_JSON));

  // 替换节点137(ref_image_0)为base64加载
  workflow["137"] = {
    inputs: {
      base64_data: img0Base64,
      image_output: "Preview",
      save_prefix: "ComfyUI_ref0"
    },
    class_type: "easy loadImageBase64",
    _meta: { title: "加载图像(Base64)" }
  };

  // 处理第二张参考图
  if(img1Base64){
    workflow["139"] = {
      inputs: {
        base64_data: img1Base64,
        image_output: "Preview",
        save_prefix: "ComfyUI_ref1"
      },
      class_type: "easy loadImageBase64",
      _meta: { title: "加载图像(Base64)" }
    };
    logger("R2V：已注入2张参考图片");
  }else{
    // 无第二张图，删除链路与节点
    delete workflow["139"];
    delete workflow["136"]["inputs"]["ref_images.ref_image_1"];
    logger("R2V：仅注入1张参考图片");
  }

  // 设置prompt文本
  workflow["138"]["inputs"]["value"] = usablePrompt;
  // 设置时长
  workflow["132"]["inputs"]["value"] = config.duration;

  // 设置分辨率&画幅
  const resInfo = parseResolution(config.resolution, config.aspectRatio);
  let arLabel:string;
  if(config.aspectRatio === "16:9") arLabel = "16:9 (Widescreen)";
  else if(config.aspectRatio === "9:16") arLabel = "9:16 (Portrait)";
  else arLabel = "1:1 (Square)";
  workflow["115"]["inputs"]["aspect_ratio"] = arLabel;
  workflow["115"]["inputs"]["megapixels"] = resInfo.megapixels;

  // 随机种子
  workflow["129"]["inputs"]["noise_seed"] = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);

  const frameCount = calculateH3FrameCount(config.duration);
  logger(`时长:${config.duration}s → 对齐帧数:${frameCount} (17k+5)`);
  logger(`分辨率:${config.resolution} → ${resInfo.width}x${resInfo.height}, megapixels:${resInfo.megapixels}, aspect:${config.aspectRatio}`);
  logger(`送入MiniMaxH3ReferenceToVideo节点 prompt:\n${usablePrompt}`);

  // 音频开关
  if(config.audio === false){
    workflow["130"]["inputs"]["audio"] = null;
    logger("音频已禁用");
  }

  // 提交ComfyUI任务
  logger("提交R2V任务到ComfyUI...");
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
  logger(`任务提交成功 prompt_id:${promptId}`);

  // 轮询结果
  const result = await pollTask(async () => {
    const historyResp = await fetch(`${baseUrl}/history`);
    const history = await historyResp.json();
    const run = history[promptId];
    if (!run) return { completed: false };
    if (run.status?.exec_info?.error) {
      const errorMsg = typeof run.status.exec_info.error === "string" ? run.status.exec_info.error : JSON.stringify(run.status.exec_info.error);
      return { completed: true, error: errorMsg };
    }
    const output = run.outputs?.["92"];
    if(output?.videos && output.videos.length>0){
      return { completed:true, data:output.videos[0] };
    }
    if(output?.images && output.images.length>0){
      return { completed:true, data:output.images[0] };
    }
    return { completed:false };
  }, 3000, 600000);

  if(result.error) throw new Error(`生成失败:${result.error}`);
  if(!result.data) throw new Error("未获取输出视频文件");

  const fileInfo = result.data;
  const downloadUrl = `${baseUrl}/view?filename=${encodeURIComponent(fileInfo.filename)}&subfolder=${encodeURIComponent(fileInfo.subfolder||'')}&type=${fileInfo.type||'output'}`;
  return await videoToBase64(downloadUrl);
};

const ttsRequest = async (_config: TTSConfig, _model: TTSConfig): Promise<string> => { return ""; };

const checkForUpdates = async () => ({
  hasUpdate: false,
  latestVersion: "6.4-fixed-res-safe",
  notice: `✅ MiniMax H3-R2V Toonflow适配器 v6.4-fixed-res-safe
🔗关联Skill：toonflow视频提示词生成Skill（完整版-适配MinimaxH3双模式）
⚡特性：
- videoReference/audioReference模式，适配video_minimax_h3_r2v.json工作流
- ✅分辨率严格对齐MiniMax-H3 ComfyUI multiple=32官方输出表；档位480p~768p
- 业务层上限：9张参考图像、3参考视频、3参考音频；⚠️原始节点仅支持2张参考图
- 兼容minimax_base；自动解析minimax_fullref六段式提取有效prompt
- 原生音频生成；帧数自动对齐17*N+5
- Ref2V-Turbo LoRA开关；full模式20步 / turbo模式4步
💡提示：
  测试建议480-608p；正式输出736-768p；H3-Base最大0.98mp(768p)。
`
});

const updateVendor = async () => { return ""; };

// ============================================================
// 模块导出
// ============================================================
exports.vendor = vendor;
exports.textRequest = textRequest;
exports.imageRequest = imageRequest;
exports.videoRequest = videoRequest;
exports.ttsRequest = ttsRequest;
exports.checkForUpdates = checkForUpdates;
exports.updateVendor = updateVendor;

export { };