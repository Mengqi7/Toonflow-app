<template>
  <div class="harness-manager">
    <t-tabs v-model="activeTab" type="card">
      <t-tab-panel value="instances" label="📋 工作流实例">
        <div class="toolbar-row">
          <t-button theme="primary" size="small" @click="loadInstances">🔄 刷新</t-button>
          <t-tag v-if="runningCount > 0" theme="warning" variant="light">运行中: {{ runningCount }}</t-tag>
        </div>
        <t-table :data="instances" :columns="instanceColumns" row-key="id" size="small" :loading="loading" hover>
          <template #status="{row}">
            <t-tag v-if="row.status==='running'" theme="success" variant="light">🟢 运行中</t-tag>
            <t-tag v-else-if="row.status==='pending'" theme="default" variant="light">⏳ 等待中</t-tag>
            <t-tag v-else-if="row.status==='completed'" theme="primary" variant="light">✅ 已完成</t-tag>
            <t-tag v-else-if="row.status==='paused'" theme="warning" variant="light">⏸ 已暂停</t-tag>
            <t-tag v-else>{{ row.status }}</t-tag>
          </template>
          <template #ops="{row}">
            <t-space size="small">
              <t-button v-if="['pending','paused'].includes(row.status)" size="small" theme="success" variant="text" @click="resumeWorkflow(row)">▶️</t-button>
              <t-button v-if="['running','paused'].includes(row.status)" size="small" theme="warning" variant="text" @click="pauseWorkflow(row)">⏸</t-button>
              <t-button v-if="['pending','running','paused'].includes(row.status)" size="small" theme="danger" variant="text" @click="cancelWorkflow(row)">❌</t-button>
              <t-button size="small" theme="default" variant="text" @click="showDetail(row)">🔍</t-button>
            </t-space>
          </template>
        </t-table>
        <t-empty v-if="!loading && instances.length === 0" description="暂无工作流实例" />
      </t-tab-panel>

      <t-tab-panel value="templates" label="📦 可用模板">
        <div class="toolbar-row">
          <t-button theme="primary" size="small" @click="loadTemplates">🔄 刷新</t-button>
        </div>
        <t-table :data="templates" :columns="templateColumns" row-key="id" size="small" hover>
          <template #ops="{row}">
            <t-button size="small" theme="success" variant="text" @click="startFromTemplate(row)">▶️ 启动</t-button>
          </template>
        </t-table>
      </t-tab-panel>

      <t-tab-panel value="agents" label="🤖 Agent注册">
        <div class="toolbar-row">
          <t-button theme="primary" size="small" @click="loadAgents">🔄 刷新</t-button>
        </div>
        <t-table :data="agents" :columns="agentColumns" row-key="id" size="small" hover>
          <template #capabilities="{row}">{{ (row.capabilities || []).join(', ') }}</template>
        </t-table>
      </t-tab-panel>
    </t-tabs>

    <!-- 实例详情 -->
    <t-dialog v-model:visible="showDetailDialog" header="实例详情" width="600px" :footer="false">
      <div class="detail-content" v-if="detailInstance">
        <p><strong>ID:</strong> {{ detailInstance.id }}</p>
        <p><strong>状态:</strong> {{ statusTag(detailInstance.status) }}</p>
        <p><strong>模板:</strong> {{ detailInstance.definitionId }}</p>
        <p><strong>开始时间:</strong> {{ new Date(detailInstance.startedAt).toLocaleString('zh-CN') }}</p>

        <h4 style="margin-top:12px">⚙️ 节点状态</h4>
        <t-table v-if="nodeStateList.length" :data="nodeStateList" size="small" row-key="key">
          <template #state="{row}">
            <t-tag v-if="row.state==='completed'" theme="success" variant="light">{{ row.state }}</t-tag>
            <t-tag v-else-if="row.state==='running'" theme="warning" variant="light">{{ row.state }}</t-tag>
            <t-tag v-else>{{ row.state }}</t-tag>
          </template>
        </t-table>
      </div>
    </t-dialog>

    <!-- 启动弹窗 -->
    <t-dialog v-model:visible="showStartDialog" header="启动工作流实例" width="500px" @on-confirm="doStart">
      <t-form labelWidth="80px" labelAlign="top">
        <t-form-item label="模板"><t-select v-model="selectedTemplate" placeholder="请选择"><t-option v-for="w in templates" :key="w.id" :value="w.id" :label="w.id" /></t-select></t-form-item>
        <t-form-item label="配置"><t-textarea v-model="configStr" placeholder='{}' :autosize="{minRows:4}" /></t-form-item>
      </t-form>
    </t-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import axios from '@/utils/axios';

const activeTab = ref('instances');
watch(activeTab, (tab) => {
  if (tab === 'instances') loadInstances();
  else if (tab === 'templates') loadTemplates();
  else if (tab === 'agents') loadAgents();
});

const instances = ref<any[]>([]);
const loading = ref(false);
const runningCount = computed(() => instances.value.filter(i => i.status === 'running' || i.status === 'paused').length);

const instanceColumns = [
  { colKey: 'id', title: '实例ID', width: 140, ellipsis: true },
  { colKey: 'definitionId', title: '模板' },
  { colKey: 'status', title: '状态', width: 100 },
  { colKey: 'startedAt', title: '开始时间', width: 180 },
  { colKey: 'ops', title: '操作', width: 160, fixed: 'right' as const },
];

const templates = ref<any[]>([]);
const templateColumns = [
  { colKey: 'id', title: '模板ID' },
  { colKey: 'version', title: '版本', width: 80 },
  { colKey: 'nodeCount', title: '节点数', width: 100 },
  { colKey: 'ops', title: '操作', width: 100 },
];

const agents = ref<any[]>([]);
const agentColumns = [
  { colKey: 'id', title: 'ID' },
  { colKey: 'name', title: '名称' },
  { colKey: 'role', title: '角色' },
  { colKey: 'capabilities', title: '能力', minWidth: 200 },
  { colKey: 'version', title: '版本', width: 80 },
];

const showDetailDialog = ref(false);
const detailInstance = ref<any>(null);
const nodeStateList = computed(() => detailInstance.value?.nodeStates ? Object.entries(detailInstance.value.nodeStates).map(([k,v])=>({key:k,state:v})) : []);

const showStartDialog = ref(false);
const selectedTemplate = ref('');
const configStr = ref('{}');

async function loadInstances() {
  loading.value = true;
  try { const res = await axios.get('/harness/instances'); instances.value = res.data?.data || []; } catch(e) { instances.value = []; }
  finally { loading.value = false; }
}

async function loadTemplates() {
  try { const res = await axios.get('/harness/workflows'); templates.value = res.data?.data || []; } catch(e) { templates.value = []; }
}

async function loadAgents() {
  try { const res = await axios.get('/harness/agents'); agents.value = res.data?.data || []; } catch(e) { agents.value = []; }
}

function showDetail(inst: any) { detailInstance.value = inst; showDetailDialog.value = true; }
function statusTag(s: string) { return `<t-tag>${s}</t-tag>`; }

function startFromTemplate(wf: any) { selectedTemplate.value = wf.id; configStr.value = '{}'; showStartDialog.value = true; }

async function doStart() {
  let cfg: any = {};
  try { cfg = JSON.parse(configStr.value || '{}'); } catch(e) {}
  await axios.post('/harness/workflow/start', { workflowId: selectedTemplate.value, config: cfg });
  window.$message.success('工作流已启动');
  showStartDialog.value = false; loadInstances();
}

async function pauseWorkflow(inst: any) { try { await axios.post(`/harness/workflow/${inst.id}/pause`); window.$message.success('已暂停'); loadInstances(); } catch(e: any) { window.$message.error(e?.response?.data?.message || '失败'); } }
async function resumeWorkflow(inst: any) { try { await axios.post(`/harness/workflow/${inst.id}/resume`); window.$message.success('已恢复'); loadInstances(); } catch(e: any) { window.$message.error(e?.response?.data?.message || '失败'); } }
async function cancelWorkflow(inst: any) { if(!confirm(`确定取消?`)) return; try { await axios.post(`/harness/workflow/${inst.id}/cancel`); window.$message.success('已取消'); loadInstances(); } catch(e: any) { window.$message.error(e?.response?.data?.message || '失败'); } }

onMounted(() => { loadInstances(); loadTemplates(); loadAgents(); });
</script>

<style scoped lang="scss">
.harness-manager { padding: 16px; }
.toolbar-row { display: flex; gap: 8px; margin-bottom: 12px; align-items: center; }
.detail-content p { margin: 4px 0; font-size: 13px; line-height: 1.6; }
</style>
