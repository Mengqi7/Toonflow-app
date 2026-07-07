/**
 * ParameterEditor — ComfyUI 工作流参数编辑器
 *
 * 核心: 解决一阶段"参数配置完全不可用"问题
 * 兼容 widgets_values 和 inputs 两种 API 格式
 * 提供 toFormSchema 供前端渲染表单
 */
import { WorkflowParser } from "./WorkflowParser";
import type { WorkflowJSON, WorkflowParameter } from "./WorkflowParser";

export interface FormField {
  id: string;
  name: string;
  type: "text" | "number" | "range" | "select" | "switch" | "image" | "model";
  label: string;
  defaultValue: any;
  options?: { label: string; value: any }[];
  min?: number; max?: number; step?: number;
  required?: boolean;
  description?: string;
  nodeId: number;
  injectVia: string;
}

export interface FormSchema {
  fields: FormField[];
  groups: { nodeId: number; nodeType: string; fields: FormField[] }[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export class ParameterEditor {
  private parser = new WorkflowParser();

  /** 提取参数 */
  extractParameters(workflowJson: string): WorkflowParameter[] {
    const wf = this.parser.parse(workflowJson);
    return this.parser.extractParameters(wf);
  }

  /** 注入参数 */
  injectParameters(workflowJson: string, params: Record<string, any>): string {
    const wf = this.parser.parse(workflowJson);
    const injected = this.parser.injectParameters(wf, params);
    return JSON.stringify(injected);
  }

  /** 参数校验 */
  validateParams(params: Record<string, any>, schema: WorkflowParameter[]): ValidationResult {
    const errors: string[] = [];
    for (const param of schema) {
      const val = params[param.id];
      if (val === undefined || val === null) {
        // 未提供的参数用默认值, 不报错
        continue;
      }
      if (param.type === "number" && typeof val !== "number") {
        errors.push(`${param.name} 必须是数字`);
      }
      if (param.type === "number" && param.min !== undefined && val < param.min) {
        errors.push(`${param.name} 不能小于 ${param.min}`);
      }
      if (param.type === "number" && param.max !== undefined && val > param.max) {
        errors.push(`${param.name} 不能大于 ${param.max}`);
      }
      if (param.type === "select" && param.options && !param.options.includes(String(val))) {
        errors.push(`${param.name} 必须是 ${param.options.join("/")} 之一`);
      }
    }
    return { valid: errors.length === 0, errors };
  }

  /** 转换为前端表单 schema */
  toFormSchema(parameters: WorkflowParameter[]): FormSchema {
    const fields: FormField[] = parameters.map(p => ({
      id: p.id,
      name: p.id,
      type: this.mapFieldType(p),
      label: p.name,
      defaultValue: p.defaultValue,
      options: p.options?.map(o => ({ label: o, value: o })),
      min: p.min, max: p.max, step: p.step || 1,
      required: false,
      description: p.description,
      nodeId: p.nodeId,
      injectVia: p.injectVia,
    }));

    // 按节点分组
    const nodeMap = new Map<number, { nodeType: string; fields: FormField[] }>();
    for (const f of fields) {
      if (!nodeMap.has(f.nodeId)) {
        // 从 parameters 找 nodeType
        const param = parameters.find(p => p.nodeId === f.nodeId);
        nodeMap.set(f.nodeId, { nodeType: param ? `节点 ${f.nodeId}` : `节点 ${f.nodeId}`, fields: [] });
      }
      nodeMap.get(f.nodeId)!.fields.push(f);
    }

    const groups = Array.from(nodeMap.entries()).map(([nodeId, { nodeType, fields }]) => ({
      nodeId, nodeType, fields,
    }));

    return { fields, groups };
  }

  private mapFieldType(p: WorkflowParameter): FormField["type"] {
    switch (p.type) {
      case "number": return p.min !== undefined && p.max !== undefined ? "range" : "number";
      case "boolean": return "switch";
      case "select": return "select";
      case "image": return "image";
      case "model": return "model";
      default: return "text";
    }
  }
}
