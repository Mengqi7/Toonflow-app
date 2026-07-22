<template>
  <t-table :data="rows" :columns="columns" row-key="id" size="small" hover @row-click="onRowClick">
    <template #content="{ row }"><span class="script-content">{{ row.content }}</span></template>
    <template #source="{ row }"><t-tag :theme="row.source === source ? 'primary' : 'default'" variant="light">{{ row.source || "manual" }}</t-tag></template>
  </t-table>
  <t-empty v-if="!loading && !rows.length" description="暂无剧本产物" />
</template>

<script setup lang="ts">
import axios from "@/utils/axios";
import { onMounted, ref, watch } from "vue";
const props = withDefaults(defineProps<{ projectId?: number | string; source?: string }>(), { source: "manual" });
const emit = defineEmits<{ select: [row: any] }>();
const rows = ref<any[]>([]);
const loading = ref(false);
const columns = [{ colKey: "name", title: "剧本" }, { colKey: "sceneNumber", title: "场次", width: 72 }, { colKey: "content", title: "内容" }, { colKey: "source", title: "来源", width: 90 }];
async function load() {
  if (!props.projectId) return;
  loading.value = true;
  try {
    const response = await axios.post("/script/getScrptApi", { projectId: props.projectId, source: props.source });
    rows.value = Array.isArray(response.data) ? response.data.filter((row: any) => !props.source || !row.source || row.source === props.source) : [];
  } finally { loading.value = false; }
}
function onRowClick(context: any) { emit("select", context.row); }
watch(() => [props.projectId, props.source], load);
onMounted(load);
</script>

<style scoped>.script-content { display: block; max-width: 360px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }</style>
