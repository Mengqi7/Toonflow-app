import type { VisualStyleSpec } from "@/agents/director/DirectorAgent";

export interface InferenceStep { name: string; input: string; instructions: string; }

export class StyleInferenceChain {
  static readonly STEPS: InferenceStep[] = [
    { name: "analyze_genre", input: "script", instructions: "识别剧本的题材类型和时代背景，列出典型视觉特征。" },
    { name: "analyze_mood", input: "script", instructions: "分析情绪氛围，映射为视觉参数。" },
    { name: "generate_spec", input: "previous_steps", instructions: "综合前两步，输出 VisualStyleSpec JSON。" },
  ];

  static async infer(generateText: (p: string, o?: any) => Promise<string>, script: string): Promise<VisualStyleSpec> {
    const g1 = await generateText(this.STEPS[0].instructions + "\n" + script.slice(0, 6000), { temperature: 0.4 });
    const g2 = await generateText(this.STEPS[1].instructions + "\n" + script.slice(0, 6000), { temperature: 0.4 });
    const g3 = await generateText(this.STEPS[2].instructions + "\n分析:\n" + g1 + "\n情绪:\n" + g2 + "\n输出纯JSON:", { temperature: 0.5 });
    try { const cleaned = g3.replace(/```json?\s*/g, "").replace(/```/g, "").trim(); return JSON.parse(cleaned); } catch {
      return { colorPalette: { primary: "#2C3E50", secondary: "#34495E", accent: "#E74C3C", temperature: "cool", saturation: "medium" },
        lighting: { style: "mixed", keyLightDirection: "top-right-45deg", contrastRatio: "high" },
        composition: { preferredShotTypes: ["medium","close-up"], ruleOfThirds: true, symmetry: false, depthOfField: "shallow" },
        camera: { movement: ["static","dolly"], preferredAngles: ["eye-level"], lensPreference: ["35mm","50mm"] } };
    }
  }
}
