/**
 * ComfyUI 工作流格式规范化
 *
 * ComfyUI 前端「保存/导出」得到的是 UI 格式（nodes 为数组、links 为扁平数组、
 * inputs 为输入定义列表），而 /prompt 接口需要的是 API 格式（nodes 为 map、
 * inputs 为 key→value，连接用 [nodeId, slot] 数组表示）。
 *
 * 关键难点：UI 格式里很多节点（VAELoader / LoadImage / UNETLoader 等）的
 * inputs 为空数组，其 widget 值只存在 widgets_values 里，而 widget 的名称
 * 必须从 ComfyUI 的 /object_info 获取。因此：
 *   - 执行时必须传入 objectInfo 才能做完整转换；
 *   - 没有 objectInfo 时做「尽力而为」的转换（仅用于导入时的展示分析）。
 */

import { ComfyWorkflowJSON, ComfyNodeRaw, ComfyLink } from "./types";

/** UI 格式里需要跳过的虚拟节点 */
const SKIP_NODE_TYPES = new Set([
  "Reroute",
  "Reroute (rgthree)",
  "Note",
  "Note Plus (mtb)",
  "MarkdownNote",
  "PrimitiveNode",
]);

/** 纯文本提供节点：链接到它时，直接把其文本值内联 */
const TEXT_PROVIDER_NODES = new Set([
  "CR Text",
  "CR Multiline Text",
  "CR Prompt Text",
  "String",
]);

/** 采样器节点（用于识别正/负提示词、种子注入） */
export const SAMPLER_NODE_TYPES = new Set([
  "KSampler",
  "KSamplerAdvanced",
  "SamplerCustom",
  "SamplerCustomAdvanced",
  "BNK_TiledKSampler",
  "SeargeSampler",
  "Eff. Efficient KSampler",
]);

/** ComfyUI /object_info 输入规范里，属于 widget 的原始类型 */
const WIDGET_TYPES = new Set(["INT", "FLOAT", "STRING", "BOOLEAN", "COMBO"]);

type ObjectInfo = Record<string, { input?: { required?: Record<string, any[]>; optional?: Record<string, any[]> } }>;

/** 判断 /object_info 中某个输入规范是否是 widget（而非连线） */
function isWidgetSpec(spec: any[]): boolean {
  if (!Array.isArray(spec) || spec.length === 0) return false;
  const first = spec[0];
  if (Array.isArray(first)) return true; // COMBO 选项列表
  if (typeof first !== "string") return false;
  if (WIDGET_TYPES.has(first)) return true;
  if (first.startsWith("COMFY_DYNAMICCOMBO")) return true; // 动态 combo（如 SaveVideo.codec）
  return false;
}

/** 提取节点类型的有序 widget 输入名（required 在前，optional 在后） */
function orderedWidgetNames(nodeInfo: ObjectInfo[string] | undefined): string[] {
  const names: string[] = [];
  if (!nodeInfo?.input) return names;
  for (const section of ["required", "optional"] as const) {
    const obj = nodeInfo.input[section];
    if (obj) {
      for (const [name, spec] of Object.entries(obj)) {
        if (isWidgetSpec(spec)) names.push(name);
      }
    }
  }
  return names;
}

/**
 * 规范化入口：把任意 ComfyUI 工作流 JSON 转成 API 格式
 * @param json 用户粘贴的原始 JSON
 * @param objectInfo ComfyUI /object_info 结果（执行时传入，用于精确映射 widget）
 */
export function normalizeWorkflow(json: any, objectInfo?: ObjectInfo): ComfyWorkflowJSON {
  if (!json || typeof json !== "object") {
    throw new Error("工作流 JSON 格式无效");
  }

  // 情况 1：UI 格式（nodes 为数组）
  if (Array.isArray(json.nodes)) {
    return uiToApi(json, objectInfo);
  }

  // 情况 2：已经是 map 格式（nodes 为对象）
  if (json.nodes && typeof json.nodes === "object" && !Array.isArray(json.nodes)) {
    const nodes = json.nodes as Record<string, ComfyNodeRaw>;
    return { nodes, links: deriveLinks(nodes) };
  }

  // 情况 3：纯 API 格式（顶层本身就是 nodeId → node 的 map，如 "Export (API)" 结果）
  if (
    Object.values(json).every(
      (v) => v && typeof v === "object" && ((v as any).class_type || (v as any).type),
    )
  ) {
    const nodes = json as Record<string, ComfyNodeRaw>;
    return { nodes, links: deriveLinks(nodes) };
  }

  throw new Error("无法识别的工作流 JSON 格式");
}

/** 从 API 格式节点的 inputs 里推导连接关系（用于分析终端节点） */
function deriveLinks(nodes: Record<string, any>): ComfyLink[] {
  const links: ComfyLink[] = [];
  for (const [nodeId, node] of Object.entries(nodes)) {
    if (!node || typeof node.inputs !== "object") continue;
    let slotIndex = 0;
    for (const [, value] of Object.entries(node.inputs)) {
      if (
        Array.isArray(value) &&
        value.length >= 2 &&
        typeof value[0] === "string" &&
        !isNaN(Number(value[0]))
      ) {
        links.push({
          from: String(value[0]),
          fromOutput: Number(value[1]),
          to: String(nodeId),
          toInput: slotIndex,
        });
      }
      slotIndex++;
    }
  }
  return links;
}

/**
 * UI 格式 → API 格式
 * 参考 ComfyUI 官方前端 graphToPrompt 逻辑：跳过虚拟节点、塌缩 Reroute、
 * 通过 /object_info 把 widgets_values 精确映射到 widget 输入名。
 */
function uiToApi(ui: any, objectInfo?: ObjectInfo): ComfyWorkflowJSON {
  const uiNodes: any[] = ui.nodes || [];
  const uiLinks: any[] = ui.links || [];

  const nodeById = new Map<string, any>();
  for (const n of uiNodes) nodeById.set(String(n.id), n);
  const skipIds = new Set(uiNodes.filter((n) => SKIP_NODE_TYPES.has(n.type)).map((n) => String(n.id)));

  // link_by_target: `${toNode}:${toSlot}` → 来源信息
  const linkByTarget = new Map<string, { fromNode: string; fromSlot: number }>();
  const connectedNodeIds = new Set<string>();
  for (const ln of uiLinks) {
    if (!Array.isArray(ln) || ln.length < 6) continue;
    const [, fromNode, fromSlot, toNode, toSlot] = ln;
    linkByTarget.set(`${toNode}:${toSlot}`, { fromNode: String(fromNode), fromSlot: Number(fromSlot) });
    connectedNodeIds.add(String(fromNode));
    connectedNodeIds.add(String(toNode));
  }

  /** 追溯链接源头，跳过虚拟节点，塌缩文本提供节点 */
  function traceLink(toNodeId: string, toSlot: number): any {
    let currentKey = `${toNodeId}:${toSlot}`;
    const visited = new Set<string>();
    while (linkByTarget.has(currentKey)) {
      if (visited.has(currentKey)) return null;
      visited.add(currentKey);
      const { fromNode, fromSlot } = linkByTarget.get(currentKey)!;
      if (skipIds.has(fromNode)) {
        currentKey = `${fromNode}:${fromSlot}`;
        continue;
      }
      const upstream = nodeById.get(fromNode);
      if (upstream && TEXT_PROVIDER_NODES.has(upstream.type)) {
        const wv = upstream.widgets_values || [];
        return wv[0] ?? "";
      }
      return [fromNode, fromSlot];
    }
    return null;
  }

  const nodes: Record<string, ComfyNodeRaw> = {};
  const links: ComfyLink[] = [];

  for (const node of uiNodes) {
    if (SKIP_NODE_TYPES.has(node.type)) continue;

    // 节点类型未安装（不在 /object_info 中）：
    // - 无任何连线 → 视为注释/展示类节点，直接跳过；
    // - 有连线 → 保留，提交时由 ComfyUI 给出明确报错（真实缺失依赖）。
    if (objectInfo && !objectInfo[node.type] && !connectedNodeIds.has(String(node.id))) {
      continue;
    }

    const nid = String(node.id);
    const classType: string = node.type;
    const apiInputs: Record<string, any> = {};

    // 1) 先处理连线输入（UI inputs 里 link 非空的条目）
    const inpList: any[] = node.inputs || [];
    inpList.forEach((inpDef, idx) => {
      const name: string = inpDef?.name ?? "";
      const linkId = inpDef?.link;
      if (linkId !== null && linkId !== undefined && linkId !== false) {
        const resolved = traceLink(nid, idx);
        if (resolved !== null && resolved !== undefined) {
          apiInputs[name] = resolved;
          if (Array.isArray(resolved)) {
            links.push({ from: String(resolved[0]), fromOutput: Number(resolved[1]), to: nid, toInput: idx });
          }
        }
      }
    });

    // 2) 映射 widgets_values → widget 输入名
    // ComfyUI 两种序列化格式：
    //   - 对象格式：key 即 widget 名（新版本 / 带预览的节点）
    //   - 数组格式：按 /object_info 的有序 widget 名一一对应
    const widgetVals: any = node.widgets_values;

    if (widgetVals && !Array.isArray(widgetVals) && typeof widgetVals === "object") {
      // 对象格式：直接按 key 注入，跳过 videopreview/audiopreview 等对象型元数据
      for (const [name, val] of Object.entries(widgetVals)) {
        if (val && typeof val === "object") continue;
        if (!(name in apiInputs)) apiInputs[name] = val;
      }
    } else if (Array.isArray(widgetVals)) {
      if (objectInfo) {
        const widgetNames = orderedWidgetNames(objectInfo[classType]);
        for (let i = 0; i < widgetVals.length && i < widgetNames.length; i++) {
          const name = widgetNames[i];
          if (!(name in apiInputs)) apiInputs[name] = widgetVals[i];
        }
      } else {
        // 降级：仅处理 UI inputs 里显式声明为 widget 的条目（信息有限，可能漏掉纯 widget 节点）
        let widgetIdx = 0;
        for (const inpDef of inpList) {
          if (inpDef?.widget && (inpDef.link === null || inpDef.link === undefined || inpDef.link === false)) {
            if (widgetIdx < widgetVals.length) {
              apiInputs[inpDef.name] = widgetVals[widgetIdx];
              widgetIdx++;
            }
          }
        }
      }
    }

    nodes[nid] = {
      id: nid,
      class_type: classType,
      type: classType,
      inputs: apiInputs,
      _meta: { title: node.title || classType },
    };
  }

  return { nodes, links };
}

/** 判断某个节点是否是采样器（用于提示词极性、种子识别） */
export function isSamplerNode(classType: string): boolean {
  return SAMPLER_NODE_TYPES.has(classType);
}
