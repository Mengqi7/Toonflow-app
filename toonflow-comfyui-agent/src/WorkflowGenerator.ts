import type { WorkflowJSON } from "./types";
export class WorkflowGenerator {
  async generate(description: string, template?: string, generateFn?: (p: string) => Promise<string>): Promise<WorkflowJSON> {
    if (!generateFn) return this.getFallback(description);
    const result = await generateFn("Generate ComfyUI workflow JSON: " + description + (template ? " Template: " + template : ""));
    try { const c = result.replace(/\x60\x60\x60json?\s*/g,"").replace(/\x60\x60\x60/g,"").trim(); return JSON.parse(c); } catch { return this.getFallback(description); }
  }
  private getFallback(d: string): WorkflowJSON { return { version:1, nodes:[{id:1,type:"CheckpointLoaderSimple",pos:[50,100],size:[315,98],widgets_values:["sd_xl_base_1.0.safetensors"]},{id:2,type:"CLIPTextEncode",pos:[50,250],size:[400,200],widgets_values:[d]},{id:3,type:"EmptyLatentImage",pos:[50,500],size:[315,106],widgets_values:[1024,1024,1]},{id:4,type:"KSampler",pos:[400,250],size:[315,262]},{id:5,type:"VAEDecode",pos:[800,250],size:[210,46]},{id:6,type:"SaveImage",pos:[1100,250],size:[315,270],widgets_values:["ComfyUI"]}],links:[[1,0,4,0],[2,0,4,1],[3,0,4,4],[4,0,5,0],[5,0,6,0]]}; }
}