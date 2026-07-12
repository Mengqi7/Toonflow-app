import { computed, onBeforeUnmount, ref, type Ref } from "vue";

export type HarnessEventKind =
  | "director.message"
  | "director.user_input"
  | "director.user_input_required"
  | "task.started"
  | "task.progress"
  | "task.completed"
  | "task.failed"
  | "review.started"
  | "review.scored"
  | "review.reroute"
  | "callback.persisted"
  | "callback.failed"
  | "version.created"
  | string;

export interface HarnessEvent {
  id: string;
  instanceId: string;
  kind: HarnessEventKind;
  createdAt?: string;
  timestamp?: number;
  payload?: Record<string, any>;
}

export function useHarnessEventStream(instanceId: Ref<string>) {
  const events = ref<HarnessEvent[]>([]);
  const connected = ref(false);
  const connecting = ref(false);
  const error = ref("");
  const lastEventId = ref("");
  const seenIds = new Set<string>();
  let source: EventSource | null = null;
  const serverEventKinds: HarnessEventKind[] = [
    "director.message",
    "director.user_input_required",
    "task.started",
    "task.progress",
    "task.completed",
    "task.failed",
    "review.started",
    "review.scored",
    "review.reroute",
    "callback.persisted",
    "callback.failed",
    "version.created",
    "harness.completed",
    "harness.failed",
  ];

  const latestEvent = computed(() => events.value[events.value.length - 1]);

  function normalizeEvent(raw: any): HarnessEvent {
    const reserved = new Set(["id", "instanceId", "kind", "createdAt", "timestamp", "payload"]);
    const payload = raw?.payload && typeof raw.payload === "object" ? { ...raw.payload } : {};
    for (const [key, value] of Object.entries(raw || {})) {
      if (!reserved.has(key)) payload[key] = value;
    }
    const timestamp = typeof raw?.timestamp === "number" ? raw.timestamp : undefined;
    return {
      id: String(raw?.id || `event-${Date.now()}-${Math.random().toString(16).slice(2)}`),
      instanceId: String(raw?.instanceId || instanceId.value),
      kind: String(raw?.kind || "message"),
      createdAt: raw?.createdAt || (timestamp ? new Date(timestamp).toISOString() : new Date().toISOString()),
      timestamp,
      payload,
    };
  }

  function appendEvent(event: HarnessEvent) {
    if (!event.id || seenIds.has(event.id)) return;
    seenIds.add(event.id);
    lastEventId.value = event.id;
    events.value = [...events.value, normalizeEvent(event)];
  }

  function parseMessage(message: MessageEvent) {
    try {
      appendEvent(JSON.parse(message.data));
    } catch (err) {
      error.value = err instanceof Error ? err.message : "事件解析失败";
    }
  }

  function connect() {
    if (!instanceId.value || source || connecting.value) return;
    connecting.value = true;
    error.value = "";

    const params = new URLSearchParams({ instanceId: instanceId.value });
    if (lastEventId.value) params.set("lastEventId", lastEventId.value);

    source = new EventSource(`/api/harness/events/stream?${params.toString()}`);
    source.onopen = () => {
      connected.value = true;
      connecting.value = false;
    };
    source.onerror = () => {
      connected.value = false;
      connecting.value = false;
      error.value = "事件流连接中断，正在等待浏览器自动重连";
    };
    source.onmessage = parseMessage;
    for (const kind of serverEventKinds) {
      source.addEventListener(kind, parseMessage as EventListener);
    }
  }

  function disconnect() {
    source?.close();
    source = null;
    connected.value = false;
    connecting.value = false;
  }

  function pushLocalEvent(event: Omit<HarnessEvent, "id" | "instanceId"> & Partial<Pick<HarnessEvent, "id" | "instanceId">>) {
    appendEvent({
      id: event.id ?? `local-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      instanceId: event.instanceId ?? instanceId.value,
      createdAt: event.createdAt ?? new Date().toISOString(),
      kind: event.kind,
      payload: event.payload ?? {},
    });
  }

  onBeforeUnmount(disconnect);

  return {
    events,
    latestEvent,
    connected,
    connecting,
    error,
    connect,
    disconnect,
    pushLocalEvent,
  };
}
