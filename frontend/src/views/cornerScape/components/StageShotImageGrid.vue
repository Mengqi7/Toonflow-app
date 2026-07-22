<template>
  <section class="stage-shot-grid">
    <header><strong>Harness Shot Images</strong><span>审核后写回业务资产</span></header>
    <ShotImageGrid :items="items" @select="emit('select', $event)" />
  </section>
</template>
<script setup lang="ts">
import ShotImageGrid from "./ShotImageGrid.vue";
defineProps<{ items: Array<{ id: string; imageUrl?: string; url?: string; status?: string }> }>();
const emit = defineEmits<{ select: [item: any] }>();
</script>
<style scoped>.stage-shot-grid { display: grid; gap: 8px; margin-top: 14px; }.stage-shot-grid header { display: flex; justify-content: space-between; color: #8293a1; font-size: 12px; }</style>
