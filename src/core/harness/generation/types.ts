export type GenerationCapability = "text" | "image" | "video" | "audio";
export type GenerationJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface GenerationRequest {
  capability: GenerationCapability;
  projectId: number;
  actionRunId: string;
  prompt: string;
  negativePrompt?: string;
  model?: string;
  inputReferences?: string[];
  options?: Record<string, unknown>;
}

export interface GenerationArtifactResult {
  artifactId: string;
  capability: GenerationCapability;
  uri?: string;
  text?: string;
  mimeType?: string;
  provider: string;
  model: string;
  metadata?: Record<string, unknown>;
}

export interface ProviderOperation {
  operationId: string;
  status: GenerationJobStatus;
  progress: number;
  result?: GenerationArtifactResult;
  error?: { code: string; message: string; retryable: boolean };
}

export interface GenerationProviderAdapter {
  readonly id: string;
  readonly capabilities: GenerationCapability[];
  submit(request: GenerationRequest, signal: AbortSignal): Promise<ProviderOperation>;
  poll(operationId: string, signal: AbortSignal): Promise<ProviderOperation>;
  cancel(operationId: string): Promise<boolean>;
}

export type ReferenceList =
  | { type: "image"; base64: string }
  | { type: "audio"; base64: string }
  | { type: "video"; base64: string };
