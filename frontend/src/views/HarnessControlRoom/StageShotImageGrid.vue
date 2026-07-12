<template>
  <div class="stage-section">
    <div class="section-head">
      <div>
        <h3>生图网格</h3>
        <p>DPAgent 按 parallelDegree=4 执行，失败镜头会进入监制审核与重试队列。</p>
      </div>
      <t-button size="small" theme="primary" @click="$emit('openConfirm')">查看待确认</t-button>
    </div>
    <div class="shot-grid">
      <article v-for="shot in shots" :key="shot.id" class="shot-card" :class="shot.status">
        <div class="image"><i-pic /></div>
        <div class="meta">
          <strong>{{ shot.id }}</strong>
          <span>{{ labelMap[shot.status] }}</span>
        </div>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">
defineEmits<{ openConfirm: [] }>();

const labelMap: Record<string, string> = {
  done: "通过",
  running: "生成中",
  failed: "待处理",
  pending: "排队",
};

const shots = Array.from({ length: 24 }, (_, index) => ({
  id: `shot_${index + 1}`,
  status: index < 11 ? "done" : index === 11 ? "failed" : index < 16 ? "running" : "pending",
}));
</script>
