import type { ComfyUIClient, GPUStats } from "./ComfyUIClient";

interface QueueState { tail: Promise<void>; }

/** Serializes GPU work per ComfyUI server and waits for a usable VRAM window. */
export class ResourceAwareScheduler {
  private readonly queues = new WeakMap<ComfyUIClient, QueueState>();

  async run<T>(client: ComfyUIClient, task: () => Promise<T>, options?: { requiredVramBytes?: number; timeoutMs?: number }): Promise<T> {
    const state = this.queues.get(client) || { tail: Promise.resolve() };
    this.queues.set(client, state);
    let release!: () => void;
    const turn = new Promise<void>(resolve => { release = resolve; });
    const previous = state.tail;
    state.tail = previous.then(() => turn);
    await previous;
    try {
      await this.waitForCapacity(client, options?.requiredVramBytes || 1024 * 1024 * 1024, options?.timeoutMs || 120000);
      return await task();
    } finally {
      release();
    }
  }

  private async waitForCapacity(client: ComfyUIClient, required: number, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const stats: GPUStats = await client.getSystemStats();
      if (!stats.vram_total || stats.vram_total - stats.vram_used >= required) return;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    throw new Error(`ComfyUI VRAM capacity unavailable after ${timeoutMs}ms`);
  }
}

export const resourceAwareScheduler = new ResourceAwareScheduler();
