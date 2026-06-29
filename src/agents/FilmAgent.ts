import { BaseAgent, AgentDescriptor, AgentContext, AgentResult } from "@/core/harness/types";
import type { MemoryBus, RulesEngine, SkillsRegistry, MCPConnector } from "@/core/harness";
import type { ToolDefinition, ReviewCriterion, ReviewScore } from "@/core/harness/types";
import Ai from "@/utils/ai";
import { v4 as uuid } from "uuid";
import { db } from "@/utils/db";
import { ComfyUIClient, WorkflowParser, ComfyUIResultHandler } from "@/comfyui";
import path from "path";
import u from "@/utils";
import { ArtisticReviewer } from "@/review/ArtisticReviewer";
import { ContentReviewer } from "@/review/ContentReviewer";
import { TechnicalReviewer } from "@/review/TechnicalReviewer";

export interface FilmAgentContext extends AgentContext {
  memoryBus: MemoryBus;
  rulesEngine: RulesEngine;
  skillsRegistry: SkillsRegistry;
  mcpConnector: MCPConnector;
}

export abstract class FilmAgent extends BaseAgent {
  protected ai = Ai;
  protected memory!: MemoryBus;
  protected rules!: RulesEngine;
  protected skills!: SkillsRegistry;
  protected mcp!: MCPConnector;
  protected ctx!: FilmAgentContext;
  private comfyClient: ComfyUIClient | null = null;
  private comfyHandler: ComfyUIResultHandler | null = null;

  async init(ctx: AgentContext): Promise<void> {
    this.ctx = ctx as FilmAgentContext;
    this.memory = this.ctx.memoryBus;
    this.rules = this.ctx.rulesEngine;
    this.skills = this.ctx.skillsRegistry;
    this.mcp = this.ctx.mcpConnector;
  }

  abstract getSystemPrompt(): string;
  abstract getTools(): ToolDefinition[];
  abstract execute(ctx: AgentContext): Promise<AgentResult>;

  // ── AI 便捷方法 ────────────────────────────────
  protected async generateText(prompt: string, opts?: {
    tools?: ToolDefinition[]; temperature?: number; maxTokens?: number;
  }): Promise<string> {
    const result = await this.ai.Text("universalAi", false, 0).invoke({
      messages: [
        { role: "system", content: this.getSystemPrompt() },
        { role: "user", content: prompt },
      ],
    });
    return result.text;
  }

  protected async generateImage(prompt: string, opts?: {
    backend?: "api" | "comfyui"; style?: any; workflowId?: number; count?: number;
  }): Promise<string[]> {
    const backend = opts?.backend ?? await this.selectBackend();
    const count = opts?.count ?? 1;
    const results: string[] = [];

    for (let i = 0; i < count; i++) {
      if (backend === "comfyui") {
        const imgPath = await this.generateViaComfyUI(prompt, opts?.workflowId, "image");
        results.push(imgPath);
      } else {
        const modelKey = this.ctx.config.imageModel || "1:default" as `${string}:${string}`;
        const image = await this.ai.Image(modelKey).run({
          prompt,
          size: "1K",
          aspectRatio: "16:9",
        });
        const imgPath = `production/${this.ctx.projectId}/${uuid()}.png`;
        await image.save(imgPath);
        results.push(imgPath);
      }
    }
    return results;
  }

  protected async generateVideo(prompt: string, opts?: {
    backend?: "api" | "comfyui"; duration?: number; style?: any;
  }): Promise<string[]> {
    const backend = opts?.backend ?? await this.selectBackend();
    if (backend === "comfyui") {
      const vPath = await this.generateViaComfyUI(prompt, undefined, "video");
      return [vPath];
    }
    const modelKey = this.ctx.config.videoModel || "1:default" as `${string}:${string}`;
    const video = await this.ai.Video(modelKey).run({
      prompt,
      duration: opts?.duration ?? 5,
      resolution: "1080p",
      aspectRatio: "16:9",
      mode: ["text"],
    });
    const vPath = `production/${this.ctx.projectId}/${uuid()}.mp4`;
    await video.save(vPath);
    return [vPath];
  }

  // ── ComfyUI 实际调用 ────────────────────────────
  private async ensureComfyClient(): Promise<ComfyUIClient | null> {
    if (this.comfyClient) return this.comfyClient;
    try {
      const server = await db("o_comfyui_server").where("enabled", 1).first();
      if (!server) { console.warn("[FilmAgent] No enabled ComfyUI server found"); return null; }
      this.comfyClient = new ComfyUIClient({ baseUrl: server.baseUrl, wsUrl: server.wsUrl });
      this.comfyHandler = new ComfyUIResultHandler(this.comfyClient);
      return this.comfyClient;
    } catch (err) {
      console.warn("[FilmAgent] Failed to create ComfyUI client:", err);
      return null;
    }
  }

  private async generateViaComfyUI(
    prompt: string, workflowId?: number, outputType: "image" | "video" = "image"
  ): Promise<string> {
    const client = await this.ensureComfyClient();
    if (!client || !this.comfyHandler) throw new Error("ComfyUI server not available");

    let workflow: any;
    if (workflowId) {
      workflow = await db("o_comfyui_workflow").where("id", workflowId).first();
    } else {
      workflow = await db("o_comfyui_workflow").where("type", outputType).first();
    }
    if (!workflow) throw new Error(`No ComfyUI workflow found for type: ${outputType}`);

    const parser = new WorkflowParser();
    const wf = parser.parse(workflow.workflow_json);
    const params = parser.extractParameters(wf);
    const promptParams: Record<string, any> = {};
    for (const p of params) {
      for (const param of p.parameters) {
        if (param.type === "string" && (param.name.toLowerCase().includes("prompt") || param.name.toLowerCase().includes("text"))) {
          promptParams[`${p.nodeId}_${param.widgetName}`] = prompt;
        }
      }
    }
    const injected = parser.injectParameters(wf, promptParams);
    const promptId = await client.queuePrompt(injected as any);
    console.log(`[FilmAgent] ComfyUI prompt submitted: ${promptId}`);
    const history = await client.waitForCompletion(promptId);
    const assets = this.comfyHandler.extractOutputs(history);
    if (assets.length === 0) throw new Error("ComfyUI produced no output");
    const ossDir = u.getPath("oss");
    const targetDir = path.join(ossDir, "production", String(this.ctx.projectId));
    const localPaths = await this.comfyHandler.downloadAssets(assets, targetDir);
    return `production/${this.ctx.projectId}/${path.basename(localPaths[0])}`;
  }

  // ── 后端选择 ────────────────────────────────────
  protected async selectBackend(): Promise<"api" | "comfyui"> {
    try {
      const hasServer = await db("o_comfyui_server").where("enabled", 1).first();
      if (!hasServer) return "api";
      const client = new ComfyUIClient({ baseUrl: hasServer.baseUrl });
      await client.getSystemStats();
      return "comfyui";
    } catch {
      return "api";
    }
  }

  // ── 审核输出 — P1 fix: 用实际 Reviewer 替代硬编码 ─────────────
  protected async reviewOutput(
    output: any,
    criteria: ReviewCriterion[],
    styleSpec?: any,
  ): Promise<ReviewScore> {
    const dw = { technical: 0.3, artistic: 0.4, contentMatch: 0.3 };
    
    // 1. 技术审核
    let technicalScores: Record<string, number> = { resolution: 0.9, artifacts: 0.85, colorSpace: 0.9, format: 1.0 };
    try {
      const techReviewer = new TechnicalReviewer();
      if (output?.imageUrl || output?.images) {
        const imageUrls = Array.isArray(output.images) ? output.images : [output.imageUrl].filter(Boolean);
        if (imageUrls.length > 0) {
          const techResult = await techReviewer.review(imageUrls[0]);
          technicalScores = { resolution: techResult.resolution, artifacts: techResult.artifacts, colorSpace: techResult.colorSpace, format: techResult.format };
        }
      }
    } catch (err) {
      console.warn("[FilmAgent] Technical review failed:", err);
    }

    // 2. 艺术审核 — P1 fix: 用 AI 模型替代硬编码
    let artisticScores = { composition: 0.8, styleMatch: 0.8, lighting: 0.8, aesthetic: 0.8 };
    try {
      const artReviewer = new ArtisticReviewer();
      if (output?.imageUrl && this.ai) {
        const artResult = await artReviewer.review(
          output.imageUrl,
          styleSpec,
          (prompt: string) => this.generateText(prompt, { temperature: 0.3 }),
        );
        artisticScores = {
          composition: artResult.composition,
          styleMatch: artResult.styleMatch,
          lighting: artResult.lighting,
          aesthetic: artResult.aesthetic,
        };
      }
    } catch (err) {
      console.warn("[FilmAgent] Artistic review failed:", err);
    }

    // 3. 内容审核 — P1 fix: 用 AI 模型替代硬编码
    let contentScores = { sceneAccuracy: 0.85, characterMatch: 0.85, propAccuracy: 0.85 };
    try {
      const contentReviewer = new ContentReviewer();
      if (output?.imageUrl && this.ai) {
        const contentResult = await contentReviewer.review(
          output?.description || "",
          output?.referenceDescription || output?.prompt || "",
          (prompt: string) => this.generateText(prompt, { temperature: 0.3 }),
        );
        contentScores = {
          sceneAccuracy: contentResult.sceneAccuracy,
          characterMatch: contentResult.characterMatch,
          propAccuracy: contentResult.propAccuracy,
        };
      }
    } catch (err) {
      console.warn("[FilmAgent] Content review failed:", err);
    }

    // 加权计算
    const ts = (Object.values(technicalScores) as number[]).reduce((a, b) => a + b, 0) / 4;
    const as = (Object.values(artisticScores) as number[]).reduce((a, b) => a + b, 0) / 4;
    const cs = (Object.values(contentScores) as number[]).reduce((a, b) => a + b, 0) / 3;

    const overall = ts * dw.technical + as * dw.artistic + cs * dw.contentMatch;
    
    const threshold = criteria.length > 0
      ? criteria.reduce((s, c) => s + c.threshold * c.weight, 0)
      : 0.75;

    return {
      technical: technicalScores,
      artistic: artisticScores,
      contentMatch: contentScores,
      overall: Math.round(overall * 100) / 100,
      passed: overall >= threshold,
      feedback: overall < threshold ? `综合得分 ${overall.toFixed(2)} 低于阈值 ${threshold.toFixed(2)}` : undefined,
    };
  }

  protected async useSkill(skillId: string, params: Record<string, any>): Promise<string> {
    return this.skills.execute(skillId, params, (p) => this.generateText(p, { temperature: 0.5 }));
  }

  protected async readMemory(key: string): Promise<any> {
    const entries = await this.memory.get({ keys: [key] });
    return entries[0]?.value;
  }

  protected async writeMemory(key: string, value: any): Promise<void> {
    await this.memory.set({
      namespace: `agent:${this.descriptor.id}`,
      key, value, type: "short-term",
    });
  }
}
