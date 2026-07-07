/**
 * WorkflowParser — ComfyUI 工作流解析器 (V2 重写)
 *
 * 兼容两种 ComfyUI API 格式:
 * - widgets_values: 旧格式, 参数通过数组索引访问
 * - inputs: 新格式 (API 格式), 参数通过对象 key 访问
 *
 * 支持 {{paramName}} 模板参数提取与注入。
 */
export interface WorkflowJSON {
  version: number;
  nodes: ComfyUINode[];
  links: any[];
  groups?: any[];
  config?: any;
  extra?: any;
}

export interface ComfyUINode {
  id: number;
  type: string;
  pos: [number, number];
  size: [number, number];
  widgets_values?: any[];     // 旧格式参数
  inputs?: Record<string, any> | any[];  // 新格式参数 (API 格式)
  outputs?: any[];
  title?: string;
}

export interface WorkflowParameter {
  id: string;                    // 参数唯一标识 (如 "prompt" / "seed" / "steps")
  name: string;                  // 中文名
  nodeId: number;                // ComfyUI 节点 ID
  widgetName: string;            // widget 名称或 inputs key
  type: "string" | "number" | "boolean" | "select" | "image" | "model";
  defaultValue: any;
  options?: string[];            // select 类型的选项
  min?: number; max?: number; step?: number;
  description?: string;
  injectVia: "widgets_values" | "inputs";  // 注入方式 (关键!)
}

export interface NodeParameterMap {
  nodeId: number;
  nodeType: string;
  parameters: WorkflowParameter[];
}

export class WorkflowParser {
  /** 解析工作流 JSON */
  parse(json: string): WorkflowJSON {
    const wf = JSON.parse(json);
    // 兼容数组格式 (API 格式有时是数组)
    if (Array.isArray(wf)) {
      return { version: 1, nodes: wf, links: [] };
    }
    return wf;
  }

  /**
   * 提取参数 (兼容 widgets_values 和 inputs 两种格式)
   * 同时提取 {{paramName}} 模板参数
   */
  extractParameters(wf: WorkflowJSON): WorkflowParameter[] {
    const params: WorkflowParameter[] = [];
    const seen = new Set<string>();

    for (const node of wf.nodes || []) {
      // 1. 提取 {{paramName}} 模板参数 (从 widgets_values)
      if (Array.isArray(node.widgets_values)) {
        for (let i = 0; i < node.widgets_values.length; i++) {
          const val = node.widgets_values[i];
          if (typeof val === "string") {
            const tmplMatch = val.match(/\{\{(\w+)\}\}/);
            if (tmplMatch) {
              const name = tmplMatch[1];
              if (!seen.has(name)) {
                seen.add(name);
                params.push({
                  id: name,
                  name: this.translateParamName(name),
                  nodeId: node.id,
                  widgetName: String(i),
                  type: this.inferType(val),
                  defaultValue: val.replace(/\{\{\w+\}\}/, ""),
                  injectVia: "widgets_values",
                });
              }
            }
          }
        }
      }

      // 2. 提取 inputs 对象中的参数 (新格式)
      if (node.inputs && typeof node.inputs === "object" && !Array.isArray(node.inputs)) {
        const inputs = node.inputs as Record<string, any>;
        for (const [key, val] of Object.entries(inputs)) {
          if (key === "image" || key === "model" || key === "ckpt_name") {
            const paramId = `${node.id}_${key}`;
            if (!seen.has(paramId)) {
              seen.add(paramId);
              params.push({
                id: paramId,
                name: this.translateParamName(key),
                nodeId: node.id,
                widgetName: key,
                type: key === "image" ? "image" : "model",
                defaultValue: val,
                injectVia: "inputs",
              });
            }
          } else if (typeof val === "number" || typeof val === "string" || typeof val === "boolean") {
            const paramId = `${node.id}_${key}`;
            if (!seen.has(paramId)) {
              seen.add(paramId);
              params.push({
                id: paramId,
                name: this.translateParamName(key),
                nodeId: node.id,
                widgetName: key,
                type: this.inferType(val),
                defaultValue: val,
                injectVia: "inputs",
              });
            }
          }
        }
      }

      // 3. 提取 widgets_values 中的数值参数 (非模板)
      if (Array.isArray(node.widgets_values)) {
        for (let i = 0; i < node.widgets_values.length; i++) {
          const val = node.widgets_values[i];
          if (typeof val === "number") {
            const paramId = `${node.id}_wv${i}`;
            if (!seen.has(paramId)) {
              seen.add(paramId);
              params.push({
                id: paramId,
                name: `${node.type}_wv${i}`,
                nodeId: node.id,
                widgetName: String(i),
                type: "number",
                defaultValue: val,
                injectVia: "widgets_values",
              });
            }
          }
        }
      }
    }

    return params;
  }

  /**
   * 注入参数 (根据 injectVia 字段决定注入方式)
   */
  injectParameters(wf: WorkflowJSON, params: Record<string, any>): WorkflowJSON {
    const allParams = this.extractParameters(wf);

    for (const param of allParams) {
      const value = params[param.id];
      if (value === undefined) continue;

      const node = wf.nodes.find(n => n.id === param.nodeId);
      if (!node) continue;

      if (param.injectVia === "widgets_values") {
        // 旧格式: 修改 widgets_values 数组
        if (!node.widgets_values) node.widgets_values = [];
        const idx = parseInt(param.widgetName, 10);
        if (!isNaN(idx)) {
          // 如果原值包含 {{param}}, 保留模板外的部分
          const origVal = node.widgets_values[idx];
          if (typeof origVal === "string" && origVal.includes(`{{${param.id}}}`)) {
            node.widgets_values[idx] = origVal.replace(`{{${param.id}}}`, String(value));
          } else {
            node.widgets_values[idx] = value;
          }
        }
      } else if (param.injectVia === "inputs") {
        // 新格式: 修改 inputs 对象
        if (!node.inputs || typeof node.inputs !== "object" || Array.isArray(node.inputs)) {
          node.inputs = {};
        }
        (node.inputs as Record<string, any>)[param.widgetName] = value;
      }
    }

    return wf;
  }

  /** 校验工作流 */
  validate(wf: WorkflowJSON): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!wf.nodes?.length) errors.push("No nodes defined");
    const outNodes = this.getOutputNodes(wf);
    if (!outNodes.length) errors.push("No output node found (SaveImage/VHS_VideoCombine)");
    return { valid: errors.length === 0, errors };
  }

  getInputNodes(wf: WorkflowJSON): ComfyUINode[] {
    return (wf.nodes || []).filter(n =>
      ["LoadImage", "LoadCheckpoint", "CheckpointLoaderSimple"].some(t => n.type?.includes(t)),
    );
  }

  getOutputNodes(wf: WorkflowJSON): ComfyUINode[] {
    return (wf.nodes || []).filter(n =>
      n.type?.includes("Save") || n.type?.includes("VHS_VideoCombine"),
    );
  }

  /** 推断参数类型 */
  private inferType(val: any): WorkflowParameter["type"] {
    if (typeof val === "number") return "number";
    if (typeof val === "boolean") return "boolean";
    if (typeof val === "string") return "string";
    return "string";
  }

  /** 参数名中文翻译 */
  private translateParamName(name: string): string {
    const map: Record<string, string> = {
      prompt: "提示词",
      negative: "负面提示词",
      negative_prompt: "负面提示词",
      seed: "随机种子",
      steps: "采样步数",
      cfg: "CFG 引导系数",
      cfg_scale: "CFG 引导系数",
      sampler_name: "采样器",
      scheduler: "调度器",
      denoise: "去噪强度",
      width: "宽度",
      height: "高度",
      batch_size: "批量大小",
      model: "模型",
      ckpt_name: "模型",
      image: "参考图",
      text: "文本",
      control_net_name: "ControlNet",
      ipadapter_weight: "IP-Adapter 权重",
    };
    return map[name.toLowerCase()] || name;
  }
}
