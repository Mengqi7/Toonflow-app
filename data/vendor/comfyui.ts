/**
 * Toonflow AI 供应商模板 - ComfyUI 工作流（虚拟供应商）
 * @version 2.0
 *
 * 该供应商用于承载用户导入的 ComfyUI 工作流，实际执行由内置执行引擎完成
 * （engine === 'comfyui'），下面的适配函数仅为占位，不会被调用。
 */

type VideoMode =
  | "singleImage"
  | "startEndRequired"
  | "endFrameOptional"
  | "startFrameOptional"
  | "text"
  | string;

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
}

interface VideoModel {
  name: string;
  modelName: string;
  type: "video";
  mode: VideoMode[];
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

declare const exports: {
  vendor: VendorConfig;
  textRequest: (m: TextModel, t: boolean, tl: 0 | 1 | 2 | 3) => any;
  imageRequest: (c: any, m: ImageModel) => Promise<string>;
  videoRequest: (c: any, m: VideoModel) => Promise<string>;
  ttsRequest: (c: any, m: TTSModel) => Promise<string>;
};

const vendor: VendorConfig = {
  id: "comfyui",
  version: "2.0",
  author: "Toonflow",
  name: "ComfyUI 工作流",
  description: "导入 ComfyUI 工作流后自动生成模型，由内置执行引擎调用。",
  inputs: [],
  inputValues: {},
  models: [],
};

const textRequest = () => {
  throw new Error("ComfyUI 供应商仅支持图像/视频生成");
};

const imageRequest = async (): Promise<string> => {
  throw new Error("ComfyUI 工作流应由内置执行引擎调用，请勿直接调用该适配函数");
};

const videoRequest = async (): Promise<string> => {
  throw new Error("ComfyUI 工作流应由内置执行引擎调用，请勿直接调用该适配函数");
};

const ttsRequest = async (): Promise<string> => {
  throw new Error("ComfyUI 供应商不支持语音生成");
};

exports.vendor = vendor;
exports.textRequest = textRequest;
exports.imageRequest = imageRequest;
exports.videoRequest = videoRequest;
exports.ttsRequest = ttsRequest;

export {};