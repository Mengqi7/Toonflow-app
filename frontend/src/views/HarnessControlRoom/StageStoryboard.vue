<template>
  <div class="stage-section">
    <div class="section-head">
      <div>
        <h3>分镜表</h3>
        <p>副导演拆解的镜头清单，后续生图与生视频均按 shotId 追踪。</p>
      </div>
      <t-tag theme="success" variant="light">24 / 24</t-tag>
    </div>
    <t-table :data="rows" :columns="columns" row-key="id" size="small" />
  </div>
</template>

<script setup lang="ts">
const rows = Array.from({ length: 6 }, (_, index) => ({
  id: `shot_${index + 1}`,
  shot: `shot_${index + 1}`,
  camera: index % 2 ? "中景推近" : "正面特写",
  prompt: "人物位于旧宅书房，暖色台灯，电影感布光",
  status: index < 5 ? "已回写" : "待生图",
}));

const columns = [
  { colKey: "shot", title: "镜头", width: 100 },
  { colKey: "camera", title: "机位", width: 120 },
  { colKey: "prompt", title: "Prompt" },
  { colKey: "status", title: "状态", width: 100 },
];
</script>
