<template>
  <section class="director-chat">
    <header class="chat-header">
      <div class="avatar"><i-movie-board /></div>
      <div class="title">
        <strong>导演 Agent</strong>
        <span>{{ connected ? "在线调度" : "本地预览" }} · {{ taskSummary }}</span>
      </div>
      <t-tag :theme="connected ? 'success' : 'warning'" variant="light">{{ connected ? "SSE" : "Demo" }}</t-tag>
    </header>

    <div ref="bodyRef" class="chat-body">
      <article v-for="message in messages" :key="message.id" class="message" :class="message.role">
        <div class="sender">{{ message.name }} · {{ message.time }}</div>
        <div class="bubble">
          <p>{{ message.content }}</p>
          <div v-if="message.confirm" class="confirm-card">
            <strong>{{ message.confirm.title }}</strong>
            <span>{{ message.confirm.detail }}</span>
            <div class="confirm-actions">
              <t-button size="small" theme="primary" @click="$emit('confirm-action', 'approve')">通过</t-button>
              <t-button size="small" variant="outline" @click="$emit('confirm-action', 'rewrite_prompt')">重写 prompt</t-button>
              <t-button size="small" variant="outline" @click="$emit('confirm-action', 'reroute')">跨工种打回</t-button>
            </div>
          </div>
        </div>
      </article>
    </div>

    <footer class="chat-footer">
      <t-input v-model="draft" placeholder="对导演说点什么，Enter 发送" @enter="send" clearable />
      <t-button theme="primary" @click="send">
        <template #icon><i-send /></template>
      </t-button>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from "vue";

export interface DirectorMessage {
  id: string;
  role: "director" | "user";
  name: string;
  time: string;
  content: string;
  confirm?: {
    title: string;
    detail: string;
  };
}

defineProps<{
  messages: DirectorMessage[];
  connected: boolean;
  taskSummary: string;
}>();

const emit = defineEmits<{
  send: [message: string];
  "confirm-action": [action: string];
}>();

const draft = ref("");
const bodyRef = ref<HTMLElement>();

function send() {
  const value = draft.value.trim();
  if (!value) return;
  emit("send", value);
  draft.value = "";
}

watch(
  () => document.querySelectorAll(".director-chat .message").length,
  async () => {
    await nextTick();
    if (bodyRef.value) bodyRef.value.scrollTop = bodyRef.value.scrollHeight;
  },
);
</script>

<style scoped lang="scss">
.director-chat {
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--td-bg-color-container);
  border-right: 1px solid var(--td-border-level-1-color);
}

.chat-header {
  height: 64px;
  padding: 12px 18px;
  display: flex;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid var(--td-border-level-1-color);
}

.avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: white;
  background: linear-gradient(135deg, #2563eb, #0f766e);
}

.title {
  min-width: 0;
  flex: 1;
  display: grid;
  gap: 2px;

  span {
    color: var(--td-text-color-secondary);
    font-size: 12px;
  }
}

.chat-body {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.message {
  max-width: 92%;

  &.user {
    align-self: flex-end;

    .bubble {
      background: #f2f3f5;
      color: var(--td-text-color-primary);
      border-radius: 12px 4px 12px 12px;
    }
  }

  &.director .bubble {
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    color: #1e3a8a;
    border-radius: 4px 12px 12px 12px;
  }
}

.sender {
  margin-bottom: 4px;
  color: var(--td-text-color-placeholder);
  font-size: 11px;
}

.bubble {
  padding: 10px 12px;
  line-height: 1.65;

  p {
    margin: 0;
    white-space: pre-wrap;
  }
}

.confirm-card {
  margin-top: 10px;
  padding: 10px;
  display: grid;
  gap: 8px;
  border-radius: 6px;
  background: white;
  border: 1px solid #fecaca;
  color: #991b1b;

  span {
    color: #7f1d1d;
    font-size: 12px;
  }
}

.confirm-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chat-footer {
  padding: 12px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 40px;
  gap: 8px;
  border-top: 1px solid var(--td-border-level-1-color);
}
</style>
