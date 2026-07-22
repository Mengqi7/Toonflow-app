<template>
  <section class="stage-script-editor">
    <header><strong>Harness Script Output</strong><span>source=harness</span></header>
    <ScriptTable :project-id="projectId" source="harness" @select="emit('select', $event)" />
  </section>
</template>

<script setup lang="ts">
import ScriptTable from "./ScriptTable.vue";
defineProps<{ projectId?: number | string }>();
const emit = defineEmits<{ select: [row: any] }>();
</script>

<style scoped>.stage-script-editor { display: grid; gap: 8px; margin-top: 14px; }.stage-script-editor header { display: flex; justify-content: space-between; color: var(--muted, #8293a1); font-size: 12px; }</style>
