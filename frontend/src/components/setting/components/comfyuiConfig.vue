<template><div class="comfyui-config"><div class="listHeader"><t-button theme="primary" @click="addServerDialog=true"><t-icon name="add"/>添加 ComfyUI 服务</t-button></div>
<div class="serverGrid"><div v-for="s in servers" :key="s.id" class="serverCard" :class="{disabled:!s.enabled}">
<div class="cardHeader"><span class="serverName">{{s.name||'未命名'}}</span><t-switch v-model="s.enabled" :customValue="[1,0]" size="small" @change="toggleServer(s)"/></div>
<div class="cardBody"><p><t-icon name="link"/> {{s.baseUrl}}</p></div>
<div class="cardFooter"><t-button size="small" variant="outline" @click="testConnection(s)">测试连接</t-button><t-button size="small" variant="text" theme="danger" @click="deleteServer(s.id)">删除</t-button></div></div>
<div class="serverCard emptyCard" @click="addServerDialog=true"><t-icon name="add" size="32px"/><p>添加服务</p></div></div>
<t-divider/>
<div class="listHeader"><span>工作流库</span><t-button size="small" @click="dialogVisible=true">导入 JSON</t-button></div>
<t-table :data="workflows" :columns="wfColumns" row-key="id" size="small" hover>
<template #type="{row}"><t-tag :theme="row.type==='video'?'warning':'primary'" variant="light">{{row.type}}</t-tag></template>
<template #op="{row}"><t-space size="small"><t-button size="small" variant="text" @click="testWorkflow(row)">测试</t-button><t-button size="small" variant="text" theme="danger" @click="deleteWorkflow(row.id)">删除</t-button></t-space></template>
</t-table></div>

<t-dialog header="添加 ComfyUI 服务" v-model:visible="addServerDialog" @confirm="doAddServer"><t-form><t-form-item label="名称"><t-input v-model="newServer.name"/></t-form-item><t-form-item label="地址"><t-input v-model="newServer.baseUrl" placeholder="http://localhost:8188"/></t-form-item></t-form></t-dialog>

<t-dialog header="导入工作流" v-model:visible="dialogVisible" @confirm="doImport"><t-form><t-form-item label="名称"><t-input v-model="wfName"/></t-form-item><t-form-item label="JSON文件"><t-upload :auto-upload="false" accept=".json" @change="onFileChange"/></t-form-item></t-form></t-dialog>
</template>

<script setup lang="ts">
import {ref,reactive,onMounted} from 'vue';
import axios from 'axios';

const servers=ref<any[]>([]);
const workflows=ref<any[]>([]);
const addServerDialog=ref(false);
const dialogVisible=ref(false);
const newServer=reactive({name:'',baseUrl:'http://localhost:8188'});
const wfName=ref('');
let wfJson:any=null;

const wfColumns=[{colKey:'name',title:'名称'},{colKey:'type',title:'类型'},{colKey:'createdBy',title:'来源',width:80},{colKey:'op',title:'操作',width:120}];

async function load(){try{const r=await axios.get('/api/comfyui/getServerList');servers.value=r.data.data||[];const w=await axios.get('/api/comfyui/getWorkflows');workflows.value=w.data.data||[]}catch(e){console.error(e)}}
async function doAddServer(){await axios.post('/api/comfyui/addServer',newServer);newServer.name='';newServer.baseUrl='http://localhost:8188';addServerDialog.value=false;load()}
async function deleteServer(id:number){await axios.delete('/api/comfyui/deleteServer/'+id);load()}
async function toggleServer(s:any){await axios.post('/api/comfyui/addServer',{name:s.name,baseUrl:s.baseUrl,enabled:s.enabled})}
async function testConnection(s:any){try{const r=await axios.post('/api/comfyui/testServer/'+s.id+'/test');alert(r.data.data?.status||'连接失败')}catch{alert('连接失败')}}
async function testWorkflow(w:any){try{const r=await axios.post('/api/comfyui/testWorkflow/'+w.id+'/test');alert('已提交: '+JSON.stringify(r.data))}catch{alert('测试失败')}}
async function deleteWorkflow(id:number){await axios.delete('/api/comfyui/deleteWorkflow/'+id);load()}
function onFileChange(f:any){const file=f.raw;if(!file)return;const reader=new FileReader();reader.onload=()=>{wfJson=JSON.parse(reader.result as string)};reader.readAsText(file)}
async function doImport(){if(!wfJson){alert('请选择JSON文件');return};await axios.post('/api/comfyui/importWorkflow',{name:wfName.value||'导入的工作流',type:'image',workflowJson:JSON.stringify(wfJson)});dialogVisible.value=false;load()}
onMounted(load);
</script>

<style scoped lang="scss">
.comfyui-config{padding:16px 0}
.listHeader{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}
.serverGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}
.serverCard{background:var(--td-bg-color-container);border:1px solid var(--td-border-level-1-color);border-radius:8px;padding:16px;transition:all .2s}
.serverCard:hover{border-color:var(--td-brand-color)}
.serverCard.disabled{opacity:.6}
.emptyCard{display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;color:var(--td-text-color-placeholder);min-height:120px}
.emptyCard:hover{border-color:var(--td-brand-color);color:var(--td-brand-color)}
.cardHeader{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.serverName{font-weight:600;font-size:15px}
.cardBody p{font-size:13px;color:var(--td-text-color-secondary);display:flex;align-items:center;gap:6px;margin:4px 0}
.cardFooter{display:flex;gap:8px;margin-top:12px}
</style>