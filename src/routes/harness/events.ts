/**
 * SSE 端点 — Harness 事件流推送
 *
 * GET /api/harness/events/stream?instanceId=<id>
 *
 * 职责:
 * 1. 建立 text/event-stream 连接
 * 2. 每 15s 发送心跳 (:heartbeat) 保持连接
 * 3. 支持 Last-Event-ID 重放 (断线重连时从上次中断处继续)
 * 4. 订阅 HarnessEventBus, 实时推送事件到前端
 */
import express from "express";
import { harnessEventBus } from "@/core/harness/HarnessEventBus";
import type { HarnessEvent } from "@/core/harness/types";

const router = express.Router();

const HEARTBEAT_INTERVAL_MS = 15000;

router.get("/stream", async (req: express.Request, res: express.Response) => {
  const instanceId = (req.query.instanceId as string) || "global";
  const lastEventId = (req.headers["last-event-id"] as string) || undefined;

  // 设置 SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",  // 禁用 nginx 缓冲
  });
  res.flushHeaders?.();

  // 发送初始注释 (防止代理超时)
  res.write(`: connected to instance ${instanceId}\n\n`);

  // 1. 重放历史事件 (如果客户端提供了 Last-Event-ID)
  try {
    const replayEvents = await harnessEventBus.replayEvents(instanceId, lastEventId);
    for (const event of replayEvents) {
      sendEvent(res, event);
    }
  } catch (err) {
    console.warn("[SSE] Failed to replay events:", err instanceof Error ? err.message : err);
  }

  // 2. 订阅实时事件
  const unsubscribe = harnessEventBus.subscribeInstance(instanceId, (event: HarnessEvent) => {
    try {
      sendEvent(res, event);
    } catch (err) {
      console.warn("[SSE] Failed to send event:", err instanceof Error ? err.message : err);
    }
  });

  // 3. 心跳定时器
  const heartbeatTimer = setInterval(() => {
    try {
      res.write(`:heartbeat\n\n`);
    } catch {
      // 连接已断开, 清理
      clearInterval(heartbeatTimer);
      unsubscribe();
    }
  }, HEARTBEAT_INTERVAL_MS);

  // 4. 客户端断开连接时清理
  req.on("close", () => {
    clearInterval(heartbeatTimer);
    unsubscribe();
    console.log(`[SSE] Client disconnected from instance ${instanceId}`);
  });

  console.log(`[SSE] Client connected to instance ${instanceId} (replay from: ${lastEventId || "none"})`);
});

/** 发送一个 SSE 事件 */
function sendEvent(res: express.Response, event: HarnessEvent): void {
  const data = JSON.stringify(event);
  res.write(`id: ${event.id}\n`);
  res.write(`event: ${event.kind}\n`);
  res.write(`data: ${data}\n\n`);
}

export default router;
