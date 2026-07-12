<template>
  <t-dialog
    :visible="visible"
    header="用户确认"
    width="720px"
    placement="center"
    :close-on-overlay-click="false"
    @update:visible="$emit('update:visible', $event)">
    <div class="confirm-layout">
      <section>
        <h4>监制报告</h4>
        <p>{{ report.title }}</p>
        <div class="score-grid">
          <div v-for="item in report.scores" :key="item.name">
            <span>{{ item.name }}</span>
            <t-progress :percentage="Math.round(item.score * 100)" :color="item.score >= 0.75 ? '#10b981' : '#f59e0b'" />
          </div>
        </div>
      </section>
      <section>
        <h4>产物预览</h4>
        <div class="preview">
          <i-pic />
          <span>{{ artifactName }}</span>
        </div>
      </section>
      <section>
        <h4>历史版本</h4>
        <div v-for="version in versions" :key="version.id" class="version-row">
          <span>{{ version.label }}</span>
          <t-tag :theme="version.passed ? 'success' : 'danger'" variant="light">{{ version.passed ? "通过" : "打回" }}</t-tag>
          <span>{{ version.score }}</span>
        </div>
      </section>
    </div>
    <template #footer>
      <t-button variant="outline" @click="$emit('view-large')">查看大图</t-button>
      <t-button variant="outline" @click="$emit('compare-version')">对比版本</t-button>
      <t-button variant="outline" @click="$emit('manual-edit')">手动修改 prompt</t-button>
      <t-button theme="danger" variant="outline" @click="$emit('reject')">打回</t-button>
      <t-button theme="primary" @click="$emit('approve')">通过</t-button>
    </template>
  </t-dialog>
</template>

<script setup lang="ts">
defineProps<{
  visible: boolean;
  artifactName: string;
  report: {
    title: string;
    scores: { name: string; score: number }[];
  };
  versions: { id: string; label: string; score: string; passed: boolean }[];
}>();

defineEmits<{
  "update:visible": [value: boolean];
  approve: [];
  reject: [];
  "view-large": [];
  "compare-version": [];
  "manual-edit": [];
}>();
</script>

<style scoped lang="scss">
.confirm-layout {
  display: grid;
  gap: 14px;
}

section {
  padding: 14px;
  border: 1px solid var(--td-border-level-1-color);
  border-radius: 8px;
  background: var(--td-bg-color-page);

  h4 {
    margin: 0 0 10px;
    font-size: 14px;
  }

  p {
    margin: 0;
    color: var(--td-text-color-secondary);
  }
}

.score-grid {
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 18px;
}

.preview {
  height: 160px;
  display: grid;
  place-items: center;
  gap: 8px;
  color: #0f766e;
  background: linear-gradient(135deg, #ecfeff, #fef3c7);
  border-radius: 8px;
  font-size: 22px;

  span {
    font-size: 13px;
    color: var(--td-text-color-secondary);
  }
}

.version-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 64px 56px;
  gap: 10px;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px dashed var(--td-border-level-1-color);

  &:last-child {
    border-bottom: 0;
  }
}
</style>
