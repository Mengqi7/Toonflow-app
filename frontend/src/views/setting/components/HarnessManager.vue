<template>
  <div class="harness-manager">
    <!-- Tab切换 -->
    <t-tabs v-model="activeTab" type="card" :onChange="onTabChange">
      <t-tab-panel value="novel-start" label="🎬 小说→电影">
        <!-- 从小说启动完整制作流程 -->
        <div class="novel-start-section">
          <t-alert theme="info" message="上传小说后，通过此入口直接进入 Harness DAG 引擎，自动执行完整的影视制作流程（编剧→分镜→拍摄→剪辑→成片）。" style="margin-bottom:16px" />

          <t-form labelWidth="100px" labelAlign="right">
            <t-form-item label="项目">
              <t-select v-model="novelStartForm.projectId" placeholder="请选择项目" filterable>
                <t-option v-for="p in projectList" :key="p.id" :value="Number(p.id)" :label="`${p.name} (${p.projectType})`" />
              </t-select>
            </t-form-item>

            <t-form-item label="工作流模板">
              <t-select v-model="novelStartForm.workflowTemplate" placeholder="选择制作流程">
                <t-option value="film-production" label="电影制作（完整6阶段）" />
                <t-option value="tv-series-production" label="电视剧制作（分集模式）" />
                <t-option value="short-drama-production" label="短剧制作（简版流程）" />
              </t-select>
            </t-form-item>

            <t-form-item label="章节范围">
              <t-space>
                <t-input-number v-model="novelStartForm.chapterFrom" placeholder="起始章" :min="1" theme="normal" style="width:120px" />
                <span style="color:#999">至</span>
                <t-input-number v-model="novelStartForm.chapterTo" placeholder="结束章" :min="1" theme="normal" style="width:120px" />
                <t-tag theme="default" variant="light">留空=全部章节</t-tag>
              </t-space>
            </t-form-item>

            <t-form-item label="自定义文本">
              <t-textarea
                v-model="novelStartForm.novelText"
                placeholder="（可选）直接粘贴小说文本，优先级高于项目章节"
                :autosize="{ minRows: 3, maxRows: 8 }"
              />
            </t-form-item>

            <t-form-item>
              <t-button theme="primary" size="medium" @click="startFromNovel" :loading="novelStartLoading">
                🚀 启动制作流程
              </t-button>
              <t-button theme="default" size="medium" @click="resetNovelForm" style="margin-left:8px">重置</t-button>
            </t-form-item>
          </t-form>

          <!-- 启动结果 -->
          <t-alert
            v-if="novelStartResult"
            :theme="novelStartResult.success ? 'success' : 'error'"
            :message="novelStartResult.message"
            style="margin-top:16px"
          >
            <template #operation>
              <t-button v-if="novelStartResult.success" size="small" theme="primary" variant="text" @click="goToMonitor(novelStartResult.instanceId)">
                查看进度 →
              </t-button>
            </template>
          </t-alert>
        </div>
      </t-tab-panel>

      <t-tab-panel value="workflows" label="📋 工作流实例">
        <div class="toolbar-row">
          <t-button theme="primary" size="small" @click="loadInstances">🔄 刷新</t-button>
          <t-button theme="default" size="small" @click="showImportDialog = true">➕ 导入模板</t-button>
          <t-tag v-if="runningCount > 0" theme="warning" variant="light">运行中: {{ runningCount }}</t-tag>
        </div>

        <!-- 实例列表 -->
        <t-table :data="instances" :columns="instanceColumns" row-key="id" size="small" :loading="loadingInstances" hover>
          <template #status="{row}">
            <t-tag v-if="row.status==='running'" theme="success" variant="light">🟢 运行中</t-tag>
            <t-tag v-else-if="row.status==='pending'" theme="default" variant="light">⏳ 等待中</t-tag>
            <t-tag v-else-if="row.status==='completed'" theme="primary" variant="light">✅ 已完成</t-tag>
            <t-tag v-else-if="row.status==='paused'" theme="warning" variant="light">⏸ 已暂停</t-tag>
            <t-tag v-else-if="row.status==='cancelled'" theme="danger" variant="light">❌ 已取消</t-tag>
            <t-tag v-else theme="default" variant="light">{{ row.status }}</t-tag>
          </template>
          <template #definitionId="{row}"><span style="font-size:12px;opacity:0.7">{{ row.definitionId }}</span></template>
          <template #startedAt="{row}">
            {{ new Date(row.startedAt).toLocaleString('zh-CN') }}
          </template>
          <template #ops="{row}">
            <t-space size="small">
              <t-button v-if="row.status==='pending'||row.status==='paused'" size="small" theme="success" variant="text" @click="resumeWorkflow(row)">▶️</t-button>
              <t-button v-if="row.status==='running'||row.status==='paused'" size="small" theme="warning" variant="text" @click="pauseWorkflow(row)">⏸</t-button>
              <t-button v-if="['pending','running','paused'].includes(row.status)" size="small" theme="danger" variant="text" @click="cancelWorkflow(row)">❌</t-button>
              <t-button size="small" theme="default" variant="text" @click="showDetail(row)">🔍</t-button>
            </t-space>
          </template>
        </t-table>

        <t-empty v-if="!loadingInstances && instances.length === 0" description="暂无工作流实例，请先导入模板后启动" />
      </t-tab-panel>

      <t-tab-panel value="templates" label="📦 可用模板">
        <div class="toolbar-row">
          <t-button theme="primary" size="small" @click="loadTemplates">🔄 刷新模板</t-button>
          <t-button theme="default" size="small" @click="generateWorkflow">AI 生成工作流</t-button>
        </div>
        <t-table :data="templates" :columns="templateColumns" row-key="id" size="small" hover>
          <template #nodeCount="{row}"><t-tag theme="primary" variant="light">{{ row.nodeCount || 0 }} nodes</t-tag></template>
          <template #version="{row}"><t-tag theme="default" variant="light">v{{ row.version }}</t-tag></template>
          <template #ops="{row}">
            <t-space size="small">
              <t-button size="small" theme="success" variant="text" @click="startFromTemplate(row)">▶️ 启动</t-button>
            </t-space>
          </template>
        </t-table>
      </t-tab-panel>

      <t-tab-panel value="agents" label="🤖 Agent注册">
        <div class="toolbar-row">
          <t-button theme="primary" size="small" @click="loadAgents">🔄 刷新Agent</t-button>
        </div>
        <t-table :data="agents" :columns="agentColumns" row-key="id" size="small" hover>
          <template #capabilities="{row}">{{ (row.capabilities || []).join(', ') }}</template>
        </t-table>
      </t-tab-panel>

      <t-tab-panel value="monitor" label="📊 实时监控">
        <HarnessMonitorReal />
      </t-tab-panel>
    </t-tabs>

    <!-- 工作流详情弹窗 -->
    <t-dialog v-model:visible="showDetailDialog" header="实例详情" width="600px" :footer="false">
      <div v-if="detailInstance" class="instance-detail">
        <h4>📋 基本信息</h4>
        <p><strong>ID:</strong> {{ detailInstance.id }}</p>
        <p><strong>状态:</strong>
          <t-tag v-if="detailInstance.status==='running'" theme="success" variant="light">🟢 运行中</t-tag>
          <t-tag v-else-if="detailInstance.status==='completed'" theme="primary" variant="light">✅ 已完成</t-tag>
          <t-tag v-else>{{ detailInstance.status }}</t-tag>
        </p>
        <p><strong>模板:</strong> {{ detailInstance.definitionId }}</p>
        <p><strong>开始时间:</strong> {{ new Date(detailInstance.startedAt).toLocaleString('zh-CN') }}</p>
        <p v-if="detailInstance.completedAt"><strong>完成时间:</strong> {{ new Date(detailInstance.completedAt).toLocaleString('zh-CN') }}</p>

        <h4 v-if="Object.keys(detailInstance.nodeStates || {}).length">⚙️ 节点状态</h4>
        <t-table v-if="Object.keys(detailInstance.nodeStates || {}).length" :data="nodeStateList" size="small" row-key="key">
          <template #state="{row}">
            <t-tag v-if="row.state==='completed'" theme="success" variant="light">{{ row.state }}</t-tag>
            <t-tag v-else-if="row.state==='running'" theme="warning" variant="light">{{ row.state }}</t-tag>
            <t-tag v-else>{{ row.state }}</t-tag>
          </template>
        </t-table>

        <!-- DAG 可视化 -->
        <h4 style="margin-top:16px">🔗 DAG 执行流</h4>
        <div class="dag-container">
          <VueFlow v-if="dagNodes.length" :nodes="dagNodes" :edges="dagEdges" :default-viewport="{x:0,y:0,zoom:0.8}" :min-zoom="0.3" :max-zoom="2" :nodes-draggable="false">
            <template #node-custom="props">
              <div :class="['dag-node', 'state-' + props.data.state]" @click="selectNode(props.id)">
                <div class="node-label">{{ props.data.label }}</div>
                <div class="node-state" v-if="props.data.state === 'running'">⏳ 执行中</div>
              </div>
            </template>
          </VueFlow>
          <t-empty v-else description="暂无DAG数据" size="small" />
        </div>
      </div>
    </t-dialog>

    <!-- 导入模板弹窗 -->
    <t-dialog v-model:visible="showImportDialog" header="从工作流库启动新实例" width="500px" @on-confirm="doStartFromTemplate">
      <t-form labelWidth="80px" labelAlign="top">
        <t-form-item label="模板选择">
          <t-select v-model="selectedTemplate" placeholder="请选择工作流模板">
            <t-option v-for="w in templates" :key="w.id" :value="w.id" :label="`${w.id} (v${w.version})`" />
          </t-select>
        </t-form-item>
        <t-form-item label="配置(JSON)">
          <t-textarea v-model="startConfig" placeholder='{"param1":"value1"}' :autosize="{ minRows: 4, maxRows: 8 }" />
        </t-form-item>
      </t-form>
    </t-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import axios from '@/utils/axios';
import { VueFlow } from '@vue-flow/core';
import projectStore from '@/stores/project';

// Tab 状态
const activeTab = ref('novel-start');
const onTabChange = (val: any) => { activeTab.value = val as string; };

// ── 小说→电影 启动表单 ──
const novelStartForm = ref({
  projectId: Number(projectStore().project?.id) || 0,
  workflowTemplate: 'film-production',
  chapterFrom: undefined as number | undefined,
  chapterTo: undefined as number | undefined,
  novelText: '',
});
const novelStartLoading = ref(false);
const novelStartResult = ref<{ success: boolean; message: string; instanceId?: string } | null>(null);
const projectList = computed(() => projectStore().allProject || []);

async function startFromNovel() {
  if (!novelStartForm.value.projectId) {
    window.$message.warning('请先选择项目');
    return;
  }
  novelStartLoading.value = true;
  novelStartResult.value = null;
  try {
    const payload: any = {
      projectId: novelStartForm.value.projectId,
      workflowTemplate: novelStartForm.value.workflowTemplate,
    };
    if (novelStartForm.value.novelText.trim()) {
      payload.novelText = novelStartForm.value.novelText;
    }
    if (novelStartForm.value.chapterFrom && novelStartForm.value.chapterTo) {
      payload.chapterRange = { from: novelStartForm.value.chapterFrom, to: novelStartForm.value.chapterTo };
    }
    const res = await axios.post('/harness/workflow/start-from-novel', payload);
    const data = res.data?.data || res.data;
    novelStartResult.value = {
      success: true,
      message: data.message || `工作流已启动，实例ID: ${data.instanceId?.substring(0, 8)}...`,
      instanceId: data.instanceId,
    };
    window.$message.success('小说→电影工作流已启动');
  } catch (e: any) {
    novelStartResult.value = {
      success: false,
      message: e?.message || e?.response?.data?.message || '启动失败',
    };
    window.$message.error(novelStartResult.value.message);
  } finally {
    novelStartLoading.value = false;
  }
}

function resetNovelForm() {
  novelStartForm.value = {
    projectId: Number(projectStore().project?.id) || 0,
    workflowTemplate: 'film-production',
    chapterFrom: undefined,
    chapterTo: undefined,
    novelText: '',
  };
  novelStartResult.value = null;
}

function goToMonitor(instanceId?: string) {
  activeTab.value = 'monitor';
  if (instanceId) {
    // 切到监控 Tab 后自动加载实例
    setTimeout(() => loadInstances(), 300);
  }
}

// ── 实例列表 ──
const instances = ref<any[]>([]);
const loadingInstances = ref(false);
const runningCount = computed(() => instances.value.filter((i: any) => i.status === 'running' || i.status === 'paused').length);

const instanceColumns = [
  { colKey: 'id', title: '实例ID', width: 140, ellipsis: true },
  { colKey: 'definitionId', title: '模板' },
  { colKey: 'status', title: '状态', width: 100 },
  { colKey: 'startedAt', title: '开始时间', width: 180 },
  { colKey: 'ops', title: '操作', width: 160, fixed: 'right' as const },
];

async function loadInstances() {
  // 从 agents 列表反推（后端暂存状态）
  loadingInstances.value = true;
  try {
    // 获取最近运行的实例
    const res = await axios.get('/harness/instances');
    instances.value = res.data?.data || [];
  } catch (e) {
    console.warn('加载实例列表失败:', e);
    instances.value = [];
  } finally {
    loadingInstances.value = false;
  }
}

// ── 模板列表 ──
const templates = ref<any[]>([]);
const templateColumns = [
  { colKey: 'id', title: '模板ID' },
  { colKey: 'version', title: '版本', width: 80 },
  { colKey: 'nodeCount', title: '节点数', width: 100 },
  { colKey: 'ops', title: '操作', width: 100 },
];

async function loadTemplates() {
  try {
    const res = await axios.get('/harness/workflows');
    templates.value = res.data?.data || [];
  } catch (e) {
    console.warn('加载模板列表失败:', e);
    templates.value = [];
  }
}

async function generateWorkflow() {
  const description = window.prompt("Describe the ComfyUI workflow to generate");
  if (!description?.trim()) return;
  try {
    await axios.post('/harness/workflow/generate', { description: description.trim(), type: 'image' });
    window.$message.success('工作流已生成');
    await loadTemplates();
  } catch (error: any) {
    window.$message.error(error?.response?.data?.message || error?.message || '工作流生成失败');
  }
}

// ── Agent注册列表 ──
const agents = ref<any[]>([]);
const agentColumns = [
  { colKey: 'id', title: 'ID' },
  { colkey: 'name', title: '名称' },
  { colKey: 'role', title: '角色' },
  { colKey: 'capabilities', title: '能力', minWidth: 200 },
  { colKey: 'version', title: '版本', width: 80 },
];

async function loadAgents() {
  try {
    const res = await axios.get('/harness/agents');
    agents.value = res.data?.data || [];
  } catch (e) {
    console.warn('加载Agent列表失败:', e);
    agents.value = [];
  }
}

// ── 工作流操作 ──
const showImportDialog = ref(false);
const selectedTemplate = ref('');
const startConfig = ref('{}');

async function doStartFromTemplate() {
  if (!selectedTemplate.value) return window.$message.warning('请选择模板');
  let config: any = {};
  try { config = JSON.parse(startConfig.value || '{}'); } catch (e) {}
  
  await axios.post('/harness/workflow/start', { workflowId: selectedTemplate.value, config });
  window.$message.success('工作流已启动');
  showImportDialog.value = false;
  loadInstances();
}

async function startFromTemplate(wf: any) {
  selectedTemplate.value = wf.id;
  startConfig.value = '{}';
  showImportDialog.value = true;
}

async function pauseWorkflow(inst: any) {
  try { await axios.post(`/harness/workflow/${inst.id}/pause`); window.$message.success('已暂停'); loadInstances(); }
  catch (e: any) { window.$message.error(e?.response?.data?.message || '失败'); }
}

async function resumeWorkflow(inst: any) {
  try { await axios.post(`/harness/workflow/${inst.id}/resume`); window.$message.success('已恢复'); loadInstances(); }
  catch (e: any) { window.$message.error(e?.response?.data?.message || '失败'); }
}

async function cancelWorkflow(inst: any) {
  if (!confirm(`确定取消实例 ${inst.id.substring(0,8)}...?`)) return;
  try { await axios.post(`/harness/workflow/${inst.id}/cancel`); window.$message.success('已取消'); loadInstances(); }
  catch (e: any) { window.$message.error(e?.response?.data?.message || '失败'); }
}

// ── 实例详情 + DAG ──
const showDetailDialog = ref(false);
const detailInstance = ref<any>(null);
const dagNodes = ref<any[]>([]);
const dagEdges = ref<any[]>([]);

function showDetail(inst: any) {
  detailInstance.value = inst;
  showDetailDialog.value = true;
  buildDAG(inst);
}

const nodeStateList = computed(() => {
  if (!detailInstance.value?.nodeStates) return [];
  return Object.entries(detailInstance.value.nodeStates).map(([key, state]) => ({ key, state }));
});

async function buildDAG(inst: any) {
  dagNodes.value = [];
  dagEdges.value = [];
  try {
    const res = await axios.get(`/harness/workflow/${inst.definitionId}/definition`);
    const def = res.data?.data;
    if (!def) return;

    const positions = computeLayerPositions(def.nodes, def.edges);
    dagNodes.value = def.nodes.map((n: any, i: number) => {
      const state = inst.nodeStates?.[n.id] || 'pending';
      return {
        id: n.id,
        type: 'custom',
        position: positions.get(n.id) || { x: (i % 3) * 250, y: Math.floor(i / 3) * 120 },
        data: { label: n.id.replace(/\./g, '\n'), state, role: n.agentRole, nodeType: n.type },
      };
    });
    dagEdges.value = (def.edges || []).map((e: any, i: number) => ({
      id: `e${i}`,
      source: e.from,
      target: e.to,
      type: 'smoothstep',
      animated: inst.nodeStates?.[e.to] === 'running',
    }));
  } catch (e) {
    console.warn('实例详情加载 DAG 失败:', e);
  }
}

function computeLayerPositions(nodes: any[], edges: any[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  nodes.forEach((n: any) => { inDegree.set(n.id, 0); adj.set(n.id, []); });
  edges.forEach((e: any) => { inDegree.set(e.to, (inDegree.get(e.to) || 0) + 1); adj.get(e.from)?.push(e.to); });
  const queue: string[] = [];
  nodes.forEach((n: any) => { if ((inDegree.get(n.id) || 0) === 0) queue.push(n.id); });
  let l = 0;
  while (queue.length > 0) {
    const size = queue.length;
    for (let i = 0; i < size; i++) {
      const id = queue.shift()!;
      positions.set(id, { x: l * 260, y: i * 120 });
      adj.get(id)?.forEach((next: string) => {
        const d = inDegree.get(next)! - 1;
        inDegree.set(next, d);
        if (d === 0) queue.push(next);
      });
    }
    l++;
  }
  return positions;
}

function selectNode(id: string) { console.log('Selected node:', id); }

// ── 实时监控组件 ──
import HarnessMonitorReal from '../../production/components/HarnessMonitor.vue';

// ── Tab 切换自动加载 ──
watch(activeTab, (tab) => {
  if (tab === 'workflows') loadInstances();
  else if (tab === 'templates') loadTemplates();
  else if (tab === 'agents') loadAgents();
});

onMounted(() => {
  loadInstances();
  loadTemplates();
  loadAgents();
});
</script>

<style scoped lang="scss">
.harness-manager { padding: 16px; }
.toolbar-row { display: flex; gap: 8px; margin-bottom: 12px; align-items: center; }
.novel-start-section { padding: 8px 0; max-width: 600px; }
.instance-detail { padding: 8px 0; }
.instance-detail p { margin: 4px 0; font-size: 13px; line-height: 1.6; }
.dag-container { margin-top: 12px; height: 300px; border: 1px solid var(--td-border-level-1-color); border-radius: 8px; overflow: hidden; background: #f7f8fa; }
.dag-node { padding: 8px 14px; border-radius: 8px; border: 2px solid #555; background: white; font-size: 12px; cursor: pointer; min-width: 120px; text-align: center; transition: all .2s; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
.dag-node:hover { border-color: var(--td-brand-color); box-shadow: 0 2px 8px rgba(52,152,219,.3); }
.state-completed { border-color: #2ecc71 !important; background: #eafaf1 !important; }
.state-running { border-color: var(--td-brand-color) !important; background: #ebf5fb !important; animation: glow 1.5s infinite; }
.state-failed { border-color: #e74c3c !important; background: #fdedec !important; }
.state-pending { border-color: #ccc !important; background: #f9f9f9 !important; }
@keyframes glow { 0%,100% { box-shadow: 0 0 4px rgba(52,152,219,.3); } 50% { box-shadow: 0 0 12px rgba(52,152,219,.6); } }
</style>
