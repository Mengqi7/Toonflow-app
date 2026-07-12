<template><div class="comfyui-config">
  <div class="toolbar">
    <t-button theme="primary" @click="showAddServer=true"><t-icon name="add"/> 添加 ComfyUI 服务</t-button>
    <t-divider layout="vertical"/>
    <t-upload :auto-upload="false" accept=".json" @change="onFileChange" :max=1>
      <t-button theme="success"><t-icon name="upload"/> 一键导入工作流 JSON</t-button>
    </t-upload>
  </div>

  <!-- 服务列表 -->
  <h3 class="section-title">ComfyUI 服务 ({{servers.length}})</h3>
  <div class="serverGrid">
    <div v-for="s in servers" :key="s.id" class="serverCard" :class="{disabled:!s.enabled}">
      <div class="cardHeader">
        <span class="serverName">{{s.name||'未命名服务'}}</span>
        <t-switch v-model="s.enabled" :customValue="[1,0]" size="small" @change="toggleServer(s)"/>
      </div>
      <div class="cardBody">
        <p><t-icon name="link" style="margin-right:4px;vertical-align:middle"/> {{s.baseUrl}}</p>
        <p v-if="s.wsUrl"><t-icon name="connection" style="margin-right:4px;vertical-align:middle"/> {{s.wsUrl}}</p>
      </div>
      <div class="cardFooter">
        <t-button size="small" variant="outline" @click="testConnection(s)">测试连接</t-button>
        <t-button size="small" variant="text" theme="danger" @click="deleteServer(s.id)">删除</t-button>
      </div>
    </div>
    <div class="serverCard emptyCard" @click="showAddServer=true">
      <t-icon name="add" size="32px"/><p>添加服务</p>
    </div>
  </div>

  <!-- 工作流库 -->
  <h3 class="section-title">工作流库 ({{workflows.length}})</h3>
  <t-table :data="workflows" :columns="wfColumns" row-key="id" size="small" hover>
    <template #type="{row}"><t-tag :theme="row.type==='video'?'warning':'primary'" variant="light">{{row.type}}</t-tag></template>
    <template #autoConfig="{row}">
      <t-tag v-if="row.autoConfig" theme="success" variant="light">✓ 自动适配</t-tag>
      <t-tag v-else theme="default" variant="light">手动导入</t-tag>
    </template>
    <template #op="{row}"><t-space size="small">
      <t-button size="small" variant="text" @click="testWorkflow(row)">测试</t-button>
      <t-button size="small" variant="text" theme="danger" @click="deleteWorkflow(row.id)">删除</t-button>
    </t-space></template>
  </t-table>

  <!-- 拖拽上传区域 -->
  <div class="dropZone" v-if="dragOver" @dragleave.prevent="dragOver=false">
    <t-icon name="upload" size="48px"/><p>松开鼠标自动导入</p>
  </div>

  <!-- 添加服务弹窗 -->
  <t-dialog v-model:visible="showAddServer" header="添加 ComfyUI 服务" @confirm="doAddServer">
    <t-form labelWidth="80px" labelAlign="top">
      <t-form-item label="名称"><t-input v-model="newServer.name" placeholder="例如：本地ComfyUI"/></t-form-item>
      <t-form-item label="地址"><t-input v-model="newServer.baseUrl" placeholder="http://localhost:8188"/></t-form-item>
      <t-form-item label="WebSocket (可选)"><t-input v-model="newServer.wsUrl" placeholder="ws://localhost:8188"/></t-form-item>
    </t-form>
  </t-dialog>

  <!-- 工作流详情弹窗 -->
  <t-dialog v-model:visible="showWorkflowDetail" header="工作流详情" width="700px">
    <div class="workflow-detail">
      <h4>📋 基本信息</h4>
      <p><strong>名称：</strong>{{currentWorkflow.name}}</p>
      <p><strong>类型：</strong><t-tag theme="primary" variant="light">{{currentWorkflow.type}}</t-tag></p>
      <p><strong>节点数：</strong>{{currentWorkflow.nodeCount || '-'}} 个</p>
      
      <h4 v-if="currentWorkflow.params?.length">⚙️ 可调参数 ({{currentWorkflow.params.length}})</h4>
      <t-table v-if="currentWorkflow.params?.length" :data="currentWorkflow.params" size="small" hover :columns="paramColumns">
        <template #type="{row}"><t-tag :theme="row.type==='string'?'primary':row.type==='number'?'warning':'default'" variant="light">{{row.type}}</t-tag></template>
      </t-table>
      
      <h4>🔗 节点列表 (前20个)</h4>
      <div class="node-list">
        <div v-for="(n,i) in (currentWorkflow.nodes?.slice(0,20)||[]) " :key="i" class="node-item">
          <t-tag size="small">{{i+1}}</t-tag> {{n.type}} @ {{n.pos?.join(',')}}
        </div>
      </div>
    </div>
  </t-dialog>
</div></template>

<script setup lang="ts">
import {ref,reactive,onMounted} from 'vue';
import axios from 'axios';

const servers=ref<any[]>([]);
const workflows=ref<any[]>([]);
const showAddServer=ref(false);
const showWorkflowDetail=ref(false);
const dragOver=ref(false);
const newServer=reactive({name:'',baseUrl:'http://localhost:8188',wsUrl:''});
let wfJson:any=null;
let currentWorkflow=ref<any>({});

const paramColumns=[{colKey:'nodeId',title:'节点ID'},{colKey:'widgetName',title:'参数名'},{colKey:'type',title:'类型'}];
const wfColumns=[{colKey:'name',title:'名称'},{colKey:'type',title:'类型'},{colKey:'autoConfig',title:'适配'}, {colKey:'nodeCount',title:'节点数'},{colKey:'op',title:'操作',width:120}];

async function load(){
  try{
    const r=await axios.get('/api/comfyui/getServerList');servers.value=r.data.data||[];
    const w=await axios.get('/api/comfyui/getWorkflows');workflows.value=w.data.data||[];
  }catch(e){console.error('加载失败:',e);window.$message.error('加载配置失败')}
}

async function doAddServer(){
  if(!newServer.baseUrl) { window.$message.warning('请输入地址'); return; }
  try{
    await axios.post('/api/comfyui/addServer',{name:newServer.name,baseUrl:newServer.baseUrl,wsUrl:newServer.wsUrl});
    window.$message.success('服务添加成功');
    newServer.name='';newServer.baseUrl='http://localhost:8188';showAddServer.value=false;load()
  }catch(e){window.$message.error('添加失败')}
}

async function deleteServer(id:number){
  if(!confirm('确定删除此服务？')) return;
  await axios.delete('/api/comfyui/deleteServer/'+id);load()
}

async function toggleServer(s:any){
  await axios.post('/api/comfyui/addServer',{name:s.name,baseUrl:s.baseUrl,enabled:s.enabled});
}

async function testConnection(s:any){
  try{
    const r=await axios.post('/api/comfyui/testServer/'+s.id+'/test');
    window.$message.success(r.data.data?.status||'连接成功');
  }catch(e){window.$message.error('连接失败')}
}

// 一键导入工作流 JSON (核心功能)
async function onFileChange(files:any){
  const file=files?.raw || files?.[0]?.raw;
  if(!file){return;}
  
  try{
    const reader=new FileReader();
    wfJson=await new Promise((resolve,reject)=>{
      reader.onload=()=>resolve(JSON.parse(reader.result as string));
      reader.onerror=reject;
      reader.readAsText(file);
    });
    
    window.$message.loading('正在分析工作流...');
    const analysis=analyzeWorkflow(wfJson);
    
    await axios.post('/api/comfyui/importWorkflow',{
      name: analysis.name,
      type: analysis.type,
      workflowJson: JSON.stringify(wfJson),
      autoConfig: true,
      params: analysis.params
    });
    
    window.$message.success(`导入成功！${analysis.name} (${analysis.nodeCount}节点)`);
    dragOver.value=false;showWorkflowDetail.value=true;load();wfJson=null;
  }catch(e){
    console.error('导入失败:',e);
    window.$message.error('导入失败: '+( (e as any)?.message || '未知错误'));
  }
}

// 自动分析工作流结构
function analyzeWorkflow(json:any):{name:string,type:string,nodeCount:number,params:any[]}{
  const nodes=json.nodes||[];
  let type='image';
  let name='未命名工作流';
  let params:any[]=[];
  
  for(const node of nodes){
    if(node.type?.includes('video')||node.type?.includes('Animate')){type='video';}
    else if(node.type?.includes('Checkpoint')){name=node.widgets_values?.[0]?.replace('.safetensors','').slice(0,30)||name;}
  }
  
  for(const node of nodes){
    const widgets=node.widgets_values||[];
    if(widgets){
      for(let i=0;i<widgets.length;i++){
        const val=widgets[i];
        if(typeof val==='string'&&!val.includes('.ckpt')&&!val.includes('.safetensors')){
          params.push({nodeId:node.id,widgetName:`${node.type}_${i}`,type:'string',defaultValue:val});
        }else if(typeof val==='number'){
          params.push({nodeId:node.id,widgetName:`${node.type}_${i}_seed`,type:'number',defaultValue:val});
        }
      }
    }
  }
  
  return {name,type,nodeCount:nodes.length,params};
}

async function testWorkflow(w:any){try{await axios.post('/api/comfyui/testWorkflow/'+w.id+'/test');window.$message.success('测试已提交')}catch(e){window.$message.error('测试失败')}}
async function deleteWorkflow(id:number){if(!confirm('确定删除？')) return; await axios.delete('/api/comfyui/deleteWorkflow/'+id);load()}

function showDetail(wf:any){currentWorkflow.value={...wf,nodes:JSON.parse(wf.workflow_json||'[]').nodes,autoConfig:wf.autoConfig};showWorkflowDetail.value=true;}
function onDragOver(e:Event){e.preventDefault();dragOver.value=true;}
function onDragLeave(e:Event){e.preventDefault();dragOver.value=false;}
function onDrop(e:DragEvent){e.preventDefault();dragOver.value=false;const file=e.dataTransfer?.files[0];if(file)onFileChange({raw:file});}

onMounted(()=>{
  document.addEventListener('dragover',onDragOver);
  document.addEventListener('dragleave',onDragLeave);
  document.addEventListener('drop',onDrop);
  load();
});
</script>

<style scoped lang="scss">
.comfyui-config{padding:16px 0}
.toolbar{display:flex;gap:12px;margin-bottom:24px;align-items:center}
.section-title{font-size:16px;font-weight:600;margin:24px 0 12px;color:var(--td-text-color-primary)}
.serverGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}
.serverCard{background:var(--td-bg-color-container);border:1px solid var(--td-border-level-1-color);border-radius:8px;padding:16px;transition:all .2s}
.serverCard:hover{border-color:var(--td-brand-color)}
.serverCard.disabled{opacity:.6}
.emptyCard{display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;color:var(--td-text-color-placeholder);min-height:120px}
.emptyCard:hover{border-color:var(--td-brand-color);color:var(--td-brand-color)}
.dropZone{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#f0f9ff;border:2px dashed #1890ff;padding:40px;border-radius:8px;text-align:center;z-index:1000}
.workflow-detail{padding:16px 0}
.node-list{max-height:200px;overflow-y:auto;margin-top:8px}
.node-item{display:flex;gap:8px;padding:4px 0;border-bottom:1px solid var(--td-border-level-1-color)}
</style>
