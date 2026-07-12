<template>
  <div class="stage-section">
    <div class="section-head">
      <div>
        <h3>剧本阶段</h3>
        <p>source="harness" 的剧本片段会在这里聚合展示，同时仍可回到 #/script 维护。</p>
      </div>
      <t-tag theme="success" variant="light">8 场已生成</t-tag>
    </div>
    <t-table :data="rows" :columns="columns" row-key="id" size="small" />
  </div>
</template>

<script setup lang="ts">
const rows = [
  { id: "s1", scene: "第 1 场", summary: "陈凡在旧书房接到遗嘱通知", location: "旧宅书房", status: "已确认" },
  { id: "s2", scene: "第 2 场", summary: "家族会议揭开继承争议", location: "会客厅", status: "已确认" },
  { id: "s3", scene: "第 3 场", summary: "主角发现账本夹层线索", location: "阁楼", status: "待复核" },
];

const columns = [
  { colKey: "scene", title: "场次", width: 90 },
  { colKey: "summary", title: "剧情摘要" },
  { colKey: "location", title: "场景", width: 120 },
  { colKey: "status", title: "状态", width: 100 },
];
</script>
