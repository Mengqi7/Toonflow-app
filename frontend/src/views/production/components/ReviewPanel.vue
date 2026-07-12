<template>
  <div class="review-panel">
    <div class="review-preview" v-if="currentImage">
      <img :src="currentImage" alt="Review Preview" />
      <t-tag :theme="overallPassed ? 'success' : 'warning'" variant="light" style="position:absolute;top:12px;right:12px">
        {{ overallPassed ? 'PASS' : 'FAIL' }} {{ (overallScore * 100).toFixed(0) }}%
      </t-tag>
    </div>
    <div v-else class="review-empty">
      <t-icon name="image" size="64px" style="color:#555" />
      <p style="color:#888;margin-top:12px">&#x9009;&#x62E9;&#x8282;&#x70B9;&#x67E5;&#x770B;&#x751F;&#x6210;&#x7ED3;&#x679C;</p>
    </div>
    <div class="review-scores">
      <t-collapse :default-value="['technical']">
        <t-collapse-panel value="technical" header="&#x6280;&#x672F;&#x8D28;&#x91CF;">
          <div v-for="k in techKeys" :key="k" class="score-row">
            <span>{{ k }}</span>
            <t-progress :percentage="(scores.technical[k] || 0) * 100" size="small" style="width:120px" />
          </div>
        </t-collapse-panel>
        <t-collapse-panel value="artistic" header="&#x827A;&#x672F;&#x8D28;&#x91CF;">
          <div v-for="k in artKeys" :key="k" class="score-row">
            <span>{{ k }}</span>
            <t-progress :percentage="(scores.artistic[k] || 0) * 100" size="small" style="width:120px" />
          </div>
        </t-collapse-panel>
        <t-collapse-panel value="content" header="&#x5185;&#x5BB9;&#x5339;&#x914D;">
          <div v-for="k in contentKeys" :key="k" class="score-row">
            <span>{{ k }}</span>
            <t-progress :percentage="(scores.contentMatch[k] || 0) * 100" size="small" style="width:120px" />
          </div>
        </t-collapse-panel>
      </t-collapse>
    </div>
    <div class="review-actions">
      <t-space>
        <t-button theme="success" @click="approve" :disabled="!currentImage">&#x2713; &#x901A;&#x8FC7;</t-button>
        <t-button theme="danger" @click="reject">&#x2717; &#x6253;&#x56DE;</t-button>
        <t-button variant="outline" @click="skip">&#x2192; &#x8DF3;&#x8FC7;</t-button>
      </t-space>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

interface ReviewScores {
  technical: Record<string, number>;
  artistic: Record<string, number>;
  contentMatch: Record<string, number>;
  overall: number;
}

const currentImage = ref('');
const scores = ref<ReviewScores>({
  technical: { resolution: 0.95, artifacts: 0.85, colorSpace: 0.9, format: 1.0 },
  artistic: { composition: 0.78, styleMatch: 0.82, lighting: 0.75, aesthetic: 0.8 },
  contentMatch: { sceneAccuracy: 0.88, characterMatch: 0.9, propAccuracy: 0.85 },
  overall: 0.86,
});

const techKeys = Object.keys(scores.value.technical);
const artKeys = Object.keys(scores.value.artistic);
const contentKeys = Object.keys(scores.value.contentMatch);

const overallScore = computed(() => scores.value.overall);
const overallPassed = computed(() => scores.value.overall >= 0.75);

const emit = defineEmits(['approve', 'reject', 'skip']);

function approve() { emit('approve', { image: currentImage.value, scores: scores.value }); }
function reject() { emit('reject', { image: currentImage.value, scores: scores.value }); }
function skip() { emit('skip'); }
</script>

<style scoped lang="scss">
.review-panel { display: flex; flex-direction: column; height: 100%; padding: 16px; gap: 12px; }
.review-preview { flex: 1; position: relative; display: flex; align-items: center; justify-content: center; background: #111; border-radius: 8px; overflow: hidden; }
.review-preview img { max-width: 100%; max-height: 100%; object-fit: contain; }
.review-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.review-scores { max-height: 250px; overflow-y: auto; }
.score-row { display: flex; align-items: center; justify-content: space-between; padding: 4px 0; font-size: 13px; }
.review-actions { padding: 8px 0; text-align: center; }
</style>
