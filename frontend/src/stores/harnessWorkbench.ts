import { computed, ref } from "vue";

export type HarnessDomain = "script" | "beats" | "scenes" | "characters" | "props" | "locations" | "storyboard" | "video" | "assets";
export type HarnessEntityType = "project" | "episode" | "script" | "beat" | "scene" | "shot" | "character" | "prop" | "location" | "artifact";

export interface HarnessEntityRef {
  type: HarnessEntityType;
  id: string | number;
  label?: string;
}

export interface HarnessActionRun {
  id: string;
  projectId: string;
  status: "planned" | "awaiting_confirmation" | "running" | "completed" | "failed" | "cancelled";
  userInstruction: string;
  plan: {
    summary: string;
    steps: Array<{ toolName: string; purpose: string; targetIds: string[] }>;
    affectedObjects: HarnessEntityRef[];
    requiresConfirmation: boolean;
    confirmationReason?: string;
  };
  toolCalls: Array<{ id: string; toolName: string; status: string; input: unknown; output?: unknown; progress?: { percent: number; message: string; updatedAt: number }; error?: { message: string; retryable: boolean } }>;
  result?: any;
  error?: { message: string; retryable: boolean };
  reviewState?: "not_required" | "pending" | "approved" | "rejected";
  createdAt: number;
  updatedAt: number;
}

export interface DirectorMessage {
  id: string;
  role: "user" | "director";
  content: string;
  createdAt: number;
  actionRun?: HarnessActionRun;
}

const routeDomains: Record<string, HarnessDomain> = {
  "/novel": "script",
  "/scriptAgent": "script",
  "/script": "script",
  "/cornerScape": "characters",
  "/production": "storyboard",
  "/assets": "assets",
};

function welcomeMessage(): DirectorMessage {
  return {
    id: "director-welcome",
    role: "director",
    content: "项目上下文已连接。我会根据当前页面和选中对象执行影视制作操作。",
    createdAt: Date.now(),
  };
}

function normalizeProjectId(value?: string | number): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return String(value).replace(/^project:/, "");
}

export default defineStore("harnessWorkbenchV3", () => {
  const isOpen = ref(true);
  const domain = ref<HarnessDomain>("script");
  const episodeId = ref<string | number>();
  const selected = ref<HarnessEntityRef[]>([]);
  const visible = ref<HarnessEntityRef[]>([]);
  const activeProjectId = ref<string>();
  const messages = ref<DirectorMessage[]>([welcomeMessage()]);
  const refreshRevision = ref(0);
  const running = ref(false);
  const connected = ref(false);

  const selectedSummary = computed(() => selected.value.map(item => item.label || item.id).join("、"));

  function syncRoute(path: string) {
    domain.value = routeDomains[path] || domain.value;
    selected.value = [];
    visible.value = [];
  }

  function setEpisode(id?: string | number) {
    episodeId.value = id;
  }

  function setSelection(items: HarnessEntityRef[]) {
    selected.value = items;
  }

  function setVisible(items: HarnessEntityRef[]) {
    visible.value = items.slice(0, 100);
  }

  function addMessage(message: DirectorMessage) {
    messages.value.push(message);
    if (messages.value.length > 100) messages.value.splice(0, messages.value.length - 100);
  }

  function belongsToActiveProject(actionRun: HarnessActionRun): boolean {
    return !activeProjectId.value || normalizeProjectId(actionRun.projectId) === activeProjectId.value;
  }

  function actionRunContent(actionRun: HarnessActionRun): string {
    if (actionRun.status === "completed") return actionRun.result?.reply || actionRun.result?.summary || actionRun.plan.summary;
    if (actionRun.status === "awaiting_confirmation") return "等待确认";
    if (actionRun.status === "planned") return `已规划：${actionRun.plan.summary}`;
    if (actionRun.status === "running") {
      const progress = actionRun.toolCalls.find(call => call.status === "running")?.progress;
      return progress?.message || `执行中：${actionRun.plan.summary}`;
    }
    return actionRun.error?.message || actionRun.plan.summary;
  }

  function setProject(projectId?: string | number) {
    const nextProjectId = normalizeProjectId(projectId);
    if (nextProjectId === activeProjectId.value) return;
    activeProjectId.value = nextProjectId;
    episodeId.value = undefined;
    selected.value = [];
    visible.value = [];
    running.value = false;
    connected.value = false;
    messages.value = [welcomeMessage()];
  }

  function setHistory(actionRuns: HarnessActionRun[]) {
    const projectRuns = actionRuns
      .filter(belongsToActiveProject)
      .sort((left, right) => left.createdAt - right.createdAt);
    const historyMessages = projectRuns.flatMap(actionRun => [
      {
        id: `history-user-${actionRun.id}`,
        role: "user" as const,
        content: actionRun.userInstruction,
        createdAt: actionRun.createdAt,
      },
      {
        id: `director-${actionRun.id}`,
        role: "director" as const,
        content: actionRunContent(actionRun),
        actionRun,
        createdAt: actionRun.updatedAt,
      },
    ]);
    messages.value = [welcomeMessage(), ...historyMessages.slice(-99)];
  }

  function replaceActionRun(actionRun: HarnessActionRun) {
    if (!belongsToActiveProject(actionRun)) return;
    const message = [...messages.value].reverse().find(item => item.actionRun?.id === actionRun.id);
    if (message) {
      message.actionRun = actionRun;
      message.content = actionRunContent(actionRun);
      message.createdAt = actionRun.updatedAt || message.createdAt;
      return;
    }
    addMessage({
      id: `director-${actionRun.id}`,
      role: "director",
      content: actionRunContent(actionRun),
      actionRun,
      createdAt: actionRun.updatedAt || Date.now(),
    });
  }

  function applyActionRun(actionRun: HarnessActionRun) {
    if (!belongsToActiveProject(actionRun)) return;
    replaceActionRun(actionRun);
    if (!messages.value.some(item => item.actionRun?.id === actionRun.id)) addMessage({
      id: `director-${actionRun.id}-${Date.now()}`,
      role: "director",
      content: actionRun.status === "completed" ? actionRun.plan.summary : actionRun.status === "awaiting_confirmation" ? "等待确认" : actionRun.error?.message || actionRun.status,
      actionRun,
      createdAt: Date.now(),
    });
    if (actionRun.status === "completed") {
      refreshRevision.value += 1;
      window.dispatchEvent(new CustomEvent("harness:action-completed", { detail: actionRun }));
    }
  }

  function refreshDomain(targetDomain?: HarnessDomain) {
    if (!targetDomain || targetDomain === domain.value || (targetDomain === "scenes" && domain.value === "script")) {
      refreshRevision.value += 1;
    }
  }

  function clearMessages() {
    messages.value = [welcomeMessage()];
  }

  return {
    isOpen,
    domain,
    episodeId,
    selected,
    visible,
    activeProjectId,
    messages,
    refreshRevision,
    running,
    connected,
    selectedSummary,
    syncRoute,
    setEpisode,
    setSelection,
    setVisible,
    setProject,
    setHistory,
    addMessage,
    replaceActionRun,
    applyActionRun,
    refreshDomain,
    clearMessages,
  };
});
