<template>
  <div class="script-agent-workspace">
    <header class="workspace-header">
      <div>
        <h3>{{ $t("workbench.scriptAgent.script") }}</h3>
      </div>
      <t-button theme="primary" variant="outline" @click="reload">
        <template #icon><i-refresh size="16" /></template>
      </t-button>
    </header>

    <t-tabs v-model="activeTab" class="workspace-tabs">
      <template #action>
        <t-button v-if="activeTab !== 'scripts'" size="small" variant="outline" @click="openTextEditor">
          <template #icon><i-edit size="15" /></template>
        </t-button>
      </template>
      <t-tab-panel value="skeleton" :label="$t('workbench.scriptAgent.storySkeleton')">
        <section class="document-panel">
          <MdPreview v-if="planData.storySkeleton" :model-value="planData.storySkeleton" :theme="editorTheme" />
          <t-empty v-else :title="$t('workbench.scriptAgent.noContent')" />
        </section>
      </t-tab-panel>
      <t-tab-panel value="strategy" :label="$t('workbench.scriptAgent.adaptationStrategy')">
        <section class="document-panel">
          <MdPreview v-if="planData.adaptationStrategy" :model-value="planData.adaptationStrategy" :theme="editorTheme" />
          <t-empty v-else :title="$t('workbench.scriptAgent.noContent')" />
        </section>
      </t-tab-panel>
      <t-tab-panel value="scripts" :label="$t('workbench.scriptAgent.script')">
        <section class="script-grid">
          <t-empty v-if="!planData.script.length" :title="$t('workbench.scriptAgent.noContent')" />
          <article v-for="item in planData.script" :key="item.id || item.name" class="script-card">
            <header>
              <strong>{{ item.name }}</strong>
              <div>
                <t-button size="small" variant="text" @click="editScript(item)"><template #icon><i-edit size="15" /></template></t-button>
                <t-button size="small" theme="danger" variant="text" @click="deleteScript(item)"><template #icon><i-delete size="15" /></template></t-button>
              </div>
            </header>
            <pre>{{ item.content }}</pre>
          </article>
        </section>
      </t-tab-panel>
    </t-tabs>

    <edit-md-preivew v-model="textEditorOpen" :content="textEditorValue" @save="saveDocument" />
    <t-dialog
      v-model:visible="scriptEditorOpen"
      :header="$t('workbench.scriptAgent.editScript')"
      width="80%"
      top="10vh"
      :confirm-btn="{ content: $t('workbench.scriptAgent.save'), theme: 'primary' }"
      @confirm="saveScript">
      <div class="script-editor">
        <t-input v-model="scriptEditor.name" :placeholder="$t('workbench.scriptAgent.editScript')" />
        <MdEditor v-model="scriptEditor.content" :theme="editorTheme" :toolbars="toolbars" :footers="[]" style="height: 50vh" @on-upload-img="() => {}" @drop.prevent />
      </div>
    </t-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { MdEditor, MdPreview, type ToolbarNames } from "md-editor-v3";
import axios from "@/utils/axios";
import settingStore from "@/stores/setting";
import projectStore from "@/stores/project";
import harnessWorkbenchStore from "@/stores/harnessWorkbench";
import EditMdPreivew from "@/components/editMdPreivew.vue";

interface ScriptCard {
  id?: number;
  name: string;
  content: string;
}

const { project } = storeToRefs(projectStore());
const { themeSetting } = storeToRefs(settingStore());
const editorTheme = computed(() => themeSetting.value.mode === "auto" ? undefined : themeSetting.value.mode);
const workbench = harnessWorkbenchStore();
const activeTab = ref("skeleton");
const planData = ref({ storySkeleton: "", adaptationStrategy: "", script: [] as ScriptCard[] });
const workDataId = ref<number>();
const textEditorOpen = ref(false);
const textEditorValue = ref("");
const scriptEditorOpen = ref(false);
const scriptEditor = ref<ScriptCard>({ name: "", content: "" });
const toolbars: ToolbarNames[] = ["bold", "underline", "italic", "strikeThrough", "-", "title", "quote", "unorderedList", "orderedList", "code", "table", "-", "preview"];

async function reload() {
  if (!project.value?.id) return;
  const response = await axios.post("/scriptAgent/getPlanData", { projectId: project.value.id, agentType: "scriptAgent" });
  const payload = (response as any).data || {};
  const data = payload.data || {};
  planData.value = {
    storySkeleton: data.storySkeleton || "",
    adaptationStrategy: data.adaptationStrategy || "",
    script: data.script || [],
  };
  workDataId.value = payload.id;
  workbench.setVisible(planData.value.script.map((item, index) => ({ type: "script", id: `script:${item.id || index}`, label: item.name })));
}

function openTextEditor() {
  textEditorValue.value = activeTab.value === "skeleton" ? planData.value.storySkeleton : planData.value.adaptationStrategy;
  textEditorOpen.value = true;
}

async function saveDocument(value: string) {
  if (activeTab.value === "skeleton") planData.value.storySkeleton = value;
  if (activeTab.value === "strategy") planData.value.adaptationStrategy = value;
  await saveWorkbenchData();
}

function editScript(item: ScriptCard) {
  scriptEditor.value = { ...item };
  scriptEditorOpen.value = true;
}

async function saveScript() {
  const item = scriptEditor.value;
  if (!item.id) return;
  await axios.post("/script/updateScript", { id: item.id, name: item.name, content: item.content, assets: [] });
  scriptEditorOpen.value = false;
  await reload();
}

async function deleteScript(item: ScriptCard) {
  if (!item.id || !window.confirm("Delete this screenplay?")) return;
  await axios.post("/script/delScript", { ids: [item.id] });
  await reload();
}

async function saveWorkbenchData() {
  if (!workDataId.value) return;
  await axios.post("/scriptAgent/updateData", {
    id: workDataId.value,
    data: {
      storySkeleton: planData.value.storySkeleton,
      adaptationStrategy: planData.value.adaptationStrategy,
      script: planData.value.script.filter(item => item.id).map(item => ({ id: item.id, content: item.content })),
    },
  });
  await reload();
}

onMounted(() => { void reload(); });
</script>

<style scoped lang="scss">
.script-agent-workspace { height: calc(100% - 16px); min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.workspace-header { min-height: 42px; padding: 0 4px 8px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--td-border-level-1-color); }
.workspace-header h3 { margin: 0; font-size: 15px; font-weight: 600; }
.workspace-tabs { min-height: 0; flex: 1; display: flex; flex-direction: column; }
:deep(.workspace-tabs .t-tabs__content) { min-height: 0; flex: 1; overflow: hidden; }
:deep(.workspace-tabs .t-tab-panel) { height: 100%; }
.document-panel { height: 100%; overflow: auto; padding: 16px; box-sizing: border-box; }
.script-grid { height: 100%; overflow: auto; padding: 16px; display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 12px; align-content: start; box-sizing: border-box; }
.script-card { min-width: 0; border: 1px solid var(--td-border-level-1-color); border-radius: 6px; background: var(--td-bg-color-container); overflow: hidden; }
.script-card header { min-height: 42px; padding: 0 8px 0 12px; display: flex; align-items: center; justify-content: space-between; gap: 8px; border-bottom: 1px solid var(--td-border-level-1-color); }
.script-card strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
.script-card pre { max-height: 320px; margin: 0; padding: 12px; overflow: auto; white-space: pre-wrap; font: 12px/1.65 var(--td-font-family); color: var(--td-text-color-secondary); }
.script-editor { display: grid; gap: 12px; }
@media (max-width: 780px) { .script-grid { grid-template-columns: 1fr; padding: 10px; } }
</style>
