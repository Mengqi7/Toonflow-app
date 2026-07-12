import { v4 as uuid } from "uuid";
import { harnessEventBus } from "../HarnessEventBus";
import { entityId } from "../domain/ids";
import { GenerationJobStore, type GenerationJob } from "./GenerationJobStore";
import { GenerationProviderRegistry } from "./GenerationProviderRegistry";
import type { GenerationRequest, ProviderOperation } from "./types";

export class GenerationService {
  private readonly controllers = new Map<string, AbortController>();

  constructor(
    private readonly providers: GenerationProviderRegistry,
    private readonly jobs = new GenerationJobStore(),
  ) {}

  async submit(request: GenerationRequest, providerId?: string): Promise<GenerationJob> {
    const provider = this.providers.resolve(request.capability, providerId);
    const now = Date.now();
    let job: GenerationJob = {
      id: `gen-${uuid()}`,
      providerId: provider.id,
      request,
      status: "queued",
      progress: 0,
      createdAt: now,
      updatedAt: now,
    };
    await this.jobs.save(job);
    const controller = new AbortController();
    this.controllers.set(job.id, controller);
    try {
      const operation = await provider.submit(request, controller.signal);
      job = this.applyOperation(job, operation);
      await this.jobs.save(job);
      await this.emitStatus(job);
      return job;
    } catch (error) {
      job.status = controller.signal.aborted ? "cancelled" : "failed";
      job.error = { code: controller.signal.aborted ? "CANCELLED" : "PROVIDER_SUBMIT_FAILED", message: error instanceof Error ? error.message : String(error), retryable: !controller.signal.aborted };
      job.updatedAt = Date.now();
      await this.jobs.save(job);
      await this.emitStatus(job);
      return job;
    }
  }

  async poll(jobId: string): Promise<GenerationJob> {
    const job = await this.requireJob(jobId);
    if (!job.operationId || ["completed", "failed", "cancelled"].includes(job.status)) return job;
    const provider = this.providers.resolve(job.request.capability, job.providerId);
    const controller = this.controllers.get(job.id) || new AbortController();
    this.controllers.set(job.id, controller);
    const updated = this.applyOperation(job, await provider.poll(job.operationId, controller.signal));
    await this.jobs.save(updated);
    await this.emitStatus(updated);
    if (["completed", "failed", "cancelled"].includes(updated.status)) this.controllers.delete(job.id);
    return updated;
  }

  async cancel(jobId: string): Promise<GenerationJob> {
    const job = await this.requireJob(jobId);
    this.controllers.get(job.id)?.abort();
    if (job.operationId) {
      const provider = this.providers.resolve(job.request.capability, job.providerId);
      await provider.cancel(job.operationId);
    }
    job.status = "cancelled";
    job.updatedAt = Date.now();
    await this.jobs.save(job);
    await this.emitStatus(job);
    this.controllers.delete(job.id);
    return job;
  }

  private applyOperation(job: GenerationJob, operation: ProviderOperation): GenerationJob {
    return {
      ...job,
      operationId: operation.operationId,
      status: operation.status,
      progress: Math.max(0, Math.min(100, operation.progress)),
      result: operation.result,
      error: operation.error,
      updatedAt: Date.now(),
    };
  }

  private async requireJob(id: string): Promise<GenerationJob> {
    const job = await this.jobs.get(id);
    if (!job) throw new Error(`Generation job not found: ${id}`);
    return job;
  }

  private async emitStatus(job: GenerationJob): Promise<void> {
    await harnessEventBus.emitWorkbenchEvent({
      kind: "generation.status_changed",
      actionRunId: job.request.actionRunId,
      instanceId: job.request.actionRunId,
      projectId: entityId("project", job.request.projectId),
      payload: { jobId: job.id, providerId: job.providerId, operationId: job.operationId, status: job.status, progress: job.progress, result: job.result, error: job.error },
    });
  }
}
