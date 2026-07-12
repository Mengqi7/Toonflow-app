<template>
  <div class="stage-section">
    <div class="section-head">
      <div>
        <h3>审核报告</h3>
        <p>review.scored 事件会实时刷新评分、反馈和跨工种打回建议。</p>
      </div>
      <t-tag theme="warning" variant="light">1 条打回</t-tag>
    </div>
    <div class="score-list">
      <div v-for="item in scores" :key="item.name" class="score-row">
        <span>{{ item.name }}</span>
        <t-progress :percentage="Math.round(item.value * 100)" :color="item.value >= 0.75 ? '#10b981' : '#f59e0b'" />
        <strong>{{ item.value.toFixed(2) }}</strong>
      </div>
    </div>
    <t-alert theme="warning" title="shot_12 构图未通过" message="主体偏离中心，建议重写构图 prompt 或打回副导演调整镜头类型。" />
  </div>
</template>

<script setup lang="ts">
const scores = [
  { name: "技术质量", value: 0.92 },
  { name: "构图", value: 0.58 },
  { name: "风格一致性", value: 0.86 },
  { name: "角色一致性", value: 0.81 },
];
</script>
