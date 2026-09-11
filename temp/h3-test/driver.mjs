// MiniMax-H3 效果测试驱动（本地 ComfyUI / 工厂工作流 T2VA 模式）
// 场景：对话 / 风景 / 武打 / 特效，各生成 10s 竖屏视频
import fs from "node:fs";
import path from "node:path";

const COMFY = "http://127.0.0.1:8188";
const WF_PATH = "E:/workspace/Toonflow-app/data/workflows/Toonflow_MiniMaxH3_Ref2VA_工厂工作流_完整版.json";
const OUT_DIR = "E:/workspace/Toonflow-app/temp/h3-test";
const CLIENT_ID = "dsh-h3-test";
const MAX_WAIT_MS = 120 * 60 * 1000; // 单视频最长等待 120 分钟
const POLL_MS = 10000;
const DRY = process.env.H3_DRY === "1"; // 仅转换并打印 API，不提交

// ---------- UI 格式 → API 格式（对齐 Toonflow workflow-normalizer 逻辑） ----------
const SKIP_NODE_TYPES = new Set(["Reroute", "Reroute (rgthree)", "Note", "Note Plus (mtb)", "MarkdownNote", "PrimitiveNode"]);
const TEXT_PROVIDER_NODES = new Set(["CR Text", "CR Multiline Text", "CR Prompt Text", "String"]);
const WIDGET_TYPES = new Set(["INT", "FLOAT", "STRING", "BOOLEAN", "COMBO"]);

function isWidgetSpec(spec) {
  if (!Array.isArray(spec) || spec.length === 0) return false;
  const first = spec[0];
  if (Array.isArray(first)) return true;
  if (typeof first !== "string") return false;
  if (WIDGET_TYPES.has(first)) return true;
  if (first.startsWith("COMFY_DYNAMICCOMBO")) return true;
  return false;
}
function orderedWidgetNames(info) {
  const names = [];
  if (!info?.input) return names;
  for (const section of ["required", "optional"]) {
    const obj = info.input[section];
    if (obj) for (const [name, spec] of Object.entries(obj)) if (isWidgetSpec(spec)) names.push(name);
  }
  return names;
}
async function convert(ui, objectInfo, stripIds) {
  const uiNodes = ui.nodes || [];
  const uiLinks = ui.links || [];
  const nodeById = new Map(uiNodes.map((n) => [String(n.id), n]));
  const skipIds = new Set(uiNodes.filter((n) => SKIP_NODE_TYPES.has(n.type) || stripIds.has(String(n.id))).map((n) => String(n.id)));
  const linkByTarget = new Map();
  const connected = new Set();
  for (const ln of uiLinks) {
    if (!Array.isArray(ln) || ln.length < 6) continue;
    const [, fromNode, fromSlot, toNode, toSlot] = ln;
    linkByTarget.set(`${toNode}:${toSlot}`, { fromNode: String(fromNode), fromSlot: Number(fromSlot) });
    connected.add(String(fromNode));
    connected.add(String(toNode));
  }
  function trace(toN, toS) {
    let key = `${toN}:${toS}`;
    const seen = new Set();
    while (linkByTarget.has(key)) {
      if (seen.has(key)) return null;
      seen.add(key);
      const { fromNode, fromSlot } = linkByTarget.get(key);
      if (skipIds.has(fromNode)) { key = `${fromNode}:${fromSlot}`; continue; }
      const up = nodeById.get(fromNode);
      if (up && TEXT_PROVIDER_NODES.has(up.type)) {
        const wv = up.widgets_values || [];
        return wv[0] ?? "";
      }
      return [fromNode, fromSlot];
    }
    return null;
  }
  const nodes = {};
  for (const node of uiNodes) {
    if (SKIP_NODE_TYPES.has(node.type) || stripIds.has(String(node.id))) continue;
    if (objectInfo && !objectInfo[node.type] && !connected.has(String(node.id))) continue;
    const nid = String(node.id);
    const api = {};
    const inpList = node.inputs || [];
    inpList.forEach((inpDef, idx) => {
      const linkId = inpDef?.link;
      if (linkId !== null && linkId !== undefined && linkId !== false) {
        const r = trace(nid, idx);
        if (r !== null && r !== undefined) api[inpDef.name] = r;
      }
    });
    const wv = node.widgets_values;
    if (wv && !Array.isArray(wv) && typeof wv === "object") {
      for (const [n, v] of Object.entries(wv)) {
        if (v && typeof v === "object") continue;
        if (!(n in api)) api[n] = v;
      }
    } else if (Array.isArray(wv)) {
      const names = orderedWidgetNames(objectInfo[node.type]);
      for (let i = 0; i < wv.length && i < names.length; i++) {
        const nm = names[i];
        if (!(nm in api)) api[nm] = wv[i];
      }
    }
    nodes[nid] = { class_type: node.type, inputs: api };
  }
  return nodes;
}

// ---------- 测试用例（T2VA 三字段：integrated_multimodal_description / overall_soundscape / non_diegetic_music） ----------
const CASES = [
  {
    label: "dialogue",
    name: "对话",
    prompt: `integrated_multimodal_description:
The target video is a cinematic live-action drama with shallow depth of field, a warm interior color grade of beige and soft teal, and realistic skin texture and gentle window-light rim lighting. The camera language is slow and intimate, with small, deliberate movements.
[Shot 1] A medium close-up frames a young woman (S1) with short dark hair and a cream knit sweater, seated at a small wooden table beside a rain-streaked window in a cozy cafe at night. She holds a white porcelain cup with both hands, looks up at the man across the table, and asks with a gentle but slightly strained voice, <d>[Chinese] 你真的决定要走了吗？</d> Her brows lift slightly as she waits, her lips closing softly after the line, a single raindrop sliding down the window behind her.
[Shot 2] At 00:02.800, the camera cuts to an over-the-shoulder angle from behind (S1), framing a man in his early thirties (S2) in a dark wool coat, his hands wrapped around his own cup. He pauses, lowers his gaze, and replies in a low, heavy voice, <d>[Chinese] 我……没办法留下来了。</d> The camera slowly pushes in with small amplitude toward his face, candlelight flickering across his cheek and the window bokeh drifting in the background.
[Shot 3] At 00:05.600, the camera returns to a medium two-shot from a 45-degree side angle, both characters in frame. (S1) forces a small smile, blinks slowly, and says with a trembling voice, <d>[Chinese] 那……我们以后还会再见吗？</d> (S2) reaches across the table and gently covers her hand with his, then answers softly after a beat, <d>[Chinese] 会再见的。</d> The shot holds on both faces, steam rising from the cups, rain continuing to streak the window.
[Shot 4] At 00:08.800, a slow crane-up moves outside the window, revealing the two silhouettes still seated inside the warmly lit cafe, rain and streetlight bokeh filling the frame, and the scene gently softens toward a warm fade.`,
    overall_soundscape: `overall_soundscape:
Soft continuous rain patters against the window, a low espresso machine hums in the background, porcelain cups clink occasionally, subtle clothing rustles accompany each gesture, and both voices are close and clear with natural room reverb.`,
    non_diegetic_music: `non_diegetic_music:
Warm minimalist piano with a sparse cello line, around 60 BPM, opening on a single repeated note, slowly layering in a gentle chord progression, and settling into a held low note at the end.`,
  },
  {
    label: "landscape",
    name: "风景",
    prompt: `integrated_multimodal_description:
The target video is an epic aerial nature film with photorealistic detail, crisp morning light, and a cool blue-and-gold color grade, shot with smooth, slow drone camera moves.
[Shot 1] A high-altitude aerial wide shot slowly descends and drifts forward over a sea of clouds at sunrise, jagged mountain peaks breaking through the mist below, golden light spilling across the cloud tops. A river of fog pours through a valley on the left, while a distant waterfall catches the first sunlight and glints.
[Shot 2] At 00:04.000, the camera performs a slow lateral tracking move to the right with small amplitude, revealing a vast alpine meadow between two ridgelines, a winding turquoise river reflecting the sky, and a small herd of deer moving slowly across the bright grass, their silhouettes sharp in the low sun.
[Shot 3] At 00:07.500, the camera tilts up in a gentle arc toward the highest snow-covered peak, the summit glowing pink in the sunrise, thin clouds streaming over the ridgeline, and two birds gliding across the frame in the far distance. The shot holds for a moment, then slowly pulls back to a grander scale as the frame gradually softens into a warm morning haze.`,
    overall_soundscape: `overall_soundscape:
Distant wind blowing across the peaks, the faint continuous roar of the waterfall, soft rustling of alpine grass, and a few distant bird calls echoing across the valley.`,
    non_diegetic_music: `non_diegetic_music:
Slow epic orchestral texture with sustained strings and a lone French horn melody, around 50 BPM, building gradually and receding into a quiet held chord at the end.`,
  },
  {
    label: "martial_arts",
    name: "武打",
    prompt: `integrated_multimodal_description:
The target video is a high-energy wuxia action sequence in a misty bamboo forest, shot with a wide-angle lens, fast handheld camera work, and a muted green-and-grey palette with strong contrast and motion-blurred bamboo.
[Shot 1] A martial artist in a dark grey robe (S1) sprints diagonally across a bamboo forest clearing, kicks off a bamboo trunk and spins in mid-air, robes whipping and bamboo leaves scattering behind him. The camera follows with a quick whip pan and slight shake, keeping his motion crisp. He lands in a low stance as dust and leaves swirl around his feet.
[Shot 2] At 00.03.200, an opponent in a brown robe (S2) bursts from the bamboo shadows and throws a straight punch toward (S1)'s head; (S1) ducks and sweeps his leg, sending (S2) stumbling backward. The camera cuts to a low-angle close-up of the two exchanging three rapid punches and blocks, fists connecting with sharp impacts, nearby bamboo trunks shaking from the shockwaves.
[Shot 3] At 00:06.800, (S1) leaps onto a tall bamboo stalk, runs two steps up it, and kicks off into a downward flying kick aimed at (S2). The camera follows upward in a fast tilt, then swings down to a ground-level wide shot as (S2) raises both forearms to block, dust bursting outward around the point of impact. (S1) lands and both fighters freeze in a final stance, breathing hard, mist drifting slowly between them.
[Shot 4] At 00:09.000, a quick dolly-in on (S1)'s narrowed eyes as he exhales, then the screen cuts to black.`,
    overall_soundscape: `overall_soundscape:
Sharp whooshes accompany every strike and kick, hard impacts landing with a deep thud and a slight echo, bamboo leaves rustling and snapping, fabric whipping through the air, and heavy breathing from both fighters.`,
    non_diegetic_music: `non_diegetic_music:
Driving taiko drums with fast irregular rhythms and a tense erhu line, around 140 BPM, punctuated by cymbal crashes on the major impacts, cutting off abruptly at the final pose.`,
  },
  {
    label: "vfx",
    name: "特效",
    prompt: `integrated_multimodal_description:
The target video is a cinematic fantasy magic sequence with polished visual effects, deep blue and violet tones, glowing particles, volumetric light shafts, and slow elegant camera moves around the subject.
[Shot 1] A sorceress in a flowing dark-blue robe (S1) stands at the center of a circular stone platform engraved with softly glowing runes, both palms raised. Golden energy threads spiral from her fingertips and gather into a swirling vortex of light and particles in front of her chest. The camera slowly orbits her with small amplitude, the runes flaring brighter with each pulse of energy.
[Shot 2] At 00:03.500, the vortex condenses into a glowing sphere of crackling energy. Arcs of lightning and thin ribbons of light wrap around the sphere, sparks raining onto the stone floor and igniting small blue flames that run along the rune grooves. A shockwave ring expands outward, rippling through the air and visibly bending the light around it.
[Shot 3] At 00:06.500, (S1) thrusts both hands forward and the sphere detonates into a colossal burst of light, hundreds of luminous fragments flying past the camera in slow motion, each fragment trailing a thin ribbon of color. The burst fades into floating embers that drift upward in slow spirals around the platform.
[Shot 4] At 00:08.800, a wide shot shows (S1) lowering her arms, the runes dimming, the last embers swirling around her before dissolving, a faint afterglow lingering on the stone platform, and the frame slowly fading to dark.`,
    overall_soundscape: `overall_soundscape:
A deep magical humming that rises in pitch as the vortex forms, crackling electrical discharges, a low boom at the detonation, hissing sparks, and soft crystalline chimes as the fragments fly past.`,
    non_diegetic_music: `non_diegetic_music:
Ethereal synth choir with pulsing low pads and shimmering high arpeggios, around 90 BPM, swelling to a peak at the detonation and decaying into a soft ambient tail.`,
  },
];

// ---------- 主流程 ----------
fs.mkdirSync(OUT_DIR, { recursive: true });
const objectInfo = await (await fetch(`${COMFY}/object_info`)).json();

// 纯文生视频：剥离参考节点（8 参考图1、9 参考图2、10 参考视频、11 参考视频音轨、12 独立音频参考）
const STRIP_IDS = new Set(["8", "9", "10", "11", "12"]);

let exitCode = 0;
for (const c of CASES) {
  const label = c.label;
  const prompt = `${c.prompt}\n\n${c.overall_soundscape}\n\n${c.non_diegetic_music}`;
  const wf = JSON.parse(fs.readFileSync(WF_PATH, "utf8"));

  // 先注入提示词到 CR Text（节点16），转换时会内联到 Ref2VA 节点的 prompt 输入
  const crText = wf.nodes.find((n) => n.id === 16);
  if (crText) crText.widgets_values[0] = prompt;

  const api = await convert(wf, objectInfo, STRIP_IDS);

  // 兜底直接覆盖关键输入
  api["17"].inputs.prompt = prompt;                 // MiniMaxH3ReferenceToVideo.prompt
  api["18"].inputs.noise_seed = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER); // 随机种子
  api["26"].inputs.filename_prefix = `video/h3_test_${label}`; // 输出前缀

  if (DRY) {
    console.log(`[H3TEST] DRY ${label}:`);
    for (const [id, n] of Object.entries(api)) {
      console.log(`  ${id} ${n.class_type}: ${JSON.stringify(n.inputs).slice(0, 180)}`);
    }
    continue;
  }

  // 队列检查（避免并行跑重模型导致 OOM）
  const q = await (await fetch(`${COMFY}/queue`)).json();
  const pending = (q.queue_running?.length || 0) + (q.queue_pending?.length || 0);
  if (pending > 0) {
    console.log(`[H3TEST] ${label}: queue busy (${pending}), waiting...`);
    let waited = 0;
    while (pending > 0) {
      await new Promise((r) => setTimeout(r, 15000));
      waited += 15;
      const q2 = await (await fetch(`${COMFY}/queue`)).json();
      const p2 = (q2.queue_running?.length || 0) + (q2.queue_pending?.length || 0);
      if (p2 === 0) break;
      if (waited > 60 * 60) { console.log(`[H3TEST] ${label}: queue stuck, abort`); process.exit(1); }
    }
  }

  console.log(`[H3TEST] ${label}(${c.name}): submitting...`);
  const t0 = Date.now();
  const resp = await fetch(`${COMFY}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: api, client_id: CLIENT_ID }),
  });
  const body = await resp.json();
  if (!resp.ok || body.error) {
    console.log(`[H3TEST] ${label}: SUBMIT FAILED -> ${JSON.stringify(body).slice(0, 2000)}`);
    exitCode = 1;
    continue;
  }
  const pid = body.prompt_id;
  console.log(`[H3TEST] ${label}: submitted, prompt_id=${pid}`);

  let result = null;
  let lastLog = 0;
  while (Date.now() - t0 < MAX_WAIT_MS) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    let hist;
    try {
      hist = await (await fetch(`${COMFY}/history/${pid}`)).json();
    } catch {
      continue;
    }
    const e = hist[pid];
    if (!e) continue;
    const st = e.status || {};
    if (st.completed) {
      if (st.status_str === "error") {
        result = { ok: false, error: JSON.stringify(e).slice(0, 1500) };
        break;
      }
      const vids = [];
      for (const o of Object.values(e.outputs || {})) {
        // 本版本 ComfyUI 的 SaveVideo 把 mp4 输出在 images 键下（animated: true）
        for (const v of o.videos || []) vids.push(v);
        for (const v of o.images || []) {
          if (v.filename?.toLowerCase().endsWith(".mp4") || o.animated) vids.push(v);
        }
      }
      // 去重（同一文件可能同时出现在 videos/images）
      const seen = new Set();
      const uniq = [];
      for (const v of vids) {
        const k = `${v.subfolder || ""}/${v.filename}`;
        if (!seen.has(k)) { seen.add(k); uniq.push(v); }
      }
      if (!uniq.length) {
        result = { ok: false, error: "completed but no video output" };
        break;
      }
      const v = uniq[0];
      const url = `${COMFY}/view?filename=${encodeURIComponent(v.filename)}&subfolder=${encodeURIComponent(v.subfolder || "")}&type=${v.type || "output"}`;
      const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
      const dest = path.join(OUT_DIR, `${label}.mp4`);
      fs.writeFileSync(dest, buf);
      result = { ok: true, file: dest, bytes: buf.length, elapsed: Math.round((Date.now() - t0) / 1000) };
      break;
    } else if (st.status_str === "error") {
      result = { ok: false, error: "status error" };
      break;
    } else {
      const el = Math.round((Date.now() - t0) / 1000);
      if (el - lastLog >= 60) {
        console.log(`[H3TEST] ${label}: running... ${el}s`);
        lastLog = el;
      }
    }
  }
  if (!result) result = { ok: false, error: `timeout after ${MAX_WAIT_MS / 60000}min` };

  if (result.ok) {
    console.log(`[H3TEST] ${label}: DONE in ${result.elapsed}s -> ${result.file} (${(result.bytes / 1048576).toFixed(1)}MB)`);
  } else {
    console.log(`[H3TEST] ${label}: FAILED -> ${result.error}`);
    exitCode = 1;
    // 取消超时残留任务
    try {
      await fetch(`${COMFY}/queue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delete: [pid], client_id: CLIENT_ID }),
      });
    } catch {}
    continue;
  }
}
console.log(`[H3TEST] ALL DONE, exitCode=${exitCode}`);
process.exit(exitCode);
