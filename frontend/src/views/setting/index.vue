<template>
  <div class="page-container">
    <t-menu theme="light" :value="activeMenu" @change="handleMenuChange">
      <!-- 基础设置 -->
      <t-menu-item value="model">🧠 模型管理</t-menu-item>
      <t-menu-item value="comfyui">🎨 ComfyUI 配置</t-menu-item>
      <t-menu-item value="agentConfig">🤖 Agent配置</t-menu-item>
      <t-menu-item value="skills">🛠 Skills 管理</t-menu-item>
      <t-menu-item value="harness">⚙️ Harness 工程</t-menu-item>
    </t-menu>
    
    <div class="content-area">
      <!-- 模型管理 -->
      <div v-show="activeMenu === 'model'" class="menu-content">
        <VendorConfig />
      </div>
      
      <!-- Agent配置 -->
      <div v-show="activeMenu === 'agentConfig'" class="menu-content">
        <AgentConfig />
      </div>
      
      <!-- ComfyUI 配置 -->
      <div v-show="activeMenu === 'comfyui'" class="menu-content">
        <ComfyuiConfig />
      </div>
      
      <!-- Skills管理 -->
      <div v-show="activeMenu === 'skills'" class="menu-content">
        <SkillManagement />
      </div>
      
      <!-- Harness 工程管理 -->
      <div v-show="activeMenu === 'harness'" class="menu-content">
        <HarnessManager />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import VendorConfig from '../../components/setting/components/vendorConfig.vue';
import AgentConfig from '../../components/setting/components/agentConfog.vue';
import SkillManagement from '../../components/setting/components/skillManagement.vue';
import HarnessManager from './components/HarnessManager.vue';

const activeMenu = ref(localStorage.getItem('harness_active_menu') || 'model');

const handleMenuChange = (value: string | number) => {
  activeMenu.value = String(value);
  localStorage.removeItem('harness_active_menu');
};
</script>

<style lang="scss" scoped>
.page-container {
  display: flex;
  height: calc(100vh - 60px);
  
  .t-menu {
    width: 200px;
    border-right: 1px solid var(--td-border-level-1-color);
  }
  
  .content-area {
    flex: 1;
    padding: 24px;
    overflow-y: auto;
    
    .menu-content {
      max-width: 800px;
    }
  }
}
</style>
