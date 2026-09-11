/**
 * 生成 MiniMax-H3 Ref2VA 高质量视频工厂工作流（UI 格式）
 * 基于：官方 H3 核心节点 + 业界 deno r2v 示例 + 大炮加速链
 * 能力：多图参考(2) + 视频参考(1) + 视频音轨参考(1) + 独立音频参考(1) + Sage/显存/TE 加速
 */
import fs from "fs";

let lastLinkId = 0;
const links: any[] = [];
const link = (fromNode: number, fromSlot: number, toNode: number, toSlot: number, type: string) => {
  const id = ++lastLinkId;
  links.push([id, fromNode, fromSlot, toNode, toSlot, type]);
  return id;
};

// 便捷构建节点
function node(id: number, type: string, inputs: any[], outputs: any[], widgets_values: any[], title = "") {
  return { id, type, inputs, outputs, widgets_values, title, properties: { "Node name for S&R": type }, flags: {} };
}
const inp = (name: string, type: string, linkId: number | null, widget = false) => ({ name, type, link: linkId, widget });
const out = (name: string, type: string, links: number[] = []) => ({ name, type, links, slot_index: 0 });

// ============ 1. 模型加载 ============
// 注意：必须使用完整（非 pruned）模型——pruned 版 adaln 低秩化(2688→8)导致音频 400Hz 伪影
// 完整模型: minimax_h3_ref2va_int8_convrot.safetensors (34GB, adaln 完整 2688 维)
const UNET = 1, CLIP = 2, VAE_V = 3, VAE_A = 4;
const UNET_NAME = process.argv.includes("--pruned")
  ? "Minimax-h3\\minimax_h3_ref2va_pruned_int8_convrot.safetensors"
  : "Minimax-h3\\minimax_h3_ref2va_int8_convrot.safetensors";
const CLIP_NAME = process.argv.find((a) => a.startsWith("--clip="))?.split("=")[1] || "qwen3vl_32b_minimax_h3_int8_convrot.safetensors";
const N_UNET = node(UNET, "UNETLoader", [inp("unet_name", "COMBO", null, true), inp("weight_dtype", "COMBO", null, true)], [out("MODEL", "MODEL")], [UNET_NAME, "default"], "H3 Ref2VA 模型（完整版）");
const N_CLIP = node(CLIP, "CLIPLoader", [inp("clip_name", "COMBO", null, true), inp("type", "COMBO", null, true), inp("device", "COMBO", null, true)], [out("CLIP", "CLIP")], [CLIP_NAME, "minimax", "default"], "H3 CLIP (Qwen3-VL)");
const N_VAEV = node(VAE_V, "VAELoader", [inp("vae_name", "COMBO", null, true)], [out("VAE", "VAE")], ["Minimax-h3\\minimax_h3_video_vae_fp16.safetensors"], "视频 VAE");
const N_VAEA = node(VAE_A, "VAELoader", [inp("vae_name", "COMBO", null, true)], [out("VAE", "VAE")], ["Minimax-h3\\minimax_h3_audio_vae_fp32.safetensors"], "音频 VAE");

// ============ 2. 加速链：SageAttention → 显存优化 → TE-Speed ============
const SAGE = 5, MEM = 6, TE = 7;
const NO_TE = process.argv.includes("--no-te-speed");
const DURATION = Number(process.argv.find((a) => a.startsWith("--duration="))?.split("=")[1] || 10);

const N_SAGE = node(SAGE, "PathchSageAttentionKJ", [inp("model", "MODEL", link(UNET, 0, SAGE, 0, "MODEL")), inp("sage_attention", "COMBO", null, true)], [out("MODEL", "MODEL")], ["auto"], "SageAttention 加速");
const N_MEM = node(MEM, "MiniMaxH3MemoryEfficientSageAttentionPatch", [inp("model", "MODEL", link(SAGE, 0, MEM, 0, "MODEL"))], [out("model", "MODEL")], [], "显存优化补丁");
// TE-Speed 残差缓存会冻结音频流（独立 shift 调度），音频出现 400Hz 谐波伪影
// 默认禁用 TE-Speed；--with-te-speed 显式启用用于对照
const WITH_TE = process.argv.includes("--with-te-speed");
const MODEL_FEED = WITH_TE ? TE : MEM;
const N_TE = node(TE, "TESpeedMiniMaxH3", [inp("model", "MODEL", link(MEM, 0, TE, 0, "MODEL"))], [out("MODEL", "MODEL")], [0.12, 0.1, 0.9, 2, "auto"], "TE-Speed 加速");

// ============ 3. 参考输入 ============
// --no-audio-ref: 去掉视频/音频参考（仅图片参考）——判别音频伪影是否来自音频参考注入
const NO_AUDIO_REF = process.argv.includes("--no-audio-ref");
const IMG1 = 8, IMG2 = 9, VID1 = 10, AUD1 = 11, AUD2 = 12;
const N_IMG1 = node(IMG1, "LoadImage", [inp("image", "COMBO", null, true)], [out("IMAGE", "IMAGE"), out("MASK", "MASK")], ["001 (1).png"], "参考图 1 (人物)");
const N_IMG2 = node(IMG2, "LoadImage", [inp("image", "COMBO", null, true)], [out("IMAGE", "IMAGE"), out("MASK", "MASK")], ["001 (2).png"], "参考图 2 (环境/道具)");
const N_VID1 = node(VID1, "VHS_LoadVideo", [
  inp("video", "COMBO", null, true), inp("force_rate", "FLOAT", null, true), inp("custom_width", "INT", null, true),
  inp("custom_height", "INT", null, true), inp("frame_load_cap", "INT", null, true), inp("skip_first_frames", "INT", null, true),
  inp("select_every_nth", "INT", null, true),
], [out("IMAGE", "IMAGE"), out("frame_count", "INT"), out("audio", "AUDIO"), out("video_info", "VHS_VIDEOINFO")],
  ["分镜2.mp4", 24, 0, 0, 0, 0, 1], "参考视频 1 (运镜/节奏)");
const N_AUD1 = node(AUD1, "VHS_LoadAudioUpload", [inp("audio", "COMBO", null, true), inp("start_time", "FLOAT", null, true), inp("duration", "FLOAT", null, true)], [out("audio", "AUDIO")], ["分镜2.mp4", 0, 10], "参考视频 1 音轨");
const N_AUD2 = node(AUD2, "VHS_LoadAudioUpload", [inp("audio", "COMBO", null, true), inp("start_time", "FLOAT", null, true), inp("duration", "FLOAT", null, true)], [out("audio", "AUDIO")], ["VX-paolaoshiAICG__00007_.flac", 0, 10], "独立音频参考 (音色/BGM)");

// ============ 4. 尺寸与时长 ============
const RES = 13, MATH = 14, PFLOAT = 15;
const MP = Number(process.argv.find((a) => a.startsWith("--mp="))?.split("=")[1] || 0.4);
const STEPS = Number(process.argv.find((a) => a.startsWith("--steps="))?.split("=")[1] || 25);
const RATIO = process.argv.find((a) => a.startsWith("--ratio="))?.split("=")[1] || "9:16 (Portrait Widescreen)";
const N_RES = node(RES, "ResolutionSelector", [inp("aspect_ratio", "COMBO", null, true), inp("megapixels", "FLOAT", null, true), inp("multiple", "INT", null, true)], [out("width", "INT"), out("height", "INT")], [RATIO, MP, 32], `分辨率 ${MP}MP`);
const N_PF = node(PFLOAT, "PrimitiveFloat", [inp("value", "FLOAT", null, true)], [out("FLOAT", "FLOAT"), out("INT", "INT"), out("BOOL", "BOOLEAN")], [DURATION], "时长(秒)");
const N_MATH = node(MATH, "ComfyMathExpression", [
  inp("values.a", "FLOAT,INT,BOOLEAN", link(PFLOAT, 0, MATH, 0, "FLOAT")),
  inp("values.b", "FLOAT,INT,BOOLEAN", null),
  inp("expression", "STRING", null, true),
], [out("FLOAT", "FLOAT"), out("INT", "INT"), out("BOOL", "BOOLEAN")],
  ["max(5, round(a * 24)) + (5 - (max(5, round(a * 24)) % 17)) % 17"], "帧数对齐 (17k+5)");

// ============ 5. 提示词 ============
const CR_TEXT = 16;
const DEFAULT_PROMPT = `subject_definitions:
<Subject 1> is the woman shown in <Picture 1> and <Picture 2>, preserving her facial identity, hairstyle, skin tone, clothing, body proportions, and all visual details across the entire video.
<Video 1> is the reference video providing camera movement, shot rhythm, and temporal structure for the target video.
<Audio 1> is the reference audio providing the voice timbre, music style, and acoustic atmosphere for the target video soundtrack.

summary:
[reference generation] The target video follows <Subject 1> through a continuous, cinematic underwater fantasy sequence that adopts the camera language and pacing of <Video 1> and the acoustic character of <Audio 1>.

retention_analysis:
<Subject 1> (appears in [Shot 1], [Shot 2], [Shot 3]): fully_preserved - her facial identity, hairstyle, clothing, and body proportions remain stable throughout.
<Video 1> (camera and pacing structure): weak_reference - only its camera movement and shot rhythm are referenced, not its content.
<Audio 1>: reference - its timbre and music style guide the target soundtrack without copying the original signal.

detailed_description:
The target video is in a cinematic, live-action fantasy style with soft volumetric lighting, a slightly desaturated teal-and-violet palette, and polished water refraction.
[Shot 1] A medium-wide shot frames <Subject 1> centered in an underwater environment, surrounded by floating bubbles and drifting light particles. She begins a slow, graceful underwater dance, rotating her shoulders and extending one leg behind her while her hair trails with delayed drag. The camera performs a slow arc around her with small amplitude, keeping her eyes sharp. Her lips remain closed in a gentle smile.
[Shot 2] At 00:04.000, the camera cuts to a closer 65mm view of <Subject 1>'s hands and face. She reaches toward a small glowing blueberry that begins to emit soft violet light from within. She cradles it in both palms as the light intensifies, then releases it to float freely in front of her.
[Shot 3] At 00:08.000, the shot transitions to a medium two-shot as the glowing blueberry drifts upward in a small spiral around <Subject 1>. The camera slowly pulls out, revealing greater underwater depth. <Subject 1> watches it ascend with a warm smile, then performs one final slow dance rotation as the light fades into the distance.

overall_soundscape:
Soft submerged water movement accompanies each arm sweep, with delicate bubble streams, faint currents, and a restrained low-frequency underwater resonance throughout.

non_diegetic_music:
Dreamlike fairyland music at approximately 72 BPM, led by celesta and glass harmonica with airy female choir and soft harp glissandi, gradually thinning into floating harmonics at the end.`;

const N_TEXT = node(CR_TEXT, "CR Text", [inp("text", "STRING", null, true)], [out("text", "STRING"), out("show_help", "STRING")], [DEFAULT_PROMPT], "H3 提示词 (Ref2VA 六段式)");

// ============ 6. Ref2VA 主节点 ============
// widgets_values 必须完整（prompt/width/height/length 虽被连线覆盖仍需占位，
// 与 object_info widget 顺序一致：prompt, width, height, length, ref_image_size）
const REF = 17;
const refInputs: any[] = [
  inp("clip", "CLIP", link(CLIP, 0, REF, 0, "CLIP")),
  inp("vae", "VAE", link(VAE_V, 0, REF, 1, "VAE")),
  inp("audio_vae", "VAE", link(VAE_A, 0, REF, 2, "VAE")),
  inp("prompt", "STRING", link(CR_TEXT, 0, REF, 3, "STRING")),
  inp("width", "INT", link(RES, 0, REF, 4, "INT")),
  inp("height", "INT", link(RES, 1, REF, 5, "INT")),
  inp("length", "INT", link(MATH, 1, REF, 6, "INT")),
  inp("ref_image_size", "COMBO", null, true),
  inp("ref_images.ref_image_0", "IMAGE", link(IMG1, 0, REF, 8, "IMAGE")),
  inp("ref_images.ref_image_1", "IMAGE", link(IMG2, 0, REF, 9, "IMAGE")),
];
if (!NO_AUDIO_REF) {
  refInputs.push(
    inp("ref_videos.ref_video_0", "IMAGE", link(VID1, 0, REF, 10, "IMAGE")),
    inp("ref_video_audios.ref_video_audio_0", "AUDIO", link(AUD1, 0, REF, 11, "AUDIO")),
    inp("ref_audios.ref_audio_0", "AUDIO", link(AUD2, 0, REF, 12, "AUDIO")),
  );
}
const N_REF = node(REF, "MiniMaxH3ReferenceToVideo", refInputs,
  [out("positive", "CONDITIONING"), out("LATENT", "LATENT")], ["", 736, 416, 124, "max"], "MiniMax H3 Ref2VA (多参考)");

// ============ 7. 采样链 ============
const NOISE = 18, KSEL = 19, SCHED = 20, GUIDER = 21, SAMPLER = 22;
const SAMPLER_NAME = process.argv.find((a) => a.startsWith("--sampler="))?.split("=")[1] || "res_multistep";
const N_NOISE = node(NOISE, "RandomNoise", [inp("noise_seed", "INT", null, true)], [out("NOISE", "NOISE")], [148402878740206, "randomize"], "随机种子");
const N_KSEL = node(KSEL, "KSamplerSelect", [inp("sampler_name", "COMBO", null, true)], [out("SAMPLER", "SAMPLER")], [SAMPLER_NAME], "采样器");
const N_SCHED = node(SCHED, "BasicScheduler", [inp("model", "MODEL", link(MODEL_FEED, 0, SCHED, 0, "MODEL")), inp("scheduler", "COMBO", null, true), inp("steps", "INT", null, true), inp("denoise", "FLOAT", null, true)], [out("SIGMAS", "SIGMAS")], ["simple", STEPS, 1], `调度器 ${STEPS}步`);
const N_GUIDER = node(GUIDER, "BasicGuider", [inp("model", "MODEL", link(MODEL_FEED, 0, GUIDER, 0, "MODEL")), inp("conditioning", "CONDITIONING", link(REF, 0, GUIDER, 1, "CONDITIONING"))], [out("GUIDER", "GUIDER")], [], "引导器");
const N_SAMPLER = node(SAMPLER, "SamplerCustomAdvanced", [
  inp("noise", "NOISE", link(NOISE, 0, SAMPLER, 0, "NOISE")),
  inp("guider", "GUIDER", link(GUIDER, 0, SAMPLER, 1, "GUIDER")),
  inp("sampler", "SAMPLER", link(KSEL, 0, SAMPLER, 2, "SAMPLER")),
  inp("sigmas", "SIGMAS", link(SCHED, 0, SAMPLER, 3, "SIGMAS")),
  inp("latent_image", "LATENT", link(REF, 1, SAMPLER, 4, "LATENT")),
], [out("output", "LATENT"), out("denoised_output", "LATENT")], [], "采样器 (Video+Audio)");

// ============ 8. 解码输出 ============
const VD = 23, VDA = 24, CV = 25, SV = 26;
const N_VD = node(VD, "VAEDecode", [inp("samples", "LATENT", link(SAMPLER, 0, VD, 0, "LATENT")), inp("vae", "VAE", link(VAE_V, 0, VD, 1, "VAE"))], [out("IMAGE", "IMAGE")], [], "视频解码");
const N_VDA = node(VDA, "VAEDecodeAudio", [inp("samples", "LATENT", link(SAMPLER, 0, VDA, 0, "LATENT")), inp("vae", "VAE", link(VAE_A, 0, VDA, 1, "VAE"))], [out("AUDIO", "AUDIO")], [], "音频解码");
const N_CV = node(CV, "CreateVideo", [inp("images", "IMAGE", link(VD, 0, CV, 0, "IMAGE")), inp("audio", "AUDIO", link(VDA, 0, CV, 1, "AUDIO")), inp("fps", "INT", null, true), inp("bit_depth", "INT", null, true)], [out("VIDEO", "VIDEO")], [24, 8], "合成视频");
const N_SV = node(SV, "SaveVideo", [inp("video", "VIDEO", link(CV, 0, SV, 0, "VIDEO")), inp("filename_prefix", "STRING", null, true), inp("format", "COMBO", null, true), inp("codec", "COMBO", null, true)], [out("video", "VIDEO")], ["video/Toonflow_H3_Ref2VA", "auto", "auto"], "保存视频");

// ============ 9. 说明 ============
const NOTE = 27;
const N_NOTE = node(NOTE, "MarkdownNote", [inp("text", "STRING", null, true)], [], [`# MiniMax-H3 Ref2VA 高质量视频工厂（Toonflow 适配版）

- **模型**: ref2va pruned int8 | 分辨率 0.4MP 9:16 | 25 步 simple
- **参考图**: 参考图1=人物主体, 参考图2=环境/道具（Toonflow 生成时自动替换为上传图片）
- **参考视频**: 分镜2.mp4（运镜/节奏参考）
- **参考音频**: 分镜2.mp4 音轨 + VX-paolaoshiAICG__00007_.flac（音色/BGM 参考）
- **提示词**: 必须按 Ref2VA 六段式格式（subject_definitions / summary / retention_analysis / detailed_description / overall_soundscape / non_diegetic_music），并使用 <Picture 1>/<Video 1>/<Audio 1> 标签
- **时长**: 默认 10 秒（PrimitiveFloat 修改，自动对齐 17k+5 帧网格）
- **加速**: SageAttention → 显存补丁 → TE-Speed`]);

const allNodes = [N_UNET, N_CLIP, N_VAEV, N_VAEA, N_SAGE, N_MEM, ...(WITH_TE ? [N_TE] : []), N_IMG1, N_IMG2, ...(NO_AUDIO_REF ? [] : [N_VID1, N_AUD1, N_AUD2]), N_RES, N_PF, N_MATH, N_TEXT, N_REF, N_NOISE, N_KSEL, N_SCHED, N_GUIDER, N_SAMPLER, N_VD, N_VDA, N_CV, N_SV, N_NOTE];

const workflow = {
  last_node_id: NOTE,
  last_link_id: lastLinkId,
  nodes: allNodes,
  links,
  groups: [],
  config: {},
  extra: {},
  version: 0.4,
};

const suffix = `${WITH_TE ? "_TE" : "_noTE"}_${DURATION}s${process.argv.includes("--pruned") ? "_pruned" : ""}`;
const outPath = process.argv.find((a) => !a.startsWith("--") && a.endsWith(".json")) || `data/workflows/Toonflow_MiniMaxH3_Ref2VA_工厂工作流${suffix}.json`;
fs.mkdirSync(require("path").dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(workflow, null, 1), "utf-8");
console.log("已生成:", outPath, "节点数:", workflow.nodes.length, "链接数:", links.length, "TE-Speed:", WITH_TE ? "启用" : "禁用", "时长:", DURATION, "s", "模型:", UNET_NAME);
