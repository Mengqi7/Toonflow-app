<template>
  <div class="stage-section">
    <div class="section-head">
      <div>
        <h3>视频生成</h3>
        <p>VFXAgent 等待关键帧通过后启动，视频结果回写 o_assets(type=video)。</p>
      </div>
      <t-tag theme="default" variant="light">等待依赖</t-tag>
    </div>
    <div class="video-grid">
      <article v-for="clip in clips" :key="clip" class="video-card">
        <i-video-one />
        <span>{{ clip }}</span>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">
const clips = Array.from({ length: 12 }, (_, index) => `clip_${index + 1}`);
</script>
