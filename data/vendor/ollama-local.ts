/**
 * Toonflow AI供应商模板 - Ollama Qwen3.8:27b 适配
 * @version 2.0
 */

// ============================================================
// 类型定义（沿用模板，不做修改）
// ============================================================

type VideoMode =
  | "singleImage"
  | "startEndRequired"
  | "endFrameOptional"
  | "startFrameOptional"
  | "text"
  | (`videoReference:${number}` | `imageReference:${number}` | `audioReference:${number}`)[];

interface TextModel {
  name: string;
  modelName: string;
  type: "text";
  think: boolean;
}

interface ImageModel {
  name: string;
  modelName: string;
  type: "image";
  mode: ("text" | "singleImage" | "multiReference")[];
  associationSkills?: string;
}

interface VideoModel {
  name: string;
  modelName: string;
  type: "video";
  mode: VideoMode[];
  associationSkills?: string;
  audio: "optional" | false | true;
  durationResolutionMap: { duration: number[]; resolution: string[] }[];
}

interface TTSModel {
  name: string;
  modelName: string;
  type: "tts";
  voices: { title: string; voice: string }[];
}

interface VendorConfig {
  id: string;
  version: string;
  name: string;
  author: string;
  description?: string;
  icon?: string;
  inputs: { key: string; label: string; type: "text" | "password" | "url"; required: boolean; placeholder?: string }[];
  inputValues: Record<string, string>;
  models: (TextModel | ImageModel | VideoModel | TTSModel)[];
}

type ReferenceList =
  | { type: "image"; sourceType: "base64"; base64: string }
  | { type: "audio"; sourceType: "base64"; base64: string }
  | { type: "video"; sourceType: "base64"; base64: string };

interface ImageConfig {
  prompt: string;
  referenceList?: Extract<ReferenceList, { type: "image" }>[];
  size: "1K" | "2K" | "4K";
  aspectRatio: `${number}:${number}`;
}

interface VideoConfig {
  duration: number;
  resolution: string;
  aspectRatio: "16:9" | "9:16";
  prompt: string;
  referenceList?: ReferenceList[];
  audio?: boolean;
  mode: VideoMode[];
}

interface TTSConfig {
  text: string;
  voice: string;
  speechRate: number;
  pitchRate: number;
  volume: number;
  referenceList?: Extract<ReferenceList, { type: "audio" }>[];
}

interface PollResult {
  completed: boolean;
  data?: string;
  error?: string;
}

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
  textRequest: (m: TextModel, t: boolean, tl: 0 | 1 | 2 | 3) => any;
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
  id: "ollama",
  version: "2.0",
  author: "Toonflow",
  name: "Ollama (Qwen3.8:27b)",
  description: "## 本地 Ollama 部署的 Qwen3.8:27b 文本模型\n- 使用 OpenAI 兼容 API\n- 默认地址：`http://localhost:11434/v1`\n- API Key 可任意填写（本地无需认证）",
  inputs: [
    {
      key: "baseUrl",
      label: "Ollama API 地址",
      type: "url",
      required: true,
      placeholder: "http://localhost:11434/v1"
    },
    {
      key: "apiKey",
      label: "API Key（本地可留空）",
      type: "password",
      required: false,
      placeholder: "留空或任意值"
    }
  ],
  inputValues: {
    baseUrl: "http://localhost:11434/v1",
    apiKey: ""
  },
  models: [
    {
      name: "Qwen3.8:27b",
      modelName: "qwen3.8:27b",
      type: "text",
      think: false
    }
  ]
};

// ============================================================
// 适配器函数
// ============================================================

/**
 * 文本请求适配 - 使用 createOpenAI（标准 OpenAI 包装）
 */
const textRequest = (model: TextModel, think: boolean, thinkLevel: 0 | 1 | 2 | 3) => {
  const baseUrl = vendor.inputValues.baseUrl || "http://localhost:11434/v1";
  const apiKey = vendor.inputValues.apiKey || "ollama-local";

  logger(`[Ollama] 初始化文本模型: ${model.modelName}, baseUrl: ${baseUrl}`);

  // 直接使用 createOpenAI，因为 Ollama 完全兼容 OpenAI API
  return createOpenAI({
    baseURL: baseUrl,
    apiKey: apiKey
  }).chat(model.modelName);
};

/**
 * 图像请求 - 当前未实现
 */
const imageRequest = async (config: ImageConfig, model: ImageModel): Promise<string> => {
  logger("[Ollama] imageRequest 暂未实现");
  return "";
};

/**
 * 视频请求 - 当前未实现
 */
const videoRequest = async (config: VideoConfig, model: VideoModel): Promise<string> => {
  logger("[Ollama] videoRequest 暂未实现");
  return "";
};

/**
 * TTS 请求 - 当前未实现
 */
const ttsRequest = async (config: TTSConfig, model: TTSModel): Promise<string> => {
  logger("[Ollama] ttsRequest 暂未实现");
  return "";
};

/**
 * 检查更新 - 保持默认
 */
const checkForUpdates = async (): Promise<{ hasUpdate: boolean; latestVersion: string; notice: string }> => {
  return { hasUpdate: false, latestVersion: "2.0", notice: "## 当前为最新版本" };
};

/**
 * 更新供应商 - 保持默认
 */
const updateVendor = async (): Promise<string> => {
  return "";
};

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

// 这行代码用于确保当前文件被识别为模块，避免全局变量冲突
export {};