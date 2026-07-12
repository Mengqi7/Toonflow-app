<template>
  <div class="stage-section">
    <div class="section-head">
      <div>
        <h3>版本历史</h3>
        <p>审核失败时保存当前版本，回滚会创建新的当前版本，历史不覆盖。</p>
      </div>
      <t-button size="small" variant="outline">对比版本</t-button>
    </div>
    <div class="version-list">
      <article v-for="version in versions" :key="version.id" class="version-card" :class="{ current: version.current }">
        <div class="thumb"><i-pic /></div>
        <div>
          <strong>{{ version.label }}</strong>
          <p>{{ version.note }}</p>
        </div>
        <t-tag :theme="version.passed ? 'success' : 'danger'" variant="light">{{ version.passed ? "通过" : "打回" }}</t-tag>
        <t-button size="small" variant="outline" :disabled="version.current">回滚</t-button>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">
const versions = [
  { id: "v2", label: "v2 当前版本", note: "综合 0.85，主体居中，角色一致", passed: true, current: true },
  { id: "v1", label: "v1 历史版本", note: "综合 0.58，构图偏离，已被打回", passed: false, current: false },
];
</script>
