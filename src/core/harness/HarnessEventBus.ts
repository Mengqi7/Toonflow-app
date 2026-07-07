/**
 * HarnessEventBus — Harness 事件总线
 *
 * 职责:
 * 1. 基于 Node EventEmitter 广播 11 种 HarnessEvent
 * 2. 事件持久化到 o_memory (namespace: event:<instanceId>) 供 SSE 重放
 * 3. 单例注入到 harness 全局对象
 * 4. 支持按 instanceId 订阅/取消订阅
 */
import { EventEmitter } from "events";
import { v4 as uuid } from "uuid";
import type { HarnessEvent } from "./types";

export class HarnessEventBus extends EventEmitter {
  private static _instance: HarnessEventBus | null = null;
  private memoryBus: any = null;
  private persisted = new Set<string>();  // 已持久化的事件 id, 避免重复写入

  static getInstance(): HarnessEventBus {
    if (!HarnessEventBus._instance) {
      HarnessEventBus._instance = new HarnessEventBus();
    }
    return HarnessEventBus._instance;
  }

  /** 注入 MemoryBus 用于事件持久化 */
  setMemoryBus(memoryBus: any): void {
    this.memoryBus = memoryBus;
  }

  /**
   * 发出事件并持久化
   * @param event 不含 id/timestamp 的事件部分, 本方法自动补充
   */
  async emitEvent(partial: Omit<HarnessEvent, "id" | "timestamp">): Promise<string> {
    const event: HarnessEvent = {
      ...partial,
      id: `evt-${uuid()}`,
      timestamp: Date.now(),
    } as HarnessEvent;

    // 1. 同步广播给本地监听器 (SSE 端点等)
    this.emit(event.kind, event);
    this.emit("*", event);  // 通配监听

    // 2. 异步持久化到 o_memory (供 SSE 断线重连重放)
    this.persistEvent(event).catch(err => {
      console.warn("[HarnessEventBus] Failed to persist event:", err instanceof Error ? err.message : err);
    });

    return event.id;
  }

  /** 持久化事件到 MemoryBus */
  private async persistEvent(event: HarnessEvent): Promise<void> {
    if (this.persisted.has(event.id)) return;
    this.persisted.add(event.id);

    if (!this.memoryBus) return;
    const instanceId = (event as any).instanceId || "global";
    await this.memoryBus.set({
      namespace: `event:${instanceId}`,
      key: event.id,
      value: JSON.stringify(event),
      type: "event",
    });
  }

  /**
   * 重放某 instanceId 的历史事件 (供 SSE 断线重连)
   * @param instanceId 实例 ID
   * @param afterEventId 仅返回 id 在此之后的事件 (Last-Event-ID)
   * @returns 历史事件数组
   */
  async replayEvents(instanceId: string, afterEventId?: string): Promise<HarnessEvent[]> {
    if (!this.memoryBus) return [];
    const entries = await this.memoryBus.get({
      namespaces: [`event:${instanceId}`],
      type: "event",
      limit: 1000,
    });
    // 按时间排序
    const events: HarnessEvent[] = entries
      .map(e => {
        try { return typeof e.value === "string" ? JSON.parse(e.value) : e.value; }
        catch { return null; }
      })
      .filter(e => e && e.id && e.kind && e.timestamp)
      .sort((a, b) => a.timestamp - b.timestamp);

    if (!afterEventId) return events;

    // 找到 afterEventId 的位置, 返回之后的事件
    const idx = events.findIndex(e => e.id === afterEventId);
    if (idx < 0) return events;  // 未找到, 返回全部
    return events.slice(idx + 1);
  }

  /** 订阅某 instanceId 的事件 (返回取消订阅函数) */
  subscribeInstance(instanceId: string, handler: (event: HarnessEvent) => void): () => void {
    const filtered = (event: HarnessEvent) => {
      if ((event as any).instanceId === instanceId || (event as any).instanceId === undefined) {
        handler(event);
      }
    };
    this.on("*", filtered);
    return () => { this.off("*", filtered); };
  }
}

/** 全局单例 */
export const harnessEventBus = HarnessEventBus.getInstance();
