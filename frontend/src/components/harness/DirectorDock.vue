<template>
  <aside class="director-dock" :class="{ collapsed: !isOpen, resizing: isResizing }" :style="dockStyle">
    <button v-if="!isOpen" class="dock-rail" type="button" title="打开 AI Director" @click="isOpen = true">
      <i-robot-one />
      <span v-if="running" class="activity-dot"></span>
    </button>

    <template v-else>
      <div class="dock-resizer" title="拖动调整 AI Director 宽度" @mousedown.prevent="startResize"></div>
      <header class="dock-header">
        <div class="director-identity">
          <span class="director-mark"><i-robot-one /></span>
          <div>
            <strong>AI Director</strong>
            <span><i :class="['connection-dot', { online: connected }]"></i>{{ connected ? "实时连接" : "按需执行" }}</span>
          </div>
        </div>
        <div class="header-actions">
          <button type="button" :class="{ active: autoPilot }" :title="autoPilot ? '自动推进已开启' : '自动推进已关闭'" @click="autoPilot = !autoPilot"><i-play /></button>
          <button type="button" title="查看 Agent 能力" @click="showCapabilities = !showCapabilities"><i-people /></button>
          <button type="button" title="清空对话" @click="clearMessages"><i-delete /></button>
          <button type="button" title="收起" @click="isOpen = false"><i-right /></button>
        </div>
      </header>

      <section class="context-strip">
        <span>{{ domainLabel }}</span>
        <span v-if="episodeId">剧集 {{ episodeId }}</span>
        <span v-if="selected.length">已选 {{ selected.length }}</span>
      </section>

      <section v-if="showCapabilities" class="capability-panel">
        <header><strong>Director 能力</strong><span>{{ enabledCapabilities.length }}/{{ capabilities.length }} 可用</span></header>
        <div class="capability-list">
          <details v-for="item in capabilities" :key="item.stage" class="capability-item" :class="{ disabled: !item.enabled }">
            <span class="capability-state"></span>
            <div><strong>{{ item.agentName }}</strong><span>{{ item.skillName }}</span><code>{{ item.modelName || "未配置模型" }}</code></div>
            <div class="capability-detail">
              <span>Role: {{ item.harnessRole }}</span>
              <span>Source: {{ item.source }}</span>
              <span>Capabilities: {{ item.capabilities.join(", ") || "none" }}</span>
              <pre>{{ item.systemPrompt || item.skillContent || "No configured prompt" }}</pre>
            </div>
          </details>
        </div>
      </section>

      <div ref="messageList" class="message-list">
        <article v-for="message in messages" :key="message.id" class="director-message" :class="message.role">
          <div class="message-meta">{{ message.role === "user" ? "你" : "Director" }} · {{ formatTime(message.createdAt) }}</div>
          <div class="message-content">{{ message.content }}</div>

          <section v-if="message.actionRun" class="action-evidence">
            <header>
              <span :class="['run-status', message.actionRun.status]">{{ statusLabel(message.actionRun.status) }}</span>
              <code>{{ message.actionRun.id.slice(0, 18) }}</code>
            </header>
            <div class="plan-summary">{{ message.actionRun.plan.summary }}</div>
            <div v-for="step in message.actionRun.plan.steps" :key="step.toolName" class="tool-row">
              <i-check-one v-if="message.actionRun.status === 'completed'" />
              <i-loading-one v-else-if="message.actionRun.status === 'running'" />
              <i-caution v-else-if="message.actionRun.status === 'failed'" />
              <i-time v-else />
              <div><code>{{ step.toolName }}</code><span>{{ step.purpose }}</span></div>
            </div>
            <div v-if="activeProgress(message.actionRun)" class="run-progress">
              <div><span>{{ activeProgress(message.actionRun)?.message }}</span><strong>{{ activeProgress(message.actionRun)?.percent }}%</strong></div>
              <i><b :style="{ width: `${activeProgress(message.actionRun)?.percent || 0}%` }"></b></i>
            </div>
            <div v-if="liveEventsFor(message.actionRun).length" class="live-events">
              <div v-for="event in liveEventsFor(message.actionRun)" :key="event.id" :class="['live-event', event.level]">
                <span>{{ event.time }}</span>
                <strong>{{ event.title }}</strong>
                <p>{{ event.detail }}</p>
              </div>
            </div>
            <div v-if="delegatedSteps(message.actionRun).length" class="delegated-steps">
              <div v-for="step in delegatedSteps(message.actionRun)" :key="`${step.role}-${step.tool}`" class="delegated-row">
                <span :class="['delegated-state', step.status]"></span>
                <div><strong>{{ step.role }}</strong><code>{{ step.tool }}</code><span>{{ step.detail }}</span></div>
              </div>
            </div>
            <dl v-if="message.actionRun.result" class="result-grid">
              <div v-if="message.actionRun.result.stage"><dt>阶段</dt><dd>{{ message.actionRun.result.stage }}</dd></div>
              <div v-if="message.actionRun.result.entity"><dt>对象</dt><dd>{{ message.actionRun.result.entity.label || message.actionRun.result.entity.id }}</dd></div>
              <div v-if="message.actionRun.result.version"><dt>版本</dt><dd>v{{ message.actionRun.result.version }}</dd></div>
              <div v-if="message.actionRun.result.changedFields"><dt>字段</dt><dd>{{ message.actionRun.result.changedFields.join("、") }}</dd></div>
              <div v-if="message.actionRun.result.artifactIds?.length"><dt>产物</dt><dd>{{ message.actionRun.result.artifactIds.length }} 项</dd></div>
              <div v-if="message.actionRun.result.nextAction"><dt>下一步</dt><dd>{{ message.actionRun.result.nextAction }}</dd></div>
            </dl>
            <div v-if="reviewEvidence(message.actionRun).length" class="review-evidence">
              <div v-for="review in reviewEvidence(message.actionRun)" :key="review.reviewId || `${review.artifactType}-${review.artifactId}`" :class="['review-row', { rejected: review.score?.passed === false }]">
                <header><strong>{{ review.reviewer || "Quality Supervisor" }}</strong><span>{{ scoreLabel(review.score?.overall) }}</span></header>
                <p>{{ review.score?.passed === false ? "未通过" : "通过" }} · {{ review.label || review.artifactId }} · 第 {{ review.attemptNumber || 1 }} 次 · {{ review.score?.evaluationMode === "ai" ? "AI 评审" : "规则降级" }} · 标准 {{ review.criteriaAgent || review.reviewer }}</p>
                <ul v-if="review.score?.issues?.length"><li v-for="issue in review.score.issues" :key="issue">{{ issue }}</li></ul>
                <p v-if="review.score?.feedback" class="review-feedback">返工：{{ review.score.feedback }}</p>
                <p v-if="review.error" class="review-feedback">审核错误：{{ review.error }}</p>
              </div>
            </div>
            <p v-if="message.actionRun.error" class="run-error">{{ message.actionRun.error.message }}</p>
            <div v-if="message.actionRun.status === 'awaiting_confirmation'" class="confirm-actions">
              <button type="button" class="confirm-primary" :disabled="running" @click="confirmRun(message)">确认执行</button>
              <button type="button" :disabled="running" @click="cancelRun(message.actionRun)">取消</button>
            </div>
            <div v-else-if="message.actionRun.status === 'failed' && message.actionRun.error?.retryable" class="confirm-actions">
              <button type="button" class="confirm-primary" :disabled="running" @click="retryRun(message.actionRun)">重试</button>
            </div>
          </section>
        </article>
        <div v-if="running" class="director-thinking"><span></span><span></span><span></span></div>
      </div>

      <footer class="director-input">
        <div v-if="selected.length" class="selection-chip">
          <i-link-one />
          <span>{{ selectedSummary }}</span>
          <button type="button" title="清除选择" @click="setSelection([])"><i-close-small /></button>
        </div>
        <textarea
          v-model="draft"
          rows="3"
          :placeholder="inputPlaceholder"
          :disabled="running || !projectId"
          @keydown.enter.exact.prevent="send" />
        <div class="input-actions">
          <span>{{ projectId ? domainLabel : "请先选择项目" }}</span>
          <button type="button" class="send-button" title="发送" :disabled="running || !draft.trim() || !projectId" @click="send">
            <i-send />
          </button>
        </div>
      </footer>
    </template>
  </aside>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import axios from "@/utils/axios";
import settingStore from "@/stores/setting";
import harnessWorkbenchStore, { type DirectorMessage, type HarnessActionRun } from "@/stores/harnessWorkbench";

const props = defineProps<{ projectId?: string | number; routePath: string }>();
const store = harnessWorkbenchStore();
const { clearMessages, setSelection } = store;
const { isOpen, domain, episodeId, selected, visible, messages, running, connected, selectedSummary } = storeToRefs(store);
const { baseUrl } = storeToRefs(settingStore());
const draft = ref("");
const messageList = ref<HTMLElement>();
const showCapabilities = ref(false);
const capabilities = ref<DirectorCapability[]>([]);
const isResizing = ref(false);
const dockWidth = ref(Number(localStorage.getItem("toonflow.directorDockWidth")) || 390);
const autoPilot = ref(localStorage.getItem("toonflow.directorAutoPilot") === "true");
const liveEvents = ref<Record<string, Array<{ id: string; level: "info" | "success" | "error"; time: string; title: string; detail: string }>>>({});
let eventSource: EventSource | null = null;
let projectLoadVersion = 0;

interface DirectorCapability {
  stage: string;
  agentName: string;
  skillName: string;
  modelName: string;
  enabled: boolean;
  harnessRole: string;
  source: string;
  capabilities: string[];
  systemPrompt?: string;
  skillContent?: string;
}

const domainLabels: Record<string, string> = {
  script: "剧本",
  beats: "节拍",
  scenes: "场次",
  characters: "人物",
  props: "道具",
  locations: "地点",
  storyboard: "分镜",
  video: "视频",
  assets: "资产",
};
const domainLabel = computed(() => domainLabels[domain.value] || domain.value);
const inputPlaceholder = computed(() => selected.value.length ? `修改${selectedSummary.value}...` : `在${domainLabel.value}阶段下达指令...`);
const instanceId = computed(() => `workbench-${props.projectId || "none"}`);
const apiBaseUrl = computed(() => {
  const raw = String(baseUrl.value || "").replace(/\/$/, "");
  return /\/api$/.test(raw) ? raw : `${raw}/api`;
});
const enabledCapabilities = computed(() => capabilities.value.filter(item => item.enabled));
const dockStyle = computed(() => ({ width: `${isOpen.value ? dockWidth.value : 48}px`, minWidth: `${isOpen.value ? dockWidth.value : 48}px` }));

watch(autoPilot, value => localStorage.setItem("toonflow.directorAutoPilot", String(value)));

watch(() => props.routePath, path => store.syncRoute(path), { immediate: true });
watch([() => props.projectId, baseUrl], ([projectId]) => {
  void initializeProject(projectId);
}, { immediate: true });
watch(() => messages.value.length, async () => {
  await nextTick();
  if (messageList.value) messageList.value.scrollTop = messageList.value.scrollHeight;
});

async function send() {
  const message = draft.value.trim();
  if (!message || !props.projectId || running.value) return;
  draft.value = "";
  store.addMessage({ id: `user-${Date.now()}`, role: "user", content: message, createdAt: Date.now() });
  await execute(message, false, createRequestId());
}

async function initializeProject(projectId?: string | number) {
  const loadVersion = ++projectLoadVersion;
  eventSource?.close();
  eventSource = null;
  store.setProject(projectId);
  if (!projectId) return;
  await Promise.all([loadCapabilities(), loadHistory(projectId)]);
  if (loadVersion !== projectLoadVersion || String(props.projectId) !== String(projectId)) return;
  connectEvents();
}

async function loadHistory(projectId: string | number) {
  try {
    const response = await axios.get("/harness/workbench/actions", { params: { projectId, limit: 50 } });
    store.setHistory((response as any).data || []);
  } catch {
    store.setHistory([]);
  }
}

async function loadCapabilities() {
  if (!props.projectId) return;
  try {
    const response = await axios.get("/harness/workbench/capabilities");
    capabilities.value = (response as any).data || [];
  } catch {
    capabilities.value = [];
  }
}

async function execute(message: string, confirmed: boolean, requestId: string) {
  running.value = true;
  try {
    const response = await axios.post(`/harness/workbench/${instanceId.value}/instructions`, {
      message,
      confirmed,
      requestId,
      context: {
        route: props.routePath,
        domain: domain.value,
        projectId: props.projectId,
        episodeId: episodeId.value,
        selected: selected.value,
        visible: visible.value,
      },
    });
    const actionRun = (response as any).data.actionRun as HarnessActionRun;
    store.applyActionRun(actionRun);
  } catch (error: any) {
    store.addMessage({
      id: `director-error-${Date.now()}`,
      role: "director",
      content: error?.message || "指令执行失败",
      createdAt: Date.now(),
    });
  } finally {
    running.value = false;
  }
}

function startResize(event: MouseEvent) {
  isResizing.value = true;
  const startX = event.clientX;
  const startWidth = dockWidth.value;
  const move = (moveEvent: MouseEvent) => {
    dockWidth.value = Math.max(320, Math.min(680, startWidth - (moveEvent.clientX - startX)));
  };
  const stop = () => {
    isResizing.value = false;
    localStorage.setItem("toonflow.directorDockWidth", String(dockWidth.value));
    window.removeEventListener("mousemove", move);
    window.removeEventListener("mouseup", stop);
  };
  window.addEventListener("mousemove", move);
  window.addEventListener("mouseup", stop);
}

function createRequestId(): string {
  return window.crypto?.randomUUID?.() || `director-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function confirmRun(message: DirectorMessage) {
  if (!message.actionRun) return;
  running.value = true;
  try {
    const response = await axios.post(`/harness/workbench/actions/${message.actionRun.id}/confirm`);
    const actionRun = (response as any).data as HarnessActionRun;
    store.replaceActionRun(actionRun);
    if (actionRun.status === "completed") {
      store.applyActionRun(actionRun);
    }
  } catch (error: any) {
    window.$message.error(error?.message || "确认执行失败");
  } finally {
    running.value = false;
  }
}

async function retryRun(run: HarnessActionRun) {
  running.value = true;
  try {
    const response = await axios.post(`/harness/workbench/actions/${run.id}/retry`);
    store.applyActionRun((response as any).data);
  } catch (error: any) {
    window.$message.error(error?.message || "重试失败");
  } finally {
    running.value = false;
  }
}

async function cancelRun(run: HarnessActionRun) {
  await axios.post(`/harness/workbench/actions/${run.id}/cancel`);
  const response = await axios.get(`/harness/workbench/actions/${run.id}`);
  store.replaceActionRun((response as any).data);
}

function connectEvents() {
  eventSource?.close();
  connected.value = false;
  if (!props.projectId || !baseUrl.value) return;
  const token = localStorage.getItem("token") || "";
  const separator = String(baseUrl.value).includes("?") ? "&" : "?";
  const url = `${apiBaseUrl.value}/harness/events/stream${separator}instanceId=${encodeURIComponent(instanceId.value)}&token=${encodeURIComponent(token.replace("Bearer ", ""))}`;
  eventSource = new EventSource(url);
  eventSource.onopen = () => { connected.value = true; };
  eventSource.onerror = () => { connected.value = false; };
  eventSource.addEventListener("ui.patch", event => {
    try {
      const payload = JSON.parse((event as MessageEvent).data);
      store.refreshDomain(payload.patch?.domain);
      window.dispatchEvent(new CustomEvent("harness:ui-patch", { detail: payload.patch }));
    } catch {}
  });
  for (const eventName of ["action.awaiting_confirmation", "tool.started", "tool.progress", "tool.completed", "tool.failed", "tool.cancelled"]) {
    eventSource.addEventListener(eventName, event => {
      try {
        const payload = JSON.parse((event as MessageEvent).data);
        if (payload.actionRunId) void refreshActionRun(payload.actionRunId);
      } catch {}
    });
  }
  for (const eventName of ["action.planned", "review.requested", "review.completed", "review.approved", "review.rerouted"]) {
    eventSource.addEventListener(eventName, event => {
      try {
        const payload = JSON.parse((event as MessageEvent).data);
        addLiveEvent(payload, eventName);
        if (payload.actionRunId) void refreshActionRun(payload.actionRunId);
      } catch {}
    });
  }
}

function addLiveEvent(payload: any, kind: string) {
  const actionRunId = payload.actionRunId;
  if (!actionRunId) return;
  const level = /failed|rerouted/.test(kind) ? "error" : /completed|approved/.test(kind) ? "success" : "info";
  const detail = payload.payload?.message || payload.payload?.reason || payload.payload?.failure?.message || payload.payload?.toolName || kind;
  const entries = liveEvents.value[actionRunId] || [];
  if (entries.some(item => item.id === payload.id)) return;
  liveEvents.value = { ...liveEvents.value, [actionRunId]: [...entries, { id: payload.id, level, time: formatTime(payload.timestamp || Date.now()), title: kind, detail: String(detail) }] };
}

function liveEventsFor(run: HarnessActionRun) {
  return liveEvents.value[run.id] || [];
}

async function refreshActionRun(actionRunId: string) {
  try {
    const response = await axios.get(`/harness/workbench/actions/${actionRunId}`);
    const actionRun = (response as any).data as HarnessActionRun;
    store.replaceActionRun(actionRun);
    if (actionRun.status === "completed") store.refreshDomain((actionRun.result as any)?.uiPatch?.domain);
  } catch {
    // The initiating request still carries the ActionRun; SSE refresh is best effort.
  }
}

function delegatedSteps(run: HarnessActionRun): Array<{ role: string; tool: string; status: "completed" | "pending" | "failed"; detail: string }> {
  const steps = (run.result as any)?.delegatedSteps;
  return Array.isArray(steps) ? steps : [];
}

function reviewEvidence(run: HarnessActionRun): any[] {
  const result = run.result as any;
  if (result?.qualityLoop && (Array.isArray(result.qualityLoop.initialReviews) || Array.isArray(result.qualityLoop.finalReviews))) {
    return [...(result.qualityLoop.initialReviews || []), ...(result.qualityLoop.finalReviews || [])];
  }
  if (Array.isArray(result?.reviews)) return result.reviews;
  if (result?.score) return [{ reviewId: result.reviewId, attemptNumber: 1, artifactType: result.artifactType, artifactId: result.artifactId, reviewer: result.reviewer, criteriaAgent: result.criteriaAgent, score: result.score }];
  return [];
}

function scoreLabel(value?: number) {
  return typeof value === "number" ? `${Math.round(value * 100)} 分` : "无评分";
}

function activeProgress(run: HarnessActionRun) {
  return run.toolCalls.find(call => call.status === "running")?.progress;
}

function statusLabel(status: HarnessActionRun["status"]) {
  return ({ planned: "已规划", awaiting_confirmation: "待确认", running: "执行中", completed: "已完成", failed: "失败", cancelled: "已取消" } as const)[status];
}

function formatTime(value: number) {
  return new Date(value).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

onBeforeUnmount(() => eventSource?.close());
</script>

<style scoped lang="scss">
.director-dock {
  width: 390px;
  min-width: 390px;
  height: 100%;
  margin-left: 12px;
  display: grid;
  grid-template-rows: 62px auto minmax(0, 1fr) auto;
  overflow: hidden;
  background: var(--td-bg-color-container, #fff);
  border: 1px solid var(--td-border-level-1-color, #dcdfe6);
  border-radius: 8px;
  color: var(--td-text-color-primary, #1f2329);

  &.collapsed {
    width: 48px;
    min-width: 48px;
    display: block;
    background: transparent;
    border: 0;
  }
}

.dock-rail {
  position: relative;
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  border: 1px solid var(--td-border-level-1-color, #dcdfe6);
  border-radius: 8px;
  background: var(--td-brand-color, #0052d9);
  color: #fff;
  font-size: 22px;
}

.activity-dot {
  position: absolute;
  top: 7px;
  right: 7px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #e34d59;
}

.run-progress {
  margin: 8px 0;
  padding: 8px;
  border: 1px solid var(--td-brand-color-light, #d9e8ff);
  background: var(--td-brand-color-lightest, #f2f7ff);
  font-size: 12px;

  > div { display: flex; gap: 8px; justify-content: space-between; }
  > div span { color: var(--td-text-color-secondary, #6b7280); }
  > div strong { color: var(--td-brand-color, #0052d9); }
  > i { display: block; height: 4px; margin-top: 7px; overflow: hidden; background: #d9e8ff; }
  > i b { display: block; height: 100%; background: var(--td-brand-color, #0052d9); transition: width .2s ease; }
}

.dock-header {
  padding: 10px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--td-border-level-1-color, #e5e7eb);
}

.director-identity {
  display: flex;
  align-items: center;
  gap: 10px;

  > div:last-child { display: grid; gap: 2px; }
  strong { font-size: 14px; }
  span { color: var(--td-text-color-secondary, #6b7280); font-size: 11px; }
}

.director-mark {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 6px;
  background: var(--td-brand-color, #0052d9);
  color: #fff !important;
  font-size: 18px !important;
}

.connection-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-right: 5px;
  border-radius: 50%;
  background: #9ca3af;
  &.online { background: #2ba471; }
}

.header-actions {
  display: flex;
  gap: 4px;
  button { width: 30px; height: 30px; display: grid; place-items: center; border: 0; background: transparent; color: inherit; }
  button:hover { background: var(--td-bg-color-container-hover, #f3f4f6); }
}

.context-strip {
  min-height: 34px;
  padding: 7px 12px;
  display: flex;
  gap: 6px;
  overflow-x: auto;
  border-bottom: 1px solid var(--td-border-level-1-color, #e5e7eb);
  background: var(--td-bg-color-secondarycontainer, #f7f8fa);
  span { flex: none; padding: 2px 6px; border: 1px solid var(--td-border-level-1-color, #dcdfe6); border-radius: 4px; font-size: 11px; }
}

.capability-panel {
  max-height: 230px;
  overflow: hidden;
  border-bottom: 1px solid var(--td-border-level-1-color, #e5e7eb);
  background: #fff;
  > header { padding: 8px 12px; display: flex; justify-content: space-between; font-size: 11px; }
  > header span { color: #6b7280; }
}
.capability-list { max-height: 194px; padding: 0 8px 8px; overflow-y: auto; display: grid; gap: 4px; }
.capability-item { min-height: 42px; padding: 5px 7px; display: flex; gap: 7px; align-items: flex-start; border: 1px solid #edf0f2; border-radius: 4px; }
.capability-item summary { display: flex; gap: 7px; align-items: flex-start; cursor: pointer; list-style: none; }
.capability-item summary::-webkit-details-marker { display: none; }
.capability-detail { display: grid; gap: 4px; margin: 7px 0 2px 14px; color: #5a6475; font-size: 10px; }
.capability-detail pre { max-height: 110px; margin: 3px 0 0; padding: 6px; overflow: auto; white-space: pre-wrap; background: #f7f8fa; font: inherit; }
.capability-item > div { min-width: 0; display: grid; grid-template-columns: 1fr auto; gap: 1px 6px; flex: 1; }
.capability-item strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }
.capability-item span, .capability-item code { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #6b7280; font-size: 9px; }
.capability-item code { grid-column: 2; grid-row: 1; }
.capability-state { width: 7px; height: 7px; flex: 0 0 7px; margin-top: 4px; border-radius: 50%; background: #2ba471; }
.capability-item.disabled { opacity: .58; }
.capability-item.disabled .capability-state { background: #c9353f; }

.message-list {
  min-height: 0;
  padding: 14px 12px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.director-message {
  max-width: 94%;
  align-self: flex-start;
  &.user { align-self: flex-end; }
}

.message-meta { margin-bottom: 4px; color: var(--td-text-color-placeholder, #9ca3af); font-size: 10px; }
.message-content {
  padding: 9px 11px;
  border: 1px solid var(--td-border-level-1-color, #dcdfe6);
  border-radius: 6px;
  line-height: 1.55;
  white-space: pre-wrap;
  background: #fff;
  font-size: 13px;
}
.user .message-content { background: #edf3ff; border-color: #b5c7e8; }

.action-evidence {
  margin-top: 6px;
  border: 1px solid var(--td-border-level-1-color, #dcdfe6);
  border-radius: 6px;
  overflow: hidden;
  background: #fff;
  header { min-height: 32px; padding: 6px 9px; display: flex; justify-content: space-between; align-items: center; background: #f5f7fa; }
  code { font-size: 10px; color: #4b5563; }
}
.run-status { font-size: 11px; color: #4b5563; &.completed { color: #18794e; } &.failed { color: #c9353f; } &.awaiting_confirmation { color: #a15c00; } }
.plan-summary { padding: 9px; font-size: 12px; font-weight: 600; }
.tool-row { padding: 7px 9px; display: flex; gap: 8px; border-top: 1px solid #edf0f2; color: #4b5563; font-size: 12px; }
.tool-row > div { display: grid; gap: 2px; }
.tool-row span { color: #6b7280; font-size: 11px; }
.delegated-steps { border-top: 1px solid #edf0f2; background: #fafbfd; }
.delegated-row { padding: 7px 9px; display: flex; gap: 8px; font-size: 11px; color: #4b5563; }
.delegated-row > div { min-width: 0; display: grid; gap: 2px; }
.delegated-row strong { color: #1f2937; font-size: 11px; }
.delegated-row code { color: #5a6475; font-size: 10px; }
.delegated-row span { color: #6b7280; line-height: 1.35; }
.delegated-state { width: 7px; height: 7px; flex: 0 0 7px; margin-top: 4px; border-radius: 50%; background: #aab2bd; }
.delegated-state.completed { background: #2ba471; }
.delegated-state.failed { background: #d54941; }
.result-grid { margin: 0; padding: 8px 9px; display: grid; grid-template-columns: 1fr 1fr; gap: 6px; border-top: 1px solid #edf0f2; }
.result-grid div { min-width: 0; }
.result-grid dt { color: #6b7280; font-size: 10px; }
.result-grid dd { margin: 2px 0 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }
.run-error { margin: 0; padding: 8px 9px; color: #c9353f; background: #fff1f0; font-size: 11px; }
.review-evidence { display: grid; gap: 6px; padding: 8px 9px; border-top: 1px solid #edf0f2; }
.review-row { padding: 7px; border-left: 3px solid #2ba471; background: #f2fbf7; font-size: 11px; }
.review-row.rejected { border-left-color: #d54941; background: #fff5f5; }
.review-row header { display: flex; justify-content: space-between; gap: 8px; }
.review-row p { margin: 4px 0 0; color: #5a6475; }
.review-row ul { margin: 5px 0 0; padding-left: 16px; color: #c9353f; }
.review-feedback { color: #8c4b00 !important; }
.confirm-actions { padding: 8px 9px; display: flex; gap: 7px; border-top: 1px solid #edf0f2; }
.confirm-actions button { min-height: 28px; padding: 0 10px; border: 1px solid #c9cdd4; background: #fff; color: #374151; border-radius: 4px; }
.confirm-actions .confirm-primary { border-color: var(--td-brand-color, #0052d9); background: var(--td-brand-color, #0052d9); color: #fff; }

.director-thinking { display: flex; gap: 4px; padding: 8px; }
.director-thinking span { width: 5px; height: 5px; border-radius: 50%; background: #6b7280; animation: pulse 1s infinite alternate; }
.director-thinking span:nth-child(2) { animation-delay: .2s; }
.director-thinking span:nth-child(3) { animation-delay: .4s; }

.director-input { padding: 10px; border-top: 1px solid var(--td-border-level-1-color, #dcdfe6); }
.selection-chip { margin-bottom: 7px; padding: 5px 7px; display: flex; align-items: center; gap: 6px; border: 1px solid #b5c7e8; border-radius: 4px; background: #edf3ff; color: #1f4b8f; font-size: 11px; }
.selection-chip span { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.selection-chip button { border: 0; background: transparent; color: inherit; }
.director-input textarea { width: 100%; min-height: 68px; resize: none; padding: 9px; border: 1px solid #c9cdd4; border-radius: 5px; background: var(--td-bg-color-container, #fff); color: inherit; font: inherit; line-height: 1.45; }
.director-input textarea:focus { outline: 2px solid rgba(0, 82, 217, .16); border-color: var(--td-brand-color, #0052d9); }
.input-actions { min-height: 34px; margin-top: 6px; display: flex; align-items: center; justify-content: space-between; }
.input-actions > span { color: var(--td-text-color-placeholder, #9ca3af); font-size: 10px; }
.send-button { width: 34px; height: 34px; display: grid; place-items: center; border: 0; border-radius: 5px; background: var(--td-brand-color, #0052d9); color: #fff; }
.send-button:disabled { background: #c9cdd4; }

@keyframes pulse { to { opacity: .25; transform: translateY(-2px); } }

@media (max-width: 1100px) {
  .director-dock:not(.collapsed) {
    position: fixed;
    z-index: 1200;
    top: 12px;
    right: 12px;
    bottom: 12px;
    height: auto;
    width: min(390px, calc(100vw - 24px));
    min-width: 0;
    box-shadow: 0 12px 34px rgba(31, 35, 41, .18);
  }

  .director-dock.collapsed {
    position: fixed;
    z-index: 1200;
    top: 16px;
    right: 16px;
    width: 48px;
    min-width: 48px;
    height: 48px;
    margin: 0;
  }
}

@media (max-width: 520px) {
  .director-dock:not(.collapsed) {
    inset: 8px;
    width: auto;
    margin: 0;
  }

  .director-dock.collapsed {
    top: auto;
    right: 14px;
    bottom: 14px;
  }
}
</style>
