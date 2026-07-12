<template>
  <div class="stage-section">
    <div class="section-head">
      <div>
        <h3>美术部门</h3>
        <p>角色、场景、道具按资产中心结构归档，供 DP 和 VFX 复用一致性参考。</p>
      </div>
      <t-radio-group v-model="active" variant="default-filled" size="small">
        <t-radio-button value="character">角色</t-radio-button>
        <t-radio-button value="scene">场景</t-radio-button>
        <t-radio-button value="prop">道具</t-radio-button>
      </t-radio-group>
    </div>
    <div class="asset-grid">
      <article v-for="item in filteredItems" :key="item.name" class="asset-card">
        <div class="thumb"><component :is="item.icon" /></div>
        <strong>{{ item.name }}</strong>
        <span>{{ item.desc }}</span>
        <t-tag size="small" theme="success" variant="light">source=harness</t-tag>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

const active = ref("character");
const items = [
  { type: "character", name: "陈凡", desc: "黑色长发，冷静克制", icon: "i-user" },
  { type: "character", name: "林晚", desc: "浅色风衣，警觉敏锐", icon: "i-user" },
  { type: "scene", name: "旧宅书房", desc: "木质书柜，暖色台灯", icon: "i-home" },
  { type: "scene", name: "雨夜庭院", desc: "湿润石板路，强反光", icon: "i-rain" },
  { type: "prop", name: "旧账本", desc: "暗红封皮，夹层纸条", icon: "i-notebook" },
  { type: "prop", name: "银色钥匙", desc: "家徽刻纹，轻微氧化", icon: "i-key" },
];

const filteredItems = computed(() => items.filter((item) => item.type === active.value));
</script>
