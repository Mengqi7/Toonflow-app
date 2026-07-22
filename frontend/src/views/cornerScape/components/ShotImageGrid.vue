<template>
  <div class="shot-image-grid">
    <button v-for="item in items" :key="item.id" type="button" class="shot-image" @click="$emit('select', item)">
      <img v-if="item.imageUrl || item.url" :src="item.imageUrl || item.url" :alt="item.id" />
      <span v-else>{{ item.id }}</span><strong>{{ item.id }}</strong><small>{{ item.status || "pending" }}</small>
    </button>
  </div>
</template>
<script setup lang="ts">
defineProps<{ items: Array<{ id: string; imageUrl?: string; url?: string; status?: string }> }>();
defineEmits<{ select: [item: any] }>();
</script>
<style scoped>.shot-image-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); gap: 8px; }.shot-image { display: grid; gap: 4px; min-height: 104px; padding: 6px; border: 1px solid rgba(97,219,255,.25); border-radius: 8px; color: inherit; background: rgba(9,26,40,.62); text-align: left; }.shot-image img,.shot-image span { width: 100%; height: 62px; object-fit: cover; border-radius: 5px; }.shot-image span { display: grid; place-items: center; color: #7ddfff; background: rgba(77,243,255,.08); }.shot-image small { color: #8293a1; }</style>
