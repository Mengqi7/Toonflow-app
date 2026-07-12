import type { GenerationCapability, GenerationProviderAdapter } from "./types";

export class GenerationProviderRegistry {
  private readonly adapters = new Map<string, GenerationProviderAdapter>();
  private readonly defaults = new Map<GenerationCapability, string>();

  register(adapter: GenerationProviderAdapter, defaultsFor: GenerationCapability[] = []): void {
    if (this.adapters.has(adapter.id)) throw new Error(`Generation provider already registered: ${adapter.id}`);
    this.adapters.set(adapter.id, adapter);
    for (const capability of defaultsFor) {
      if (!adapter.capabilities.includes(capability)) throw new Error(`${adapter.id} does not support ${capability}`);
      this.defaults.set(capability, adapter.id);
    }
  }

  resolve(capability: GenerationCapability, providerId?: string): GenerationProviderAdapter {
    const id = providerId || this.defaults.get(capability);
    if (!id) throw new Error(`No generation provider configured for ${capability}`);
    const adapter = this.adapters.get(id);
    if (!adapter) throw new Error(`Generation provider is not registered: ${id}`);
    if (!adapter.capabilities.includes(capability)) throw new Error(`${id} does not support ${capability}`);
    return adapter;
  }

  list(): Array<{ id: string; capabilities: GenerationCapability[] }> {
    return [...this.adapters.values()].map(adapter => ({ id: adapter.id, capabilities: adapter.capabilities }));
  }
}
