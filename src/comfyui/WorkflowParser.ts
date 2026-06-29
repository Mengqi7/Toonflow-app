export interface WorkflowJSON { version: number; nodes: ComfyUINode[]; links: any[]; groups?: any[]; config?: any; extra?: any; }
export interface ComfyUINode { id: number; type: string; pos: [number, number]; size: [number, number]; widgets_values?: any[]; title?: string; inputs?: any[]; outputs?: any[]; }
export interface NodeParameterMap { nodeId: number; nodeType: string; parameters: { name: string; widgetName: string; type: string; defaultValue: any; options?: string[]; min?: number; max?: number; step?: number; }[]; }

export class WorkflowParser {
  parse(json: string): WorkflowJSON {
    const wf = JSON.parse(json);
    if (Array.isArray(wf)) {
      return { version: 1, nodes: wf, links: [] };
    }
    return wf;
  }

  extractParameters(wf: WorkflowJSON): NodeParameterMap[] {
    const maps: NodeParameterMap[] = [];
    for (const node of wf.nodes) {
      if (!node.widgets_values?.length) continue;
      const params: NodeParameterMap["parameters"] = [];
      for (let i = 0; i < node.widgets_values.length; i++) {
        params.push({ name: "param_" + i, widgetName: String(i), type: typeof node.widgets_values[i], defaultValue: node.widgets_values[i] });
      }
      if (params.length) maps.push({ nodeId: node.id, nodeType: node.type, parameters: params });
    }
    return maps;
  }

  injectParameters(wf: WorkflowJSON, params: Record<string, any>): WorkflowJSON {
    for (const [key, value] of Object.entries(params)) {
      const [nodeIdStr, idxStr] = key.split("_");
      const nodeId = parseInt(nodeIdStr);
      const idx = parseInt(idxStr);
      const node = wf.nodes.find(n => n.id === nodeId);
      if (node?.widgets_values) node.widgets_values[idx] = value;
    }
    return wf;
  }

  validate(wf: WorkflowJSON): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!wf.nodes?.length) errors.push("No nodes defined");
    const outNodes = wf.nodes.filter(n => n.type?.includes("Save") || n.type?.includes("VHS_VideoCombine"));
    if (!outNodes.length) errors.push("No output node found (SaveImage/VHS_VideoCombine)");
    return { valid: errors.length === 0, errors };
  }

  getInputNodes(wf: WorkflowJSON): ComfyUINode[] {
    return wf.nodes.filter(n => ["LoadImage", "LoadCheckpoint", "CheckpointLoaderSimple"].some(t => n.type?.includes(t)));
  }

  getOutputNodes(wf: WorkflowJSON): ComfyUINode[] {
    return wf.nodes.filter(n => n.type?.includes("Save") || n.type?.includes("VHS_VideoCombine"));
  }
}
