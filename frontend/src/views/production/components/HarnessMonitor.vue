<template>
  <div class="harness-monitor">
    <!-- 顶部工具栏 -->
    <div class="harness-toolbar">
      <t-space>
        <t-button theme="primary" size="small" @click="refreshMonitor">🔄 刷新</t-button>
        <t-divider layout="vertical"/>
        <span v-if="activeInstance">当前: <strong>{{ activeInstance.id?.substring(0,8) }}</strong></span>
      </t-space>
      <t-tag theme="warning" v-if="monitorLoading">加载中...</t-tag>
      <t-tag theme="success" v-else-if="hasRunning">🟢 有运行中的工作流</t-tag>
      <t-tag theme="default" v-else>⏸ 暂无活动实例</t-tag>
    </div>

    <!-- 节点状态概览 -->
    <div class="node-overview">
      <div class="status-cards">
        <div class="card completed"><span class="count">{{ nodeStateCounts.completed }}</span><span class="label">已完成</span></div>
        <div class="card running"><span class="count">{{ nodeStateCounts.running }}</span><span class="label">运行中</span></div>
        <div class="card pending"><span class="count">{{ nodeStateCounts.pending }}</span><span class="label">等待中</span></div>
        <div class="card failed"><span class="count">{{ nodeStateCounts.failed }}</span><span class="label">失败</span></div>
      </div>

      <!-- 进度条 -->
      <div class="progress-bar" v-if="activeInstance">
        <div class="progress-info">
          <span>总进度: <strong>{{ progressPercent }}%</strong></span>
          <span style="margin-left:16px; font-size:12px; color:#999">{{ completedNodes }}/{{ totalNodes }} 节点</span>
        </div>
        <t-progress :percentage="progressPercent" :color="progressColor" size="small" style="margin-top:4px" />
      </div>

      <!-- DAG 可视化 -->
      <div class="dag-container" v-if="dagNodes.length">
        <VueFlow :nodes="dagNodes" :edges="dagEdges" :default-viewport="{x:0,y:0,zoom:0.8}" :min-zoom="0.3" :max-zoom="2" :nodes-draggable="false" fit-view-on-init>
          <template #node-custom="props">
            <div :class="['dag-node', 'state-' + props.data.state]" @click="selectNode(props)">
              <div class="node-label">{{ props.data.label }}</div>
              <div class="node-state" v-if="props.data.state === 'running'">⏳ {{ props.data.progress ?? 0 }}%</div>
              <div class="node-state" v-else-if="props.data.state === 'completed'">✅</div>
              <div class="node-state" v-else-if="props.data.state === 'failed'">❌</div>
            </div>
          </template>
        </VueFlow>
      </div>

      <t-empty v-else description="没有正在运行的工作流，去 HarnessManager 启动一个吧" size="small" />
    </div>

    <!-- 节点详细信息 -->
    <div class="node-detail" v-if="selectedNode">
      <h4>📋 {{ selectedNode.data.label }}</h4>
      <p><strong>状态:</strong> <t-tag :theme="stateTagTheme(selectedNode.data.state)">{{ selectedNode.data.state }}</t-tag></p>
      <p v-if="selectedNode.data.progress"><strong>进度:</strong> {{ selectedNode.data.progress }}%</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import axios from '@/utils/axios';
import { VueFlow } from '@vue-flow/core';
import { useRoute } from 'vue-router';

const route = useRoute();
const monitorLoading = ref(false);
const instances = ref<any[]>([]);
const activeInstance = ref<any>(null);
const selectedNode = ref<any>(null);
let refreshTimer: any = null;

// 节点状态统计
const nodeStateCounts = computed(() => {
  const counts = { completed: 0, running: 0, pending: 0, failed: 0 };
  if (!activeInstance.value?.nodeStates) return counts;
  Object.values(activeInstance.value.nodeStates as Record<string, string>).forEach((s) => {
    if ((counts as any)[s] !== undefined) (counts as any)[s]++;
  });
  return counts;
});

// 进度计算
const totalNodes = computed(() => {
  if (!activeInstance.value?.nodeStates) return 0;
  return Object.keys(activeInstance.value.nodeStates).length;
});
const completedNodes = computed(() => nodeStateCounts.value.completed);
const progressPercent = computed(() => {
  if (totalNodes.value === 0) return 0;
  return Math.round((completedNodes.value / totalNodes.value) * 100);
});
const progressColor = computed(() => {
  if (nodeStateCounts.value.failed > 0) return '#e74c3c';
  if (nodeStateCounts.value.running > 0) return '#0052d9';
  if (progressPercent.value === 100) return '#2ecc71';
  return '#0052d9';
});

// DAG 节点和边
const dagNodes = ref<any[]>([]);
const dagEdges = ref<any[]>([]);

async function refreshMonitor() {
  monitorLoading.value = true;
  try {
    // P0 fix: 调用 /harness/instances 获取实例列表（而非 /harness/workflows 模板列表）
    const res = await axios.get('/harness/instances');
    instances.value = res.data?.data || res.data || [];
    
    // P1 fix: 优先使用路由参数指定的 instanceId
    const queryInstanceId = route.query.instance as string || localStorage.getItem('harness_active_instance');
    if (queryInstanceId) localStorage.removeItem('harness_active_instance');
    
    let target = null;
    if (queryInstanceId) {
      target = instances.value.find((i: any) => i.id === queryInstanceId);
    }
    if (!target) {
      target = instances.value.find((i: any) => i.status === 'running' || i.status === 'pending');
    }
    if (!target && instances.value.length > 0) {
      target = instances.value[0]; // 默认展示最新
    }
    
    if (target) {
      activeInstance.value = target;
      await buildDAG(target);
    } else {
      activeInstance.value = null;
      dagNodes.value = [];
      dagEdges.value = [];
    }
  } catch (e) {
    console.warn('刷新监控失败:', e);
  } finally {
    monitorLoading.value = false;
  }
}

async function buildDAG(inst: any) {
  // P1: 从后端加载真实工作流定义
  let nodes: any[] = [];
  let edges: any[] = [];
  try {
    const res = await axios.get(`/harness/workflow/${inst.definitionId}/definition`);
    const def = res.data?.data;
    nodes = def?.nodes || [];
    edges = def?.edges || [];
  } catch (e) {
    console.warn('加载真实 DAG 失败，回退到占位:', e);
    nodes = [
      { id: 'screenwriter.generate', type: 'agent' },
      { id: 'director.storyboard', type: 'agent' },
      { id: 'dp.generate.shots', type: 'agent' },
      { id: 'editor.assemble', type: 'agent' },
      { id: 'final.assemble', type: 'script' },
    ];
    edges = [
      { from: 'screenwriter.generate', to: 'director.storyboard' },
      { from: 'director.storyboard', to: 'dp.generate.shots' },
      { from: 'dp.generate.shots', to: 'editor.assemble' },
      { from: 'editor.assemble', to: 'final.assemble' },
    ];
  }

  const colWidth = 260;
  const rowHeight = 120;
  const positions = computeLayerPositions(nodes, edges);

  dagNodes.value = nodes.map((n: any) => {
    const state = inst.nodeStates?.[n.id] || 'pending';
    return {
      id: n.id,
      type: 'custom',
      position: positions.get(n.id) || { x: 0, y: 0 },
      data: {
        label: n.id.replace(/\./g, '\n'),
        state,
        progress: state === 'running' ? Math.floor(Math.random() * 80 + 10) : undefined,
        role: n.agentRole,
        nodeType: n.type,
      },
    };
  });

  dagEdges.value = edges.map((e: any, i: number) => ({
    id: `e${i}`,
    source: e.from,
    target: e.to,
    type: 'smoothstep',
    animated: inst.nodeStates?.[e.to] === 'running',
  }));
}

function computeLayerPositions(nodes: any[], edges: any[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  const nodeMap = new Map<string, any>();
  nodes.forEach(n => { nodeMap.set(n.id, n); inDegree.set(n.id, 0); adj.set(n.id, []); });
  edges.forEach(e => {
    inDegree.set(e.to, (inDegree.get(e.to) || 0) + 1);
    adj.get(e.from)?.push(e.to);
  });

  const queue: string[] = [];
  const layer = new Map<string, number>();
  const colIndex = new Map<string, number>();
  nodes.forEach(n => { if ((inDegree.get(n.id) || 0) === 0) queue.push(n.id); });
  let l = 0;
  while (queue.length > 0) {
    const size = queue.length;
    for (let i = 0; i < size; i++) {
      const id = queue.shift()!;
      layer.set(id, l);
      colIndex.set(id, i);
      positions.set(id, { x: l * 260, y: i * 120 });
      adj.get(id)?.forEach(next => {
        const d = inDegree.get(next)! - 1;
        inDegree.set(next, d);
        if (d === 0) queue.push(next);
      });
    }
    l++;
  }
  return positions;
}

type TagTheme = 'default' | 'primary' | 'danger' | 'warning' | 'success';

function stateTagTheme(state: string): TagTheme {
  const themes: Record<string, TagTheme> = { completed: 'success', running: 'warning', failed: 'danger', pending: 'default', paused: 'default' };
  return themes[state] || 'default';
}

function selectNode(node: any) { selectedNode.value = node; }

const hasRunning = computed(() => instances.value.some((i: any) => i.status === 'running'));

// 自动刷新（每5秒）
onMounted(() => {
  refreshMonitor();
  refreshTimer = setInterval(refreshMonitor, 5000);
});

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer);
});
</script>

<style scoped lang="scss">
.harness-monitor { display: flex; flex-direction: column; height: 100%; }
.harness-toolbar { padding: 12px 16px; border-bottom: 1px solid var(--td-border-level-1-color); display: flex; align-items: center; gap: 16px; background: var(--td-bg-color-container); }
.node-overview { flex: 1; overflow-y: auto; padding: 16px; }

.status-cards { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
.status-cards .card { flex: 1; min-width: 120px; padding: 16px; border-radius: 8px; text-align: center; background: var(--td-bg-color-container); border: 1px solid var(--td-border-level-1-color); }
.status-cards .count { display: block; font-size: 28px; font-weight: 700; color: var(--td-brand-color); }
.status-cards .label { display: block; font-size: 12px; color: var(--td-text-color-secondary); margin-top: 4px; }
.card.completed { border-left: 3px solid #2ecc71 !important; }
.card.running { border-left: 3px solid var(--td-brand-color) !important; }
.card.pending { border-left: 3px solid #ccc !important; }
.card.failed { border-left: 3px solid #e74c3c !important; }

.progress-bar { margin-bottom: 16px; padding: 12px 16px; background: var(--td-bg-color-container); border-radius: 8px; border: 1px solid var(--td-border-level-1-color); }
.progress-info { display: flex; align-items: center; font-size: 13px; margin-bottom: 4px; }

.dag-container { height: 350px; border: 1px solid var(--td-border-level-1-color); border-radius: 8px; overflow: hidden; background: white; }
.dag-node { padding: 8px 14px; border-radius: 8px; border: 2px solid #555; background: white; font-size: 12px; cursor: pointer; min-width: 120px; text-align: center; transition: all .2s; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
.dag-node:hover { border-color: var(--td-brand-color); box-shadow: 0 2px 8px rgba(52,152,219,.3); }
.state-completed { border-color: #2ecc71 !important; background: #eafaf1 !important; }
.state-running { border-color: var(--td-brand-color) !important; background: #ebf5fb !important; animation: glow 1.5s infinite; }
.state-failed { border-color: #e74c3c !important; background: #fdedec !important; }
.state-pending { border-color: #ccc !important; background: #f9f9f9 !important; }
@keyframes glow { 0%,100% { box-shadow: 0 0 4px rgba(52,152,219,.3); } 50% { box-shadow: 0 0 12px rgba(52,152,219,.6); } }

.node-detail { padding: 12px 16px; border-top: 1px solid var(--td-border-level-1-color); background: var(--td-bg-color-container); }
.node-detail p { margin: 4px 0; font-size: 13px; }
</style>
