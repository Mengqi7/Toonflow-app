import { v4 as uuid } from "uuid";
import Ai from "@/utils/ai";
import u from "@/utils";
import type { GenerationCapability, GenerationProviderAdapter, GenerationRequest, ProviderOperation, ReferenceList } from "./types";

export class ToonflowGenerationAdapter implements GenerationProviderAdapter {
  readonly id = "toonflow-configured-provider";
  readonly capabilities: GenerationCapability[] = ["text", "image", "video", "audio"];
  private readonly operations = new Map<string, ProviderOperation>();

  async submit(request: GenerationRequest, signal: AbortSignal): Promise<ProviderOperation> {
    const operationId = `provider-${uuid()}`;
    if (signal.aborted) return this.cancelled(operationId);
    let operation: ProviderOperation = { operationId, status: "running", progress: 5 };
    this.operations.set(operationId, operation);
    try {
      const model = request.model || await this.resolveModel(request);
      if (request.capability === "text") {
        const result = await Ai.Text(model as `${string}:${string}`).invoke({ messages: [{ role: "user", content: request.prompt }] });
        operation = { operationId, status: "completed", progress: 100, result: { artifactId: `artifact-${uuid()}`, capability: "text", text: result.text, provider: model.split(":")[0], model } };
      } else {
        const outputPath = await this.generateMedia(request, model as `${string}:${string}`, signal);
        operation = {
          operationId,
          status: "completed",
          progress: 100,
          result: {
            artifactId: `artifact-${uuid()}`,
            capability: request.capability,
            uri: outputPath,
            mimeType: request.capability === "image" ? "image/jpeg" : request.capability === "video" ? "video/mp4" : "audio/mpeg",
            provider: model.split(":")[0],
            model,
            metadata: { prompt: request.prompt, inputReferences: request.inputReferences || [] },
          },
        };
      }
    } catch (error) {
      operation = { operationId, status: signal.aborted ? "cancelled" : "failed", progress: 100, error: { code: signal.aborted ? "CANCELLED" : "TOONFLOW_PROVIDER_FAILED", message: error instanceof Error ? error.message : String(error), retryable: !signal.aborted } };
    }
    this.operations.set(operationId, operation);
    return operation;
  }

  async poll(operationId: string): Promise<ProviderOperation> {
    const operation = this.operations.get(operationId);
    if (!operation) throw new Error(`Provider operation not found: ${operationId}`);
    return operation;
  }

  async cancel(operationId: string): Promise<boolean> {
    if (!this.operations.has(operationId)) return false;
    this.operations.set(operationId, this.cancelled(operationId));
    return true;
  }

  private async generateMedia(request: GenerationRequest, model: `${string}:${string}`, signal: AbortSignal): Promise<string> {
    const project = await u.db("o_project").where("id", request.projectId).first();
    if (!project) throw new Error(`Project not found: ${request.projectId}`);
    const references = await this.loadReferences(request.inputReferences || []);
    if (signal.aborted) throw new Error("Operation cancelled");
    const outputPath = `/${request.projectId}/harness/${request.capability}/${uuid()}.${request.capability === "image" ? "jpg" : request.capability === "video" ? "mp4" : "mp3"}`;
    if (request.capability === "image") {
      const generator = Ai.Image(model);
      await generator.run({
        prompt: request.prompt,
        referenceList: references.filter(ref => ref.type === "image") as Extract<ReferenceList, { type: "image" }>[],
        size: (request.options?.size as "1K" | "2K" | "4K") || project.imageQuality || "1K",
        aspectRatio: (request.options?.aspectRatio as `${number}:${number}`) || project.videoRatio || "16:9",
      });
      if (signal.aborted) throw new Error("Operation cancelled");
      await generator.save(outputPath);
      return outputPath;
    }
    const config = {
      prompt: request.prompt,
      referenceList: references,
      duration: Number(request.options?.duration || 5),
      resolution: String(request.options?.resolution || "1080p"),
      aspectRatio: (request.options?.aspectRatio as "16:9" | "9:16") || project.videoRatio || "16:9",
      mode: (request.options?.mode as any) || (request.capability === "video" ? ["singleImage"] : ["text"]),
      audio: Boolean(request.options?.audio),
    };
    const generator = request.capability === "video" ? Ai.Video(model) : Ai.Audio(model);
    await generator.run(config as any);
    if (signal.aborted) throw new Error("Operation cancelled");
    await generator.save(outputPath);
    return outputPath;
  }

  private async resolveModel(request: GenerationRequest): Promise<string> {
    const project = await u.db("o_project").where("id", request.projectId).first();
    if (!project) throw new Error(`Project not found: ${request.projectId}`);
    if (request.capability === "image" && project.imageModel) return project.imageModel;
    if (request.capability === "video" && project.videoModel) return project.videoModel;
    if (request.capability === "audio") {
      const vendors = await u.db("o_vendorConfig").where("enable", 1);
      for (const vendor of vendors) {
        try {
          const models = JSON.parse(vendor.models || "[]");
          const tts = models.find((item: any) => item.type === "tts");
          if (tts?.modelName) return `${vendor.id}:${tts.modelName}`;
        } catch {}
      }
      throw new Error("No audio/TTS model configured");
    }
    const key = request.capability === "text" ? "universalAi" : undefined;
    if (!key) throw new Error(`No ${request.capability} model configured for project`);
    const deploy = await u.db("o_agentDeploy").where("key", key).first();
    if (!deploy?.modelName) throw new Error(`No ${request.capability} model configured`);
    return deploy.modelName;
  }

  private async loadReferences(refs: string[]): Promise<ReferenceList[]> {
    const result: ReferenceList[] = [];
    for (const ref of refs) {
      const [kind, rawId] = ref.split(":");
      let path: string | undefined;
      let type: "image" | "video" | "audio" = "image";
      if (kind === "shot") path = (await u.db("o_storyboard").where("id", Number(rawId)).first())?.filePath || undefined;
      else if (["character", "prop", "location", "artifact"].includes(kind)) {
        const row = await u.db("o_assets").leftJoin("o_image", "o_assets.imageId", "o_image.id").where("o_assets.id", Number(rawId)).select("o_image.filePath", "o_image.type").first();
        path = row?.filePath || undefined;
        type = row?.type === "audio" ? "audio" : "image";
      } else if (kind === "video") {
        path = (await u.db("o_video").where("id", Number(rawId)).first())?.filePath || undefined;
        type = "video";
      }
      if (!path) continue;
      result.push({ type, base64: await u.oss.getImageBase64(path) } as ReferenceList);
    }
    return result;
  }

  private cancelled(operationId: string): ProviderOperation {
    return { operationId, status: "cancelled", progress: 100, error: { code: "CANCELLED", message: "操作已取消", retryable: true } };
  }
}
