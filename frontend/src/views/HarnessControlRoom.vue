<template>
  <div class="harness-factory">
    <header class="factory-topbar">
      <div class="brand-block">
        <span class="brand-kicker">AI Harness Film Factory</span>
        <h1>全闭环影视工业流水线</h1>
      </div>
      <div class="project-block">
        <strong>项目：{{ project?.name || "退婚后，我继承万亿家产" }}</strong>
        <span>实例 {{ instanceId }} · 工厂中控 · 人工只保留决策与环节终审权</span>
      </div>
      <div class="top-actions">
        <span class="status-pill">{{ connected ? "实时事件流 · 已连接" : "本地预览 · 可交互" }}</span>
        <button class="ghost-btn" type="button" @click="controlHarness('pause')">暂停</button>
        <button class="ghost-btn" type="button" @click="controlHarness('resume')">恢复</button>
        <button class="ghost-btn danger-action" type="button" @click="controlHarness('cancel')">取消</button>
        <button class="primary-btn" type="button" @click="setScene('review')">进入终审</button>
      </div>
    </header>

    <main class="factory-grid">
      <aside class="factory-panel pipeline-panel">
        <div class="panel-head">
          <h2>Agent 工位管线</h2>
          <span class="tag run">产物流转</span>
        </div>
        <div class="station-list">
          <template v-for="group in stationGroups" :key="group.name">
            <div class="group-label">{{ group.name }}</div>
            <button
              v-for="station in group.items"
              :key="station.id"
              class="station"
              :class="[station.status, { active: selectedStation.id === station.id }]"
              type="button"
              @click="selectStation(station.id)">
              <span>
                <strong>{{ station.name }}</strong>
                <small>{{ station.desc }}</small>
              </span>
              <i :class="['tag', station.status]">{{ statusLabel(station.status) }}</i>
            </button>
          </template>
        </div>
      </aside>

      <section class="center-stack">
        <section class="factory-panel work-panel">
          <div class="work-top">
            <div>
              <h2>{{ selectedStation.name }}</h2>
              <p>{{ selectedStation.desc }} · 输入、模型、提示词、产物和审核责任全部可追踪。</p>
            </div>
            <div class="scene-tabs">
              <button :class="{ active: activeScene === 'station' }" type="button" @click="setScene('station')">工位详情</button>
              <button :class="{ active: activeScene === 'script' }" type="button" @click="setScene('script')">剧本专项</button>
              <button :class="{ active: activeScene === 'art' }" type="button" @click="setScene('art')">美术专项</button>
              <button :class="{ active: activeScene === 'storyboard' }" type="button" @click="setScene('storyboard')">分镜专项</button>
              <button :class="{ active: activeScene === 'video' }" type="button" @click="setScene('video')">视频专项</button>
              <button :class="{ active: activeScene === 'post' }" type="button" @click="setScene('post')">音剪成片</button>
              <button :class="{ active: activeScene === 'loop' }" type="button" @click="setScene('loop')">闭环总览</button>
              <button :class="{ active: activeScene === 'review' }" type="button" @click="setScene('review')">审核闭环</button>
              <button :class="{ active: activeScene === 'settings' }" type="button" @click="setScene('settings')">Agent 设置</button>
              <button :class="{ active: activeScene === 'trace' }" type="button" @click="setScene('trace')">追溯链</button>
            </div>
          </div>

          <form class="command-dock" @submit.prevent="sendDirectorMessage">
            <label for="director-command">导演指令</label>
            <input
              id="director-command"
              v-model.trim="directorCommand"
              type="text"
              placeholder="例如：仅重跑 shot_12，并要求保持 CHR-02 角色一致性" />
            <button class="primary-btn" type="submit">发送</button>
          </form>

          <div v-if="activeScene === 'station'" class="scene station-scene">
            <div class="metric-row">
              <article>
                <span>工位状态</span>
                <strong>{{ statusLabel(selectedStation.status) }}</strong>
              </article>
              <article>
                <span>产物版本</span>
                <strong>{{ selectedStation.version }}</strong>
              </article>
              <article>
                <span>模型调用</span>
                <strong>{{ selectedStation.calls }}</strong>
              </article>
              <article>
                <span>审核评分</span>
                <strong>{{ selectedStation.score }}</strong>
              </article>
            </div>

            <div class="quad-grid">
              <article class="info-module">
                <h3>输入信息区</h3>
                <pre>{{ selectedStation.input }}</pre>
              </article>
              <article class="info-module">
                <h3>工作过程区</h3>
                <pre>{{ selectedStation.process }}</pre>
              </article>
              <article class="info-module">
                <h3>产物输出区</h3>
                <pre>{{ selectedStation.output }}</pre>
              </article>
              <article class="info-module">
                <h3>审核闭环区</h3>
                <pre>{{ selectedStation.review }}</pre>
              </article>
            </div>
          </div>

          <div v-else-if="activeScene === 'script'" class="scene script-scene">
            <div class="scene-title">
              <h2>剧本创作线 / 文本产物透明化</h2>
              <p>展示小说输入、剧本改编、台词打磨、剧本审核与打回重写，明确每一版剧本文字由谁生成、谁审核、为什么修改。</p>
            </div>
            <div class="quad-grid script-grid">
              <article class="info-module script-board">
                <h3>输入原文与导演调度</h3>
                <pre>{{ scriptLab.source }}</pre>
              </article>
              <article class="info-module script-board">
                <h3>剧本改编 Agent 输出</h3>
                <pre>{{ scriptLab.adaptation }}</pre>
              </article>
              <article class="info-module script-board">
                <h3>台词打磨 Agent 输出</h3>
                <pre>{{ scriptLab.dialogue }}</pre>
              </article>
              <article class="info-module script-board">
                <h3>剧本内容审核闭环</h3>
                <pre>{{ scriptLab.review }}</pre>
              </article>
            </div>
            <div class="artifact-strip">
              <article v-for="item in scriptLab.versions" :key="item.id" :class="['artifact-card', item.status]">
                <span>{{ item.id }}</span>
                <strong>{{ item.title }}</strong>
                <p>{{ item.meta }}</p>
              </article>
            </div>
            <StageScriptEditor :project-id="project?.id" />
          </div>

          <div v-else-if="activeScene === 'art'" class="scene art-scene">
            <div class="scene-title">
              <h2>美术设定线 / 角色服化道场景资产工厂</h2>
              <p>串联角色设定、服化道、场景概念与衍生图合成，展示设计依据、提示词、参考资产、输出图版本和图片质量审核。</p>
            </div>
            <div class="art-lab">
              <article v-for="asset in artAssets" :key="asset.id" class="art-asset-card">
                <div class="asset-preview">
                  <span>{{ asset.short }}</span>
                </div>
                <div class="asset-body">
                  <div class="asset-head">
                    <div>
                      <span class="asset-id">{{ asset.id }}</span>
                      <strong>{{ asset.title }}</strong>
                    </div>
                    <span :class="['tag', asset.status]">{{ asset.statusLabel }}</span>
                  </div>
                  <p>{{ asset.description }}</p>
                  <dl>
                    <div><dt>生成 Agent</dt><dd>{{ asset.agent }}</dd></div>
                    <div><dt>审核 Agent</dt><dd>{{ asset.reviewer }}</dd></div>
                    <div><dt>模型</dt><dd>{{ asset.model }}</dd></div>
                    <div><dt>存储位</dt><dd>{{ asset.storage }}</dd></div>
                  </dl>
                  <pre>{{ asset.prompt }}</pre>
                  <p class="review-note">{{ asset.review }}</p>
                </div>
              </article>
            </div>
          </div>

          <div v-else-if="activeScene === 'storyboard'" class="scene storyboard-scene">
            <div class="storyboard-toolbar">
              <button class="primary-btn" type="button">批量查看提示词合规报告</button>
              <button class="violet-btn" type="button">批量触发重生成</button>
              <button class="ghost-btn" type="button">批量调整一致性约束</button>
              <span>当前批次：shot_09 - shot_14 / 6 镜头 / 1 个打回闭环</span>
            </div>
            <div class="storyboard-lab">
              <div class="graph-board">
                <div class="wire wire-a"></div>
                <div class="wire wire-b"></div>
                <div class="wire wire-c"></div>
                <article class="graph-node hot node-a">
                  <strong>分镜脚本</strong>
                  <span>S03 拆为 4 个镜头，写入景别、运镜、机位、动作和时长。</span>
                </article>
                <article class="graph-node node-b">
                  <strong>提示词优化</strong>
                  <span>逐镜输出正向词、负向词、模型参数和一致性约束。</span>
                </article>
                <article class="graph-node danger node-c">
                  <strong>图片质量审核</strong>
                  <span>shot_12 角色视线偏移，前景纵深不足，触发打回。</span>
                </article>
                <article class="graph-node hot node-d">
                  <strong>分镜生图执行</strong>
                  <span>模型 ImageForge-Cine v2.8，保留 seed、CFG、steps。</span>
                </article>
                <article class="graph-node node-e">
                  <strong>版本归档</strong>
                  <span>v01/v02/v03 对比，历史不覆盖。</span>
                </article>
              </div>

              <aside class="shot-inspector">
                <div class="inspector-head">
                  <span class="tag return">{{ selectedShotDetail.statusLabel }}</span>
                  <strong>{{ selectedShotDetail.id }} · {{ selectedShotDetail.view }} · {{ selectedShotDetail.duration }}</strong>
                </div>
                <div class="shot-preview-grid">
                  <span v-for="version in selectedShotDetail.versions" :key="version.id" :class="['shot-version', version.status]">
                    <b>{{ version.id }}</b>
                    <small>{{ version.note }}</small>
                  </span>
                </div>
                <div class="inspector-block">
                  <h3>分镜文字 / 镜头语言</h3>
                  <p>{{ selectedShotDetail.script }}</p>
                  <dl>
                    <div><dt>机位</dt><dd>{{ selectedShotDetail.camera }}</dd></div>
                    <div><dt>运镜</dt><dd>{{ selectedShotDetail.motion }}</dd></div>
                    <div><dt>光影</dt><dd>{{ selectedShotDetail.lighting }}</dd></div>
                    <div><dt>动作</dt><dd>{{ selectedShotDetail.action }}</dd></div>
                  </dl>
                </div>
                <div class="inspector-block">
                  <h3>提示词与模型调用</h3>
                  <pre>模型: {{ selectedShotDetail.model }}
参数: {{ selectedShotDetail.params }}
正向提示词:
{{ selectedShotDetail.positivePrompt }}

负向提示词:
{{ selectedShotDetail.negativePrompt }}</pre>
                </div>
                <div class="inspector-block">
                  <h3>参考资产 / 审核闭环</h3>
                  <p>参考资产：{{ selectedShotDetail.references.join(" / ") }}</p>
                  <p>审核 Agent：{{ selectedShotDetail.reviewer }}</p>
                  <p>审核意见：{{ selectedShotDetail.review }}</p>
                  <p>打回指令：{{ selectedShotDetail.retryInstruction }}</p>
                </div>
              </aside>
            </div>
            <StageShotImageGrid :items="shots.map(shot => ({ id: shot.id, status: shot.label }))" />
          </div>

          <div v-else-if="activeScene === 'video'" class="scene video-scene">
            <div class="scene-title">
              <h2>视频生产线 / 单镜片段透明化</h2>
              <p>把已审分镜图、动效提示词、模型参数、输出片段、视频审核和打回重跑串成可追溯闭环。</p>
            </div>
            <div class="storyboard-lab">
              <div class="graph-board video-board">
                <div class="wire wire-a"></div>
                <div class="wire wire-b"></div>
                <div class="wire wire-c"></div>
                <article class="graph-node hot node-a">
                  <strong>已审分镜图</strong>
                  <span>接收 ART-SB-012-v04 作为视频首帧参考，不暴露具体生成后端。</span>
                </article>
                <article class="graph-node hot node-b">
                  <strong>视频生成 Agent</strong>
                  <span>生成动效提示词、运动强度、镜头锁定、时长与 seed。</span>
                </article>
                <article class="graph-node danger node-c">
                  <strong>视频质量审核</strong>
                  <span>检测闪烁、角色漂移、动作断裂、镜头语言偏移。</span>
                </article>
                <article class="graph-node node-d">
                  <strong>一致性校验</strong>
                  <span>跨镜头比对角色、服装、色调、场景纵深。</span>
                </article>
                <article class="graph-node node-e">
                  <strong>片段写回</strong>
                  <span>写入 o_video_clip，保留提示词、模型参数、审核报告和版本链。</span>
                </article>
              </div>

              <aside class="shot-inspector video-inspector">
                <div class="inspector-head">
                  <span class="tag review">{{ selectedVideoClip.statusLabel }}</span>
                  <strong>{{ selectedVideoClip.id }} · {{ selectedVideoClip.duration }} · {{ selectedVideoClip.fps }}fps</strong>
                </div>
                <div class="shot-preview-grid">
                  <span v-for="version in selectedVideoClip.versions" :key="version.id" :class="['shot-version', version.status]">
                    <b>{{ version.id }}</b>
                    <small>{{ version.note }}</small>
                  </span>
                </div>
                <div class="inspector-block">
                  <h3>输入与参考资产</h3>
                  <p>{{ selectedVideoClip.script }}</p>
                  <dl>
                    <div><dt>首帧参考</dt><dd>{{ selectedVideoClip.referenceImage }}</dd></div>
                    <div><dt>镜头运动</dt><dd>{{ selectedVideoClip.cameraMotion }}</dd></div>
                    <div><dt>动作节奏</dt><dd>{{ selectedVideoClip.actionRhythm }}</dd></div>
                    <div><dt>一致性锁定</dt><dd>{{ selectedVideoClip.consistencyLock }}</dd></div>
                  </dl>
                </div>
                <div class="inspector-block">
                  <h3>动效提示词与模型参数</h3>
                  <pre>模型: {{ selectedVideoClip.model }}
参数: {{ selectedVideoClip.params }}
动效提示词:
{{ selectedVideoClip.motionPrompt }}

负向约束:
{{ selectedVideoClip.negativePrompt }}</pre>
                </div>
                <div class="inspector-block">
                  <h3>输出片段 / 审核闭环</h3>
                  <p>输出产物：{{ selectedVideoClip.output }}</p>
                  <p>审核 Agent：{{ selectedVideoClip.reviewer }}</p>
                  <p>审核意见：{{ selectedVideoClip.review }}</p>
                  <p>打回指令：{{ selectedVideoClip.retryInstruction }}</p>
                </div>
              </aside>
            </div>
          </div>

          <div v-else-if="activeScene === 'post'" class="scene post-scene">
            <div class="scene-title">
              <h2>音剪合成线 / 从单镜片段到成片验收</h2>
              <p>把配音、配乐、剪辑合成、音画同步审核和总监制终验串起来，展示最终成片不是黑盒导出，而是可回溯的工业装配线。</p>
            </div>
            <div class="post-lab">
              <article v-for="item in postPipeline" :key="item.id" :class="['post-step', item.status]">
                <div class="post-step-head">
                  <span>{{ item.id }}</span>
                  <strong>{{ item.title }}</strong>
                  <b :class="['tag', item.status]">{{ item.statusLabel }}</b>
                </div>
                <p>{{ item.summary }}</p>
                <dl>
                  <div><dt>输入</dt><dd>{{ item.input }}</dd></div>
                  <div><dt>输出</dt><dd>{{ item.output }}</dd></div>
                  <div><dt>模型/工具</dt><dd>{{ item.model }}</dd></div>
                  <div><dt>审核/下游</dt><dd>{{ item.review }}</dd></div>
                </dl>
                <pre>{{ item.log }}</pre>
              </article>
            </div>
          </div>

          <div v-else-if="activeScene === 'loop'" class="scene loop-scene">
            <div class="scene-title">
              <h2>自驱闭环 Loop / 产物流转与返工主控图</h2>
              <p>把输入、规划、执行、回写、专项审核、总监制复核、人工终审、打回重跑和版本归档放在同一张工厂管线图里。</p>
            </div>
            <div class="loop-map">
              <article v-for="node in loopNodes" :key="node.id" :class="['loop-node', node.status]">
                <span>{{ node.id }}</span>
                <strong>{{ node.title }}</strong>
                <p>{{ node.desc }}</p>
                <small>{{ node.event }}</small>
              </article>
            </div>
            <div class="loop-grid">
              <article v-for="loop in loopContracts" :key="loop.title" class="loop-contract">
                <h3>{{ loop.title }}</h3>
                <p>{{ loop.rule }}</p>
                <pre>{{ loop.flow }}</pre>
              </article>
            </div>
          </div>

          <div v-else-if="activeScene === 'review'" class="scene review-scene">
            <div class="scene-title">
              <h2>审核指挥台 / 专项审核矩阵 + 打回责任链</h2>
              <p>每一条审核都明确审核 Agent、审核对象、核心维度、打回对接 Agent、当前产物、修正意见与循环次数，方便定位是谁生成、谁审核、失败后回到谁。</p>
            </div>
            <div class="audit-matrix">
              <article v-for="audit in auditMatrix" :key="audit.agent" :class="['audit-card', audit.status]">
                <header>
                  <span>{{ audit.object }}</span>
                  <b :class="['tag', audit.status]">{{ audit.label }}</b>
                </header>
                <h3>{{ audit.agent }}</h3>
                <dl>
                  <div><dt>核心维度</dt><dd>{{ audit.dimensions }}</dd></div>
                  <div><dt>打回对接</dt><dd>{{ audit.rerouteTarget }}</dd></div>
                  <div><dt>当前产物</dt><dd>{{ audit.artifact }}</dd></div>
                  <div><dt>循环次数</dt><dd>{{ audit.loopCount }}</dd></div>
                </dl>
                <p>{{ audit.fix }}</p>
              </article>
            </div>
            <div class="quad-grid">
              <article class="info-module">
                <h3>专项审核报告</h3>
                <div class="audit-list">
                  <div v-for="audit in audits" :key="audit.name" class="audit-row">
                    <span>{{ audit.name }}</span>
                    <b :class="audit.status">{{ audit.label }}</b>
                  </div>
                </div>
              </article>
              <article class="info-module">
                <h3>打回重跑链路</h3>
                <pre>问题产物: storyboard_image.shot_12.v03
审核 Agent: 图片质量审核 Agent
打回对象: 分镜生图执行 Agent
打回原因: 人物视线方向与台词情绪不一致，前景纵深不足。
修正要求: 保留 CHR-02；重写构图约束；参考 SCN-04 光影。
触发事件: review.reroute -> task.started</pre>
              </article>
              <article class="info-module">
                <h3>人工终审决策</h3>
                <p>每个决策都会写入用户选择，并模拟 DirectorOrchestrator 更新任务图。</p>
                <div class="decision-actions">
                  <button class="primary-btn" type="button" @click="submitUserInput('approve_storyboard')">通过</button>
                  <button class="violet-btn" type="button" @click="submitUserInput('rerun_shot_image')">打回原工位</button>
                  <button class="violet-btn" type="button" @click="submitUserInput('reroute_scene_concept')">跨工种打回</button>
                  <button class="ghost-btn" type="button" @click="submitUserInput('manual_edit_then_review')">人工修改后再审</button>
                  <button class="ghost-btn" type="button" @click="submitUserInput('pause_for_instruction')">暂停并补充指令</button>
                </div>
              </article>
              <article class="info-module">
                <h3>事件流</h3>
                <div class="event-list">
                  <span v-for="event in visibleEvents" :key="event.id">{{ event.kind }} / {{ eventSummary(event) }}</span>
                </div>
              </article>
            </div>
          </div>

          <div v-else-if="activeScene === 'settings'" class="scene settings-scene">
            <article v-for="setting in settingCards" :key="setting.title" class="setting-card">
              <h3>{{ setting.title }}</h3>
              <p>{{ setting.desc }}</p>
              <button type="button" @click="openSetting(setting.key)">编辑</button>
            </article>
          </div>

          <div v-else class="scene trace-scene">
            <article v-for="trace in traces" :key="trace.id" class="trace-card">
              <strong>{{ trace.id }}</strong>
              <span>{{ trace.desc }}</span>
            </article>
          </div>
        </section>

        <section class="factory-panel shot-rail">
          <div class="rail-line">
            <i v-for="shot in shots" :key="shot.id" :style="{ left: shot.marker }"></i>
          </div>
          <div class="shot-list">
            <button
              v-for="shot in shots"
              :key="shot.id"
              class="shot-card"
              :class="[shot.status, { active: selectedShotId === shot.id }]"
              type="button"
              @click="selectShot(shot.id)">
              <span class="shot-thumb"></span>
              <strong>{{ shot.id }}</strong>
              <small>{{ shot.view }} · {{ shot.duration }}</small>
              <i :class="['tag', shot.status]">{{ shot.label }}</i>
            </button>
          </div>
        </section>
      </section>

      <aside class="factory-panel monitor-panel">
        <div class="panel-head">
          <h2>审核 / 监控环</h2>
          <span class="tag review">待终审</span>
        </div>
        <div class="monitor-grid">
          <article>
            <span>总进度</span>
            <strong>{{ liveProgress }}</strong>
          </article>
          <article>
            <span>循环次数</span>
            <strong>{{ liveRetryCount }}</strong>
          </article>
          <article>
            <span>活动工位</span>
            <strong>{{ liveActiveCount }}</strong>
          </article>
          <article>
            <span>异常</span>
            <strong>{{ liveErrorCount }}</strong>
          </article>
        </div>
        <section class="gate-card">
          <h3>分镜阶段终审</h3>
          <p>总监制建议：打回分镜生图执行 Agent 重跑 shot_12，保留角色与场景约束。</p>
          <div>
            <button class="primary-btn" type="button" @click="submitUserInput('approve_storyboard')">通过</button>
            <button class="violet-btn" type="button" @click="setScene('review')">查看详情</button>
          </div>
        </section>
        <section>
          <h3>审核矩阵</h3>
          <div class="audit-list">
            <div v-for="audit in audits" :key="`side-${audit.name}`" class="audit-row">
              <span>{{ audit.name }}</span>
              <b :class="audit.status">{{ audit.label }}</b>
            </div>
          </div>
        </section>
        <section class="warehouse-section">
          <div class="warehouse-head">
            <h3>Artifact Warehouse</h3>
            <select v-model="warehouseFilter" aria-label="artifact type">
              <option value="">All types</option>
              <option value="script">Script</option>
              <option value="image">Image</option>
              <option value="video">Video</option>
              <option value="review">Review</option>
            </select>
          </div>
          <div v-if="warehouseItems.length" class="warehouse-list">
            <article v-for="item in warehouseItems.slice(0, 8)" :key="`${item.artifactType}-${item.artifactKey}-${item.version}`" class="warehouse-item">
              <strong>{{ item.artifactKey }}</strong>
              <span>v{{ item.version }} · {{ item.artifactType }} · {{ item.source || "harness" }}</span>
              <b :class="item.reviewScore ? 'pass' : 'wait'">{{ item.reviewScore || "Pending review" }}</b>
            </article>
          </div>
          <p v-else class="warehouse-empty">No persisted artifact versions for this instance</p>
        </section>
      </aside>
    </main>
  </div>
</template>

<script setup lang="ts">
import axios from "@/utils/axios";
import { useHarnessEventStream, type HarnessEvent } from "@/composables/useHarnessEventStream";
import projectStore from "@/stores/project";
import { computed, onMounted, ref, watch } from "vue";
import StageScriptEditor from "./script/components/StageScriptEditor.vue";
import StageShotImageGrid from "./cornerScape/components/StageShotImageGrid.vue";

type StationStatus = "run" | "pass" | "review" | "return" | "wait";
type HarnessScene = "station" | "script" | "art" | "storyboard" | "video" | "post" | "loop" | "review" | "settings" | "trace";

interface Station {
  id: string;
  group: string;
  name: string;
  status: StationStatus;
  desc: string;
  version: string;
  calls: string;
  score: string;
  input: string;
  process: string;
  output: string;
  review: string;
}

interface ShotDetail {
  id: string;
  view: string;
  duration: string;
  statusLabel: string;
  script: string;
  camera: string;
  motion: string;
  lighting: string;
  action: string;
  model: string;
  params: string;
  positivePrompt: string;
  negativePrompt: string;
  references: string[];
  reviewer: string;
  review: string;
  retryInstruction: string;
  versions: Array<{ id: string; status: StationStatus; note: string }>;
}

interface VideoClipDetail {
  id: string;
  duration: string;
  fps: string;
  statusLabel: string;
  script: string;
  referenceImage: string;
  cameraMotion: string;
  actionRhythm: string;
  consistencyLock: string;
  model: string;
  params: string;
  motionPrompt: string;
  negativePrompt: string;
  output: string;
  reviewer: string;
  review: string;
  retryInstruction: string;
  versions: Array<{ id: string; status: StationStatus; note: string }>;
}

interface ArtAsset {
  id: string;
  title: string;
  short: string;
  status: StationStatus;
  statusLabel: string;
  description: string;
  agent: string;
  reviewer: string;
  model: string;
  storage: string;
  prompt: string;
  review: string;
}

interface PostPipelineItem {
  id: string;
  title: string;
  status: StationStatus;
  statusLabel: string;
  summary: string;
  input: string;
  output: string;
  model: string;
  review: string;
  log: string;
}

interface LoopNode {
  id: string;
  title: string;
  desc: string;
  event: string;
  status: StationStatus;
}

interface LoopContract {
  title: string;
  rule: string;
  flow: string;
}

const route = useRoute();
const router = useRouter();
const { project } = storeToRefs(projectStore());
const instanceId = computed(() => String(route.params.instanceId || "demo"));
const harnessScenes: HarnessScene[] = ["station", "script", "art", "storyboard", "video", "post", "loop", "review", "settings", "trace"];
const activeScene = ref<HarnessScene>("station");
const selectedStationId = ref("shot-image");

const stations = ref<Station[]>([
  {
    id: "director",
    group: "调度类 Agent",
    name: "总导演调度 Agent",
    status: "run",
    desc: "任务拆解 / 跨 Agent 协同 / 风格统一",
    version: "v01",
    calls: "8",
    score: "0.94",
    input: "人工制片需求\n- 原著小说 / 创意大纲\n- 风格: 都市复仇 / 高级冷感 / 快节奏\n- 成片标准: 90s 竖屏短剧样片",
    process: "模型: DirectorPlanner-v1.6\n策略: 分阶段门禁 + 自动打回\n输出事件: taskgraph.created, task.started",
    output: "全流程任务排期\n节点执行指令 24 条\n跨 Agent 协同信号 8 条",
    review: "总监制复核: 通过\n人工终审: 无需\n下一步: 派发剧本与美术并行线",
  },
  {
    id: "script-adapter",
    group: "执行类 / 剧本线",
    name: "剧本改编 Agent",
    status: "pass",
    desc: "小说转剧本 / 场次拆分 / 情绪标注",
    version: "v02",
    calls: "3",
    score: "0.91",
    input: "原著小说 + 总导演调度指令",
    process: "模型: ScriptForge-Drama v3\n步骤: 提炼冲突 -> 场次拆分 -> 情绪曲线",
    output: "o_script/S03.v02\n8 场剧本，主情绪: 克制反击",
    review: "剧本内容审核 Agent: 通过\n评分: 0.91",
  },
  {
    id: "dialogue",
    group: "执行类 / 剧本线",
    name: "台词打磨 Agent",
    status: "pass",
    desc: "人物语言 / 语速 / 台词时序",
    version: "v02",
    calls: "2",
    score: "0.89",
    input: "审核通过的初版剧本",
    process: "模型: DialoguePolish v2\n约束: 女主冷静，男配压迫感",
    output: "终版台词 S03.dialogue.v02\n含语气、语速、停顿标注",
    review: "剧本内容审核 Agent: 通过\n无打回",
  },
  {
    id: "character",
    group: "执行类 / 美术线",
    name: "角色设定 Agent",
    status: "pass",
    desc: "角色卡 / 外貌 / 一致性规则",
    version: "v04",
    calls: "6",
    score: "0.94",
    input: "终版剧本 + 角色风格要求",
    process: "模型: CharacterBible v2.4\n生成 CHR-01~CHR-06",
    output: "角色设定卡 6 份\n一致性约束 42 条",
    review: "角色设定审核 Agent: 通过\n评分: 0.94",
  },
  {
    id: "costume-prop",
    group: "执行类 / 美术线",
    name: "服化道设计 Agent",
    status: "run",
    desc: "服装 / 妆容 / 道具清单",
    version: "v02",
    calls: "5",
    score: "0.82",
    input: "角色设定卡 + 剧本场景要求",
    process: "模型: CostumeProp v1.9\n正在生成宴会礼服与随身道具",
    output: "服化道设计稿 v02\n道具: 黑卡、合同、红酒杯",
    review: "场景道具审核 Agent: 等待",
  },
  {
    id: "scene-concept",
    group: "执行类 / 美术线",
    name: "场景概念 Agent",
    status: "pass",
    desc: "空间布局 / 光影 / 天气时段",
    version: "v01",
    calls: "4",
    score: "0.9",
    input: "剧本场次 S03 + 美术风格",
    process: "模型: SceneConcept v2.2\n设定: 暮色宴会厅 / 逆光 / 冷色金属",
    output: "SCN-04-v01\n空间纵深、光影参数、环境元素",
    review: "场景道具审核 Agent: 通过",
  },
  {
    id: "derivative-image",
    group: "执行类 / 美术线",
    name: "衍生图合成 Agent",
    status: "run",
    desc: "角色着装图 / 场景效果图 / 道具特写",
    version: "v02",
    calls: "12",
    score: "0.81",
    input: "角色设定 + 服化道 + 场景设定",
    process: "模型: ImageForge-Cine v2.8\n提示词: role full-body, obsidian dress, banquet hall",
    output: "角色全身图 6 张\n场景效果图 4 张\n道具特写 8 张",
    review: "图片质量审核 Agent: 进行中",
  },
  {
    id: "storyboard-script",
    group: "执行类 / 分镜线",
    name: "分镜脚本 Agent",
    status: "pass",
    desc: "景别 / 运镜 / 机位 / 时长",
    version: "v02",
    calls: "4",
    score: "0.86",
    input: "终版台词 + 全量美术资产",
    process: "模型: StoryboardPlanner v2\nS03 拆为 4 个镜头",
    output: "SB-S03-script-v02\n24 镜头脚本",
    review: "分镜逻辑审核 Agent: 通过",
  },
  {
    id: "storyboard-prompt",
    group: "执行类 / 分镜线",
    name: "分镜提示词优化 Agent",
    status: "pass",
    desc: "正向词 / 负向词 / 一致性约束",
    version: "v02",
    calls: "24",
    score: "0.91",
    input: "分镜脚本 + 美术元数据 + CHR 约束",
    process: "模型: PromptCine v4\nshot_12 正向 186 token，负向 42 token",
    output: "PRM-SB-012-v02\n模型参数建议: 1024x576, CFG 6.5",
    review: "提示词合规审核 Agent: 通过",
  },
  {
    id: "shot-image",
    group: "执行类 / 分镜线",
    name: "分镜生图执行 Agent",
    status: "return",
    desc: "逐镜生图 / 参数日志 / 版本归档",
    version: "v03",
    calls: "24",
    score: "0.72",
    input: "审核通过的提示词包 PRM-SB-012-v02\n指定模型: ImageForge-Cine v2.8\n参考素材: CHR-02-v04, SCN-04-v01",
    process: "模型: ImageForge-Cine v2.8\n采样: 32 steps, CFG 6.5, seed 481922\n正向: cinematic medium shot, heroine in obsidian dress, cold rim light, banquet hall depth\n负向: distorted hands, wrong gaze, melted face, low detail\n日志: v01 构图偏平 -> v02 角色比例偏差 -> v03 当前候选",
    output: "ART-SB-012-v03\n缩略图 4 张，主选图 1 张\n写回: o_storyboard_image\n元数据: agent=shot-image-executor, version=v03, retry=2",
    review: "审核 Agent: 图片质量审核 Agent\n状态: 未通过，等待人工终审\n原因: 角色视线方向与台词情绪不一致，前景纵深不足\n打回对象: 分镜生图执行 Agent\nretryInstruction: 保留 CHR-02，强化 foreground depth 与 gaze target",
  },
  {
    id: "video",
    group: "执行类 / 视频线",
    name: "视频生成 Agent",
    status: "review",
    desc: "单镜视频 / 动效提示词 / 参考图",
    version: "v02",
    calls: "4",
    score: "0.78",
    input: "已审分镜图 ART-SB-012-v04\n镜头脚本 shot_12 / 04s\n角色锁定 CHR-02-v04 + CHR-05-v01\n场景锁定 SCN-04-v01",
    process: "模型: MotionForge-Cine v1.4\n时长: 4s / 24fps / camera lock 0.72 / motion strength 0.46\n动效提示词: heroine pushes contract back, controlled wrist motion, cold rim light, foreground document slide\n日志: v01 人物眼神漂移 -> v02 合同运动自然但袖口纹理轻微闪烁",
    output: "VID-SB-012-v02\n写回: o_video_clip\n首帧: ART-SB-012-v04\n元数据: agent=video-generator, version=v02, retry=1",
    review: "审核 Agent: 视频质量审核 Agent\n状态: 需复核\n原因: 袖口纹理在第 62-78 帧轻微闪烁，角色脸部一致性通过\n打回对象: 视频生成 Agent\nretryInstruction: 锁定衣袖区域纹理，降低 motion strength 至 0.38，保留镜头推近节奏",
  },
  {
    id: "consistency",
    group: "执行类 / 视频线",
    name: "一致性校验 Agent",
    status: "review",
    desc: "跨镜头人物 / 场景 / 色调校验",
    version: "v01",
    calls: "1",
    score: "0.84",
    input: "全量单镜视频片段",
    process: "模型: ContinuityQA v1.2\n比对: CHR-02 面部特征、黑色礼服、宴会厅冷金色调、合同道具位置",
    output: "RPT-CONT-S03-v01\n通过 5/6 个镜头，shot_12 标记为视频质量复核",
    review: "总监制复核: 等待视频质量审核结论",
  },
  {
    id: "voice",
    group: "执行类 / 音剪线",
    name: "配音生成 Agent",
    status: "pass",
    desc: "角色音色 / 情绪 / 语速",
    version: "v02",
    calls: "12",
    score: "0.9",
    input: "DLG-S03-v02 + CHR-02-v04 + 情绪标注",
    process: "模型: VoiceCast-Pro v2.1\n女主 cold alto / speed 0.92 / pause 0.8s\n男配 polished baritone / pressure 0.76",
    output: "VOX-S03-v02\n逐镜配音音频 12 条\n写回: o_audio_voice",
    review: "音画同步审核 Agent: 通过",
  },
  {
    id: "music",
    group: "执行类 / 音剪线",
    name: "配乐适配 Agent",
    status: "pass",
    desc: "配乐 / 环境音效 / 情绪曲线",
    version: "v01",
    calls: "3",
    score: "0.88",
    input: "全片节奏曲线 + 分镜脚本 + 视频片段粗剪",
    process: "模型: ScoreMatch-Cine v1.7\ncue_01 宴会低频 -> cue_02 反击上升 -> cue_03 黑卡落点",
    output: "BGM-S03-v01\n配乐音轨 + 环境音效素材",
    review: "音画同步审核 Agent: 通过",
  },
  {
    id: "edit",
    group: "执行类 / 音剪线",
    name: "剪辑合成 Agent",
    status: "review",
    desc: "片段串联 / 音画同步 / 成片输出",
    version: "v03",
    calls: "6",
    score: "0.88",
    input: "VID-SB-009~014 + VOX-S03-v02 + BGM-S03-v01 + 特效标注",
    process: "模型: EditAssembler v1.3\n按分镜顺序拼接，添加黑卡揭示字幕与转场",
    output: "CUT-S03-v03\nFILM-S03-final-v03\n写回: o_final_video",
    review: "总监制 Agent: 待人工终审",
  },
  {
    id: "image-review",
    group: "审核类 Agent",
    name: "图片质量审核 Agent",
    status: "return",
    desc: "画面质量 / 无崩坏 / 角色一致性",
    version: "v03",
    calls: "1",
    score: "0.68",
    input: "ART-SB-012-v03",
    process: "模型: VisualQA-Supervisor v1.8\n检测: gaze mismatch, foreground depth, prompt adherence",
    output: "审核报告 RPT-IMG-012-v03\n问题区域: 右眼视线 / 前景层次",
    review: "打回分镜生图执行 Agent，循环次数 +1",
  },
  {
    id: "supervisor",
    group: "审核类 Agent",
    name: "总监制 Agent",
    status: "review",
    desc: "阶段终审 / 成片终验 / 跨环节一致性",
    version: "v01",
    calls: "1",
    score: "0.72",
    input: "分镜阶段全部专项审核报告",
    process: "汇总评分: 0.72\n建议: 打回 shot_12，不阻塞其他镜头",
    output: "director.user_input_required",
    review: "等待人工终审",
  },
]);

const shots = [
  { id: "shot_09", view: "远景", duration: "03s", status: "pass", label: "通过", marker: "3%" },
  { id: "shot_10", view: "中景", duration: "04s", status: "pass", label: "通过", marker: "28%" },
  { id: "shot_11", view: "特写", duration: "02s", status: "pass", label: "通过", marker: "52%" },
  { id: "shot_12", view: "中近景", duration: "04s", status: "return", label: "打回", marker: "76%" },
  { id: "shot_13", view: "反打", duration: "03s", status: "review", label: "待审", marker: "92%" },
  { id: "shot_14", view: "推镜", duration: "05s", status: "review", label: "待审", marker: "98%" },
];

const selectedShotId = ref("shot_12");

const shotDetails: Record<string, ShotDetail> = {
  shot_09: {
    id: "shot_09",
    view: "远景",
    duration: "03s",
    statusLabel: "通过",
    script: "宴会厅全景建立，女主从逆光入口进入，宾客视线形成压力场。",
    camera: "24mm 广角，低机位轻微仰拍",
    motion: "缓慢推入，结束在女主半身",
    lighting: "冷色主光 + 金色吊灯反射",
    action: "女主停步，抬眼看向长桌尽头",
    model: "ImageForge-Cine v2.8",
    params: "1024x576 / steps 30 / CFG 6.2 / seed 481909",
    positivePrompt: "wide cinematic banquet hall, heroine entering from backlight, luxury cold metal texture, guests watching, dramatic depth",
    negativePrompt: "low detail, distorted face, wrong anatomy, overexposed, flat lighting",
    references: ["CHR-02-v04", "SCN-04-v01", "PROP-red-wine-v02"],
    reviewer: "图片质量审核 Agent",
    review: "构图、角色比例、场景纵深均通过；与场景概念一致。",
    retryInstruction: "无需重跑，锁定为分镜主版本。",
    versions: [
      { id: "v01", status: "pass", note: "主选" },
      { id: "v00", status: "wait", note: "早期草图" },
    ],
  },
  shot_10: {
    id: "shot_10",
    view: "中景",
    duration: "04s",
    statusLabel: "通过",
    script: "男配靠近女主，递出合同，台词节奏压迫但保持礼貌伪装。",
    camera: "50mm 中景，人物双人构图",
    motion: "轻微横移，合同进入画面中心",
    lighting: "侧逆光勾勒轮廓，桌面冷反光",
    action: "男配伸手递合同，女主不接，只低头扫一眼",
    model: "ImageForge-Cine v2.8",
    params: "1024x576 / steps 32 / CFG 6.4 / seed 481910",
    positivePrompt: "medium two shot, contract in foreground, elegant hostile negotiation, cold rim light, cinematic shallow depth",
    negativePrompt: "extra fingers, unreadable document, broken hand, soft focus, messy background",
    references: ["CHR-02-v04", "CHR-05-v01", "PROP-contract-v01"],
    reviewer: "图片质量审核 Agent",
    review: "道具位置清晰，人物关系明确，手部无崩坏。",
    retryInstruction: "无需重跑。",
    versions: [
      { id: "v02", status: "pass", note: "主选" },
      { id: "v01", status: "return", note: "手部异常" },
    ],
  },
  shot_11: {
    id: "shot_11",
    view: "特写",
    duration: "02s",
    statusLabel: "通过",
    script: "女主眼神特写，台词停顿前的冷静反击情绪。",
    camera: "85mm 特写，眼部焦点",
    motion: "静帧，微弱呼吸感",
    lighting: "冷色眼神光，背景金色虚化",
    action: "女主轻微抬眼，嘴角没有笑意",
    model: "ImageForge-Cine v2.8",
    params: "768x1024 / steps 34 / CFG 6.8 / seed 481911",
    positivePrompt: "close-up heroine eyes, restrained revenge emotion, cold catchlight, luxury banquet bokeh, cinematic portrait",
    negativePrompt: "melted face, asymmetric eyes, plastic skin, exaggerated smile, low realism",
    references: ["CHR-02-v04", "STYLE-cold-luxury-v03"],
    reviewer: "图片质量审核 Agent",
    review: "人物一致性高，情绪表达符合台词停顿。",
    retryInstruction: "无需重跑。",
    versions: [
      { id: "v03", status: "pass", note: "主选" },
      { id: "v02", status: "return", note: "表情过强" },
    ],
  },
  shot_12: {
    id: "shot_12",
    view: "中近景",
    duration: "04s",
    statusLabel: "打回",
    script: "女主把合同推回桌面，冷静说出反击台词；画面要保留宴会厅纵深与对峙压力。",
    camera: "65mm 中近景，桌面前景压迫构图",
    motion: "轻推镜，合同从前景滑回男配方向",
    lighting: "冷色边缘光 + 桌面反射，背景灯点形成纵深",
    action: "女主手指推回合同，视线锁定男配，不躲闪",
    model: "ImageForge-Cine v2.8",
    params: "1024x576 / steps 32 / CFG 6.5 / seed 481922",
    positivePrompt: "cinematic medium close shot, heroine in obsidian dress pushes contract back on table, cold rim light, banquet hall depth, restrained revenge, strong foreground depth, gaze locked to male antagonist",
    negativePrompt: "distorted hands, wrong gaze direction, melted face, low detail, flat foreground, extra document, broken perspective",
    references: ["CHR-02-v04", "CHR-05-v01", "SCN-04-v01", "PROP-contract-v01"],
    reviewer: "图片质量审核 Agent",
    review: "未通过：角色视线方向与台词情绪不一致，前景纵深不足，合同位置没有形成压力中心。",
    retryInstruction: "打回分镜生图执行 Agent；保留 CHR-02 与 SCN-04，强化 foreground depth、gaze target、contract leading line，重新生成 v04。",
    versions: [
      { id: "v03", status: "return", note: "当前打回" },
      { id: "v02", status: "return", note: "角色比例偏差" },
      { id: "v01", status: "return", note: "构图偏平" },
    ],
  },
  shot_13: {
    id: "shot_13",
    view: "反打",
    duration: "03s",
    statusLabel: "待审",
    script: "男配反应镜头，笑容短暂凝固，压迫感第一次失效。",
    camera: "70mm 反打，肩背前景",
    motion: "轻微后撤，制造失控感",
    lighting: "脸部半阴影，背景灯带轻微拉丝",
    action: "男配眼神停顿，手指压住合同边缘",
    model: "ImageForge-Cine v2.8",
    params: "1024x576 / steps 30 / CFG 6.3 / seed 481923",
    positivePrompt: "reverse shot male antagonist reaction, smile frozen, shoulder foreground, luxury banquet tension, half shadow face",
    negativePrompt: "cartoon face, wrong age, duplicated hands, bad teeth, noisy background",
    references: ["CHR-05-v01", "SCN-04-v01", "PROP-contract-v01"],
    reviewer: "图片质量审核 Agent",
    review: "等待审核队列；需重点检查表情与人物年龄一致性。",
    retryInstruction: "如表情过度戏剧化，回到分镜提示词优化 Agent 收紧情绪词。",
    versions: [
      { id: "v01", status: "review", note: "待审" },
    ],
  },
  shot_14: {
    id: "shot_14",
    view: "推镜",
    duration: "05s",
    statusLabel: "待审",
    script: "镜头推向桌面黑卡，完成反击信息揭示，作为下一段视频生成的转场锚点。",
    camera: "35mm 桌面低角度",
    motion: "快速推镜到黑卡特写",
    lighting: "卡面冷反光，背景虚化",
    action: "黑卡落在合同上，压住签字页",
    model: "ImageForge-Cine v2.8",
    params: "1024x576 / steps 28 / CFG 6.1 / seed 481924",
    positivePrompt: "dramatic push-in to black premium card on contract, cold reflection, luxury table surface, cinematic transition anchor",
    negativePrompt: "unreadable card, bad typography, overexposed reflection, low detail",
    references: ["PROP-black-card-v02", "PROP-contract-v01", "SCN-04-v01"],
    reviewer: "图片质量审核 Agent",
    review: "等待审核队列；需检查卡面标识是否合规。",
    retryInstruction: "若卡面文字不可控，改为无字黑卡并用剪辑字幕承载信息。",
    versions: [
      { id: "v01", status: "review", note: "待审" },
    ],
  },
};

const videoClips: VideoClipDetail[] = [
  {
    id: "clip_12",
    duration: "04s",
    fps: "24",
    statusLabel: "需复核",
    script: "承接 shot_12 主选分镜，女主将合同从前景推回男配方向，镜头轻微推近，动作克制但压迫感增强。",
    referenceImage: "ART-SB-012-v04 / 已通过图片质量审核",
    cameraMotion: "slow push-in, table foreground parallax, camera lock 0.72",
    actionRhythm: "0-18f 停顿蓄力，19-56f 推回合同，57-96f 锁定眼神",
    consistencyLock: "CHR-02 face + obsidian dress + SCN-04 banquet depth + PROP-contract-v01",
    model: "MotionForge-Cine v1.4",
    params: "4s / 24fps / 1344x768 / motion strength 0.46 / camera lock 0.72 / seed 901244",
    motionPrompt: "cinematic restrained motion, heroine pushes contract back across glossy table, cold rim light stays consistent, foreground document slides with natural friction, gaze remains locked to male antagonist, luxury banquet hall depth preserved",
    negativePrompt: "face morphing, sleeve flicker, hand deformation, camera jump, scene melting, inconsistent costume, unstable lighting, document teleport",
    output: "VID-SB-012-v02 / o_video_clip / preview frames 96 / retry=1",
    reviewer: "视频质量审核 Agent",
    review: "角色脸部与场景一致性通过；第 62-78 帧袖口纹理轻微闪烁，合同滑动轨迹通过，镜头推近节奏通过。",
    retryInstruction: "打回视频生成 Agent；锁定衣袖纹理区域，motion strength 从 0.46 降至 0.38，保留首帧 ART-SB-012-v04 与 seed 901244 的构图约束。",
    versions: [
      { id: "v02", status: "review", note: "需复核" },
      { id: "v01", status: "return", note: "眼神漂移" },
      { id: "ref", status: "pass", note: "分镜首帧" },
    ],
  },
];

const scriptLab = {
  source: "原著输入：第 03 场，慈善宴会厅。女主被男配当众递出收购合同，众人等待她低头签字。\n导演调度：改成 90s 竖屏短剧关键反击段，节奏冷、贵、快，保留人物克制和宴会厅压迫感。\n风格约束：都市复仇 / 高级冷感 / 台词短句 / 每个镜头都能转化为分镜与视频动作。",
  adaptation: "产物 ID: SCR-S03-v02\n生成 Agent: 剧本改编 Agent\n模型: ScriptForge-Drama v3\n\n场 03 / 内景 / 慈善宴会厅 / 夜\n人群的谈笑在女主入场后降低。男配将合同推到桌面中央，故意让镜头和宾客都看见。\n女主没有立刻坐下，她看了一眼合同封面，又看向男配身后的董事席。\n冲突目标：男配要她当众签字；女主要借这份合同反向公开男配的资金漏洞。\n情绪标注：女主克制、男配压迫、旁观者等待失态。",
  dialogue: "产物 ID: DLG-S03-v02\n生成 Agent: 台词打磨 Agent\n模型: DialoguePolish v2\n\n男配：签了它，你今晚还能体面离开。\n女主：（停顿 0.8s，低头看合同）体面？\n女主：（把合同推回去）你该担心的，是明天早上谁还能进董事会。\n男配：（笑容凝固）你什么意思？\n女主：合同第七页，资金担保人不是你。是你最怕我见到的人。",
  review: "审核 Agent: 剧本内容审核 Agent\n审核对象: SCR-S03-v02 + DLG-S03-v02\n评分: 0.91 / 通过\n审核意见: 冲突目标明确，台词可拍摄，女主反击信息能作为分镜与视频动作锚点。\n修正记录: v01 台词解释过多 -> 打回台词打磨 Agent；v02 缩短句长并加入停顿与动作标注后通过。\n下游: 分镜脚本 Agent",
  versions: [
    { id: "SCR-S03-v02", title: "影视剧本", status: "pass", meta: "剧本改编 Agent · 剧本内容审核通过 · 写回 o_script" },
    { id: "DLG-S03-v02", title: "精修台词", status: "pass", meta: "台词打磨 Agent · 含语气/停顿/语速 · 下游分镜脚本" },
    { id: "RPT-SCR-S03-v01", title: "审核报告", status: "return", meta: "v01 台词解释过多，已打回并生成修正意见" },
  ],
};

const artAssets: ArtAsset[] = [
  {
    id: "CHR-02-v04",
    title: "女主角色设定卡",
    short: "CHR",
    status: "pass",
    statusLabel: "通过",
    description: "27 岁，冷静复仇气质，黑色礼服、锐利眼神、低饱和妆容；所有分镜与视频必须锁定侧脸轮廓、发型和礼服材质。",
    agent: "角色设定 Agent",
    reviewer: "角色设定审核 Agent",
    model: "CharacterBible v2.4",
    storage: "美术资产库 / 角色设定目录",
    prompt: "visual bible, heroine, obsidian dress, restrained revenge, sharp side profile, cold luxury makeup, consistent facial landmarks",
    review: "审核通过：特征辨识度高，一致性约束完整；作为分镜生图与视频参考锁。",
  },
  {
    id: "CST-02-v02",
    title: "服化道设计稿",
    short: "CST",
    status: "review",
    statusLabel: "审核中",
    description: "黑色缎面礼服、银色耳饰、无品牌手包；道具包含合同、红酒杯、黑卡，强调桌面反光与压迫构图。",
    agent: "服化道设计 Agent",
    reviewer: "场景道具审核 Agent",
    model: "CostumeProp v1.9",
    storage: "美术资产库 / 服化道目录",
    prompt: "costume prop sheet, black satin evening dress, silver minimal earrings, contract folder, premium black card, cold reflective table props",
    review: "审核中：道具合理性通过，礼服袖口纹理需标注为视频锁定区域。",
  },
  {
    id: "SCN-04-v01",
    title: "宴会厅场景概念",
    short: "SCN",
    status: "pass",
    statusLabel: "通过",
    description: "冷金色宴会厅，纵深走廊、低照度桌面反光、远处宾客形成压力背景，适合作为分镜与视频连续空间。",
    agent: "场景概念 Agent",
    reviewer: "场景道具审核 Agent",
    model: "SceneConcept v2.2",
    storage: "美术资产库 / 场景设定目录",
    prompt: "luxury banquet hall, cold gold palette, deep perspective, reflective long table, guests as pressure silhouettes, cinematic rim light",
    review: "审核通过：空间逻辑清晰，光影参数可复用到分镜与视频。",
  },
  {
    id: "ART-LOOK-02-v03",
    title: "角色入场景衍生图",
    short: "LOOK",
    status: "return",
    statusLabel: "打回",
    description: "将 CHR-02 角色、CST-02 服化道与 SCN-04 宴会厅合成，用于验证角色进场景后的服装材质和光影一致性。",
    agent: "衍生图合成 Agent",
    reviewer: "图片质量审核 Agent",
    model: "ImageForge-Cine v2.8",
    storage: "美术资产库 / 衍生图目录",
    prompt: "heroine in obsidian dress standing in cold luxury banquet hall, consistent face CHR-02, satin sleeve texture, reflective table foreground, cinematic depth",
    review: "未通过：袖口纹理与视频阶段可能闪烁，打回衍生图合成 Agent 生成 v04，并补充 sleeve texture lock。",
  },
];

const postPipeline: PostPipelineItem[] = [
  {
    id: "VOX-S03-v02",
    title: "配音生成 Agent",
    status: "pass",
    statusLabel: "通过",
    summary: "按终版台词、角色人设和情绪标注生成逐镜头配音，保留音色、语速、停顿和情绪曲线。",
    input: "DLG-S03-v02 + CHR-02-v04 + 情绪标注",
    output: "逐镜配音音频 / o_audio_voice / 12 条台词片段",
    model: "VoiceCast-Pro v2.1",
    review: "音画同步审核 Agent: 台词长度与镜头时长匹配",
    log: "女主音色: cold alto / speed 0.92 / pause 0.8s\n男配音色: polished baritone / pressure 0.76\nretry: v01 情绪过满 -> v02 收敛通过",
  },
  {
    id: "BGM-S03-v01",
    title: "配乐适配 Agent",
    status: "pass",
    statusLabel: "通过",
    summary: "根据剧情节奏与反击情绪曲线生成低频弦乐与冷金属质感环境音，标注转场点。",
    input: "全片节奏曲线 + 分镜脚本 + 视频片段粗剪",
    output: "配乐音轨 / 环境音效素材 / 情绪节点表",
    model: "ScoreMatch-Cine v1.7",
    review: "音画同步审核 Agent: 情绪转折点匹配 shot_12 推合同动作",
    log: "cue_01 宴会低频 0-22s\ncue_02 反击上升 23-51s\ncue_03 黑卡落点 52-62s",
  },
  {
    id: "CUT-S03-v03",
    title: "剪辑合成 Agent",
    status: "review",
    statusLabel: "待终验",
    summary: "按分镜顺序拼接单镜视频，接入配音配乐，添加关键转场和黑卡信息揭示字幕。",
    input: "VID-SB-009~014 + VOX-S03-v02 + BGM-S03-v01 + 特效标注",
    output: "FILM-S03-final-v03 / 剪辑工程文件 / 90s 样片",
    model: "EditAssembler v1.3",
    review: "总监制 Agent: 等待人工最终验收",
    log: "写回: o_final_video\n音画同步分数: 0.88\n待复核: shot_12 袖口纹理闪烁是否影响成片观感",
  },
  {
    id: "RPT-FINAL-S03-v03",
    title: "总监制终验",
    status: "review",
    statusLabel: "人工终审",
    summary: "汇总剧本、美术、分镜、视频、音画同步和剪辑报告，给出通过、打回或人工修改后再审决策。",
    input: "全链路版本链 + 专项审核报告 + 成片预览",
    output: "成片验收结论 / 返工任务图 / 版本归档",
    model: "SupervisorQA v2.0",
    review: "人工制片人: 待决策",
    log: "可选动作: 通过成片 / 打回视频生成 Agent / 打回剪辑合成 Agent / 人工修改后再审",
  },
];

const loopNodes: LoopNode[] = [
  { id: "01", title: "人工输入", desc: "原著/创意/风格/成片标准进入总导演调度。", event: "director.message", status: "pass" },
  { id: "02", title: "任务规划", desc: "总导演生成 TaskGraph，拆分剧本、美术、分镜、视频、音剪线。", event: "taskgraph.created", status: "pass" },
  { id: "03", title: "Agent 执行", desc: "各生产 Agent 产出剧本、设定、提示词、图像、视频、音频。", event: "task.started / task.completed", status: "run" },
  { id: "04", title: "业务回写", desc: "CallbackBridge 写回 Toonflow 业务表并生成版本元数据。", event: "callback.persisted / version.created", status: "pass" },
  { id: "05", title: "专项审核", desc: "剧本/角色/场景/提示词/图片/视频/音画同步逐项打分。", event: "review.scored", status: "review" },
  { id: "06", title: "打回重跑", desc: "未通过则生成 retryInstruction，原路或跨工种打回。", event: "review.reroute", status: "return" },
  { id: "07", title: "总监制复核", desc: "阶段完成后汇总报告，判断是否进入人工终审。", event: "director.user_input_required", status: "review" },
  { id: "08", title: "人工终审", desc: "用户只在关键门禁决定通过、打回、暂停或人工修改后再审。", event: "director.user_input", status: "review" },
  { id: "09", title: "归档推进", desc: "通过后解锁下一生产线，所有版本进入追溯链。", event: "stage.approved", status: "pass" },
];

const loopContracts: LoopContract[] = [
  {
    title: "单节点自循环",
    rule: "每个生产 Agent 都必须被专属审核 Agent 校验，不通过自动回到原生产工位。",
    flow: "分镜生图执行 Agent -> 图片质量审核 Agent -> 未通过 -> retryInstruction -> 分镜生图执行 Agent v04",
  },
  {
    title: "跨工种打回",
    rule: "如果问题根因来自上游设定，质量监制可跨工种打回，而不是只重跑当前节点。",
    flow: "图片质量审核发现空间纵深不足 -> review.reroute -> 场景概念 Agent 补充 SCN-04 光影/纵深 -> 分镜提示词优化 Agent 重写约束",
  },
  {
    title: "环节终审门禁",
    rule: "剧本、美术、分镜、视频、成片阶段完成后，由总监制汇总并请求人工终审。",
    flow: "专项审核全通过 -> 总监制 Agent 汇总 -> director.user_input_required -> 用户通过 -> 解锁下一生产线",
  },
  {
    title: "全链路追溯",
    rule: "每个产物带生成 Agent、审核 Agent、模型、版本、retry、业务表和历史审核记录。",
    flow: "CUT-S03-v03 -> VOX-S03-v02 / BGM-S03-v01 / VID-SB-012-v02 / ART-SB-012-v04 / PRM-SB-012-v02 / CHR-02-v04",
  },
];

const audits = [
  { name: "剧本内容审核", label: "通过", status: "pass" },
  { name: "角色设定审核", label: "通过", status: "pass" },
  { name: "场景道具审核", label: "通过", status: "pass" },
  { name: "分镜逻辑审核", label: "通过", status: "pass" },
  { name: "提示词合规审核", label: "通过", status: "pass" },
  { name: "图片质量审核", label: "打回", status: "return" },
  { name: "视频质量审核", label: "需复核", status: "review" },
  { name: "音画同步审核", label: "通过", status: "pass" },
  { name: "总监制终验", label: "待终审", status: "review" },
];

const auditMatrix = [
  { agent: "剧本内容审核 Agent", object: "SCR-S03-v02 / DLG-S03-v02", dimensions: "剧情逻辑、人物动机、台词可拍摄性、内容合规", rerouteTarget: "剧本改编 Agent / 台词打磨 Agent", artifact: "RPT-SCR-S03-v01", label: "通过", status: "pass", loopCount: "1 次", fix: "v01 台词解释过多，已打回台词打磨 Agent 缩短句长并补动作停顿，v02 通过。" },
  { agent: "角色设定审核 Agent", object: "CHR-02-v04", dimensions: "人设统一、特征辨识度、角色年龄与剧本匹配", rerouteTarget: "角色设定 Agent", artifact: "RPT-CHR-02-v04", label: "通过", status: "pass", loopCount: "0 次", fix: "角色锁定特征、黑色礼服与冷静表情约束完整，可作为分镜和视频参考锁。" },
  { agent: "场景道具审核 Agent", object: "CST-02-v02 / SCN-04-v01", dimensions: "服化道合理性、场景空间、光影逻辑、道具叙事", rerouteTarget: "服化道设计 Agent / 场景概念 Agent", artifact: "RPT-SCN-04-v01", label: "通过", status: "pass", loopCount: "1 次", fix: "礼服袖口需补纹理锁定说明，场景纵深已补冷金属走廊和桌面反光约束。" },
  { agent: "分镜逻辑审核 Agent", object: "SB-S03-script-v02", dimensions: "镜头叙事、景别合理性、运镜、台词对应关系", rerouteTarget: "分镜脚本 Agent", artifact: "RPT-SB-S03-v02", label: "通过", status: "pass", loopCount: "0 次", fix: "shot_09 到 shot_14 的节奏和反击动作连续，允许进入提示词优化。" },
  { agent: "提示词合规审核 Agent", object: "PRM-SB-012-v02", dimensions: "提示词精确度、一致性约束、负面词、模型适配", rerouteTarget: "分镜提示词优化 Agent", artifact: "RPT-PRM-012-v02", label: "通过", status: "pass", loopCount: "0 次", fix: "正向 186 token、负向 42 token，角色和场景锁定项完整。" },
  { agent: "图片质量审核 Agent", object: "ART-SB-012-v03", dimensions: "画面质量、无崩坏、角色一致性、提示词符合度、去 AI 痕迹", rerouteTarget: "分镜生图执行 Agent", artifact: "RPT-IMG-012-v03", label: "打回", status: "return", loopCount: "2 次", fix: "角色视线方向与台词情绪不一致，前景纵深不足；保留 CHR-02 与 SCN-04，强化 gaze target 与 foreground depth 后生成 v04。" },
  { agent: "视频质量审核 Agent", object: "VID-SB-012-v02", dimensions: "动作连贯、画面流畅、无闪烁、角色一致、镜头语言", rerouteTarget: "视频生成 Agent", artifact: "RPT-VID-012-v02", label: "需复核", status: "review", loopCount: "1 次", fix: "第 62-78 帧袖口纹理轻微闪烁；建议锁定衣袖区域纹理并降低 motion strength 至 0.38。" },
  { agent: "音画同步审核 Agent", object: "VOX-S03-v02 / BGM-S03-v01", dimensions: "口型节奏、情绪匹配、音质、环境音效", rerouteTarget: "配音生成 Agent / 配乐适配 Agent", artifact: "RPT-AUD-S03-v02", label: "通过", status: "pass", loopCount: "1 次", fix: "台词停顿与 shot_12 推合同动作同步，反击段低频上升点已对齐黑卡落点。" },
  { agent: "总监制 Agent", object: "FILM-S03-final-v03", dimensions: "全局质量、跨环节一致性、风格统一、需求匹配", rerouteTarget: "对应上游 Agent", artifact: "RPT-FINAL-S03-v03", label: "待终审", status: "review", loopCount: "3 次", fix: "建议人工确认 shot_12 图片/视频风险是否影响成片质感，再决定通过或跨工种打回。" },
];

const settingCards = [
  { key: "agent", title: "Agent 配置", desc: "编辑 system prompt、职责边界、上下游契约、打回策略。" },
  { key: "model", title: "模型映射", desc: "为生图、视频、配音、审核选择抽象模型服务。" },
  { key: "prompt", title: "提示词库", desc: "管理分镜、镜头、角色一致性、负面词模板。" },
  { key: "skills", title: "Skills 技能", desc: "绑定剧本解析、视觉审核、音画同步等技能。" },
  { key: "memory", title: "记忆配置", desc: "维护项目风格、角色设定、历史打回经验。" },
  { key: "backend", title: "二期生成后端插件", desc: "当前只保留边界说明；后续接入具体生成后端。" },
];

const traces = [
  { id: "ART-SB-012-v03", desc: "生成: 分镜生图执行 Agent · 审核: 图片质量审核 Agent · 模型: ImageForge-Cine v2.8 · seed 481922 · retry 2" },
  { id: "PRM-SB-012-v02", desc: "生成: 分镜提示词优化 Agent · 审核: 提示词合规审核 Agent · 正向 186 token · 负向 42 token" },
  { id: "VID-SB-012-v02", desc: "生成: 视频生成 Agent · 审核: 视频质量审核 Agent · 模型: MotionForge-Cine v1.4 · reference ART-SB-012-v04 · retry 1" },
  { id: "VOX-S03-v02", desc: "生成: 配音生成 Agent · 审核: 音画同步审核 Agent · 模型: VoiceCast-Pro v2.1 · 女主 cold alto" },
  { id: "CUT-S03-v03", desc: "生成: 剪辑合成 Agent · 审核: 总监制 Agent · 成片 FILM-S03-final-v03 · 待人工终审" },
  { id: "SCN-04-v01", desc: "生成: 场景概念 Agent · 审核: 场景道具审核 Agent · 暮色宴会厅 · 逆光 · 纵深走廊" },
  { id: "CHR-02-v04", desc: "生成: 角色设定 Agent · 审核: 角色设定审核 Agent · 黑色礼服 · 冷静克制 · 侧脸识别特征" },
];

const { events, connected, connect, pushLocalEvent } = useHarnessEventStream(instanceId);
const directorCommand = ref("");
const liveStatus = ref<any>(null);
const liveTaskGraph = ref<any>(null);
const warehouseItems = ref<any[]>([]);
const warehouseFilter = ref("");
const liveProgress = computed(() => {
  const stats = liveStatus.value?.stats;
  return stats?.total ? `${Math.round((stats.completed / stats.total) * 100)}%` : "66%";
});
const liveRetryCount = computed(() => liveStatus.value?.stats?.retried ?? 3);
const liveActiveCount = computed(() => liveStatus.value?.stats?.running ?? 7);
const liveErrorCount = computed(() => liveStatus.value?.stats?.failed ?? 1);

const selectedStation = computed(() => stations.value.find((station) => station.id === selectedStationId.value) ?? stations.value[0]);
const selectedVideoClip = computed(() => videoClips[0]);
const stationGroups = computed(() => {
  const groups: { name: string; items: Station[] }[] = [];
  for (const station of stations.value) {
    let group = groups.find((item) => item.name === station.group);
    if (!group) {
      group = { name: station.group, items: [] };
      groups.push(group);
    }
    group.items.push(station);
  }
  return groups;
});
const visibleEvents = computed(() => {
  if (events.value.length) return events.value.slice(-6).reverse();
  return [
    { id: "demo-1", instanceId: instanceId.value, kind: "review.scored", payload: { score: 0.68 } },
    { id: "demo-2", instanceId: instanceId.value, kind: "director.user_input_required", payload: { gate: "storyboard" } },
    { id: "demo-3", instanceId: instanceId.value, kind: "version.created", payload: { artifact: "ART-SB-012-v03" } },
  ] as HarnessEvent[];
});
const selectedShotDetail = computed(() => shotDetails[selectedShotId.value] ?? shotDetails.shot_12);

watch(events, (items) => {
  const event = items[items.length - 1];
  if (!event) return;
  if (event.kind === "task.started") updateStationFromTask(event, "run");
  if (event.kind === "task.completed" || event.kind === "callback.persisted" || event.kind === "version.created") {
    updateStationFromTask(event, "pass");
  }
  if (event.kind === "review.scored" || event.kind === "director.user_input_required") activeScene.value = "review";
  if (event.kind === "review.reroute") {
    const targetStationId = stationIdFromAgent(event.payload?.toAgent) || "shot-image";
    selectedStationId.value = targetStationId;
    const station = stations.value.find((item) => item.id === targetStationId);
    if (station) station.status = "return";
  }
  void loadLiveControlRoom();
});

watch(warehouseFilter, () => { void loadWarehouse(); });

onMounted(() => {
  const requestedScene = route.query.scene;
  if (typeof requestedScene === "string" && harnessScenes.includes(requestedScene as HarnessScene)) {
    activeScene.value = requestedScene as HarnessScene;
  }
  connect();
  void loadLiveControlRoom();
  void loadWarehouse();
});

async function loadLiveControlRoom() {
  if (instanceId.value === "demo") return;
  try {
    const [statusResponse, graphResponse] = await Promise.all([
      axios.get(`/api/harness/control/${instanceId.value}/status`),
      axios.get(`/api/harness/control/${instanceId.value}/task-graph`),
    ]);
    liveStatus.value = statusResponse.data?.data || null;
    liveTaskGraph.value = graphResponse.data?.data || null;
    const taskList = liveTaskGraph.value?.tasks || [];
    for (const task of taskList) {
      const stationId = stationIdFromAgent(task.node?.agentRole);
      const station = stations.value.find(item => item.id === stationId);
      if (station) station.status = task.state === "completed" ? "pass" : task.state === "failed" ? "return" : task.state === "running" ? "run" : "wait";
    }
  } catch {
    // The demo route remains usable when no live instance exists.
  }
}

async function loadWarehouse() {
  if (instanceId.value === "demo" || !project.value?.id) return;
  try {
    const response = await axios.get(`/api/harness/control/${instanceId.value}/warehouse`, {
      params: { projectId: project.value.id, artifactType: warehouseFilter.value || undefined },
    });
    warehouseItems.value = response.data?.data || [];
  } catch {
    warehouseItems.value = [];
  }
}

function statusLabel(status: StationStatus | string) {
  return {
    run: "运行中",
    pass: "通过",
    review: "待终审",
    return: "打回",
    wait: "等待",
  }[status] ?? "未知";
}

function setScene(scene: HarnessScene) {
  activeScene.value = scene;
}

function selectStation(id: string) {
  selectedStationId.value = id;
  activeScene.value = "station";
}

function selectShot(id: string) {
  selectedShotId.value = id;
  selectedStationId.value = "shot-image";
  activeScene.value = "storyboard";
  pushLocalEvent({ kind: "director.message", payload: { message: `${id} 已展开：提示词、模型参数、审核打回与版本链可追踪。` } });
}

function eventSummary(event: HarnessEvent) {
  if (event.payload?.message) return String(event.payload.message);
  if (event.payload?.content) return String(event.payload.content);
  if (event.payload?.artifact) return String(event.payload.artifact);
  if (event.payload?.artifactKey) return String(event.payload.artifactKey);
  if (event.payload?.score) return String(event.payload.score);
  if (event.payload?.overall) return String(event.payload.overall);
  if (event.payload?.action) return String(event.payload.action);
  if (event.payload?.reason) return String(event.payload.reason);
  return event.createdAt ? new Date(event.createdAt).toLocaleTimeString("zh-CN") : "demo";
}

async function submitUserInput(action: string) {
  try {
    await axios.post(`/api/harness/control/${instanceId.value}/user-input`, { action, choice: action });
  } catch {
    // API 未接通时保持清晰的本地交互预览，不伪装为真实后端结果。
  }
  pushLocalEvent({ kind: "director.user_input", payload: { action } });
  pushLocalEvent({ kind: action.includes("approve") ? "stage.approved" : "review.reroute", payload: { action } });
}

async function sendDirectorMessage() {
  if (!directorCommand.value) return;
  const message = directorCommand.value;
  directorCommand.value = "";
  try {
    const result = await axios.post(`/api/harness/control/${instanceId.value}/message`, { message });
    const reply = result?.data?.data?.reply;
    if (reply) pushLocalEvent({ kind: "director.message", payload: { content: reply } });
  } catch {
    pushLocalEvent({ kind: "director.message", payload: { content: `本地预览已记录导演指令：${message}` } });
  }
}

async function controlHarness(action: "pause" | "resume" | "cancel") {
  const labels = { pause: "暂停", resume: "恢复", cancel: "取消" };
  try {
    await axios.post(`/api/harness/control/${instanceId.value}/${action}`);
  } catch {
    // 本地预览态。
  }
  pushLocalEvent({ kind: "director.message", payload: { content: `Harness 已进入${labels[action]}请求状态。` } });
}

async function pauseHarness() {
  await controlHarness("pause");
}

async function openSetting(key: string) {
  if (key === "backend") return;
  await router.push("/setting/harness");
}

function stationIdFromAgent(agentRole?: unknown) {
  const map: Record<string, string> = {
    director: "director",
    screenwriter: "script-adapter",
    assistant_director: "storyboard-script",
    costume: "costume-prop",
    wardrobe: "costume-prop",
    makeup: "costume-prop",
    lighting: "scene-concept",
    set_decorator: "scene-concept",
    dp: "shot-image",
    vfx: "video",
    sound: "voice",
    sound_designer: "music",
    editor: "edit",
    supervisor: "supervisor",
  };
  return typeof agentRole === "string" ? map[agentRole] : undefined;
}

function updateStationFromTask(event: HarnessEvent, status: StationStatus) {
  const stationId = stationIdFromAgent(event.payload?.agentRole || event.payload?.toAgent);
  if (!stationId) return;
  const station = stations.value.find((item) => item.id === stationId);
  if (!station) return;
  station.status = status;
  if (event.kind === "callback.persisted" && event.payload?.artifactKey) {
    station.output = `${station.output}\n\n回写产物: ${event.payload.artifactKey}\n业务表: ${event.payload.table || "-"}`;
  }
}
</script>

<style scoped lang="scss">
.harness-factory {
  --bg: #071018;
  --panel: rgba(12, 30, 44, 0.78);
  --panel-strong: rgba(18, 42, 62, 0.88);
  --line: rgba(87, 228, 255, 0.58);
  --line-soft: rgba(87, 228, 255, 0.18);
  --cyan: #4df3ff;
  --blue: #1588ff;
  --violet: #c35cff;
  --green: #61ffbe;
  --amber: #ffd166;
  --red: #ff5c9a;
  --text: #e8f7ff;
  --muted: #91aabc;

  width: 100%;
  height: 100%;
  min-height: 760px;
  display: grid;
  grid-template-rows: 72px minmax(0, 1fr);
  gap: 18px;
  padding: 22px 24px 24px;
  color: var(--text);
  background:
    radial-gradient(circle at 20% 12%, rgba(77, 243, 255, 0.18), transparent 30%),
    radial-gradient(circle at 82% 30%, rgba(195, 92, 255, 0.15), transparent 26%),
    linear-gradient(135deg, #061019 0%, #0b1723 46%, #090d18 100%);
  overflow: hidden;
}

.factory-topbar,
.factory-panel {
  border: 1px solid rgba(121, 212, 255, 0.42);
  background: linear-gradient(180deg, rgba(16, 35, 50, 0.88), rgba(8, 21, 32, 0.86));
  box-shadow: 0 0 30px rgba(77, 243, 255, 0.09), inset 0 0 28px rgba(77, 243, 255, 0.04);
}

.factory-topbar {
  position: relative;
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr) auto;
  align-items: center;
  gap: 18px;
  padding: 0 24px;
  border-radius: 16px;

  &::before {
    content: "";
    position: absolute;
    top: -1px;
    left: 36%;
    right: 36%;
    height: 3px;
    background: linear-gradient(90deg, transparent, var(--cyan), transparent);
    box-shadow: 0 0 18px var(--cyan);
  }
}

.brand-kicker {
  color: var(--cyan);
  font-size: 12px;
  letter-spacing: 1px;
  text-transform: uppercase;
}

h1,
h2,
h3,
p {
  margin-top: 0;
}

h1 {
  margin-bottom: 0;
  font-size: 22px;
  line-height: 1.05;
}

.project-block {
  min-width: 0;
  display: grid;
  gap: 6px;

  strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span {
    color: var(--muted);
    font-size: 12px;
  }
}

.top-actions,
.scene-tabs,
.decision-actions,
.gate-card div {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

button {
  border: 0;
  cursor: pointer;
}

.ghost-btn,
.primary-btn,
.violet-btn,
.status-pill,
.scene-tabs button {
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(110, 203, 255, 0.5);
  border-radius: 17px;
  padding: 0 14px;
  color: var(--text);
  background: rgba(12, 28, 43, 0.72);
  white-space: nowrap;
}

.status-pill {
  color: var(--cyan);
  box-shadow: inset 0 0 16px rgba(77, 243, 255, 0.1);
}

.primary-btn,
.scene-tabs button.active {
  color: #061019;
  font-weight: 800;
  border-color: rgba(77, 243, 255, 0.9);
  background: linear-gradient(135deg, rgba(77, 243, 255, 0.95), rgba(21, 136, 255, 0.95));
  box-shadow: 0 0 22px rgba(77, 243, 255, 0.42);
}

.violet-btn {
  border-color: rgba(195, 92, 255, 0.9);
  background: rgba(195, 92, 255, 0.17);
  box-shadow: inset 0 0 18px rgba(195, 92, 255, 0.18);
}

.danger-action {
  border-color: rgba(255, 92, 154, 0.62);
  color: var(--red);
}

.factory-grid {
  min-height: 0;
  display: grid;
  grid-template-columns: 360px minmax(620px, 1fr) 340px;
  gap: 18px;
}

.factory-panel {
  min-height: 0;
  border-radius: 18px;
  overflow: hidden;
}

.panel-head {
  height: 58px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 20px;
  border-bottom: 1px solid rgba(97, 219, 255, 0.18);

  h2 {
    margin: 0;
    font-size: 20px;
  }
}

.pipeline-panel {
  display: grid;
  grid-template-rows: 58px minmax(0, 1fr);
}

.station-list {
  position: relative;
  overflow: auto;
  padding: 18px 20px 24px 38px;

  &::before {
    content: "";
    position: absolute;
    top: 28px;
    bottom: 32px;
    left: 42px;
    width: 2px;
    background: linear-gradient(180deg, transparent, var(--cyan), var(--violet), transparent);
    box-shadow: 0 0 16px rgba(77, 243, 255, 0.5);
  }

  &::after {
    content: "";
    position: absolute;
    top: 38px;
    left: 38px;
    width: 10px;
    height: 54px;
    border-radius: 999px;
    background: linear-gradient(180deg, transparent, var(--green), transparent);
    box-shadow: 0 0 18px var(--green);
    animation: pipeline-scan 5.8s linear infinite;
  }
}

.group-label {
  margin: 12px 0 8px 20px;
  color: var(--cyan);
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 1px;
}

.station {
  position: relative;
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  margin: 9px 0;
  padding: 12px 12px 12px 22px;
  text-align: left;
  color: var(--text);
  border: 1px solid rgba(90, 194, 245, 0.38);
  border-radius: 12px;
  background: rgba(17, 39, 57, 0.72);

  &::before {
    content: "";
    position: absolute;
    left: -28px;
    top: calc(50% - 6px);
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--cyan);
    box-shadow: 0 0 16px var(--cyan), 0 0 28px rgba(77, 243, 255, 0.5);
    animation: station-pulse 2.8s ease-in-out infinite;
  }

  &::after {
    content: "";
    position: absolute;
    left: -18px;
    top: 50%;
    width: 18px;
    height: 1px;
    background: var(--cyan);
    opacity: 0.7;
  }

  strong,
  small {
    display: block;
  }

  small {
    margin-top: 4px;
    color: var(--muted);
    line-height: 1.35;
  }

  &.active {
    border-color: var(--cyan);
    background: linear-gradient(90deg, rgba(77, 243, 255, 0.27), rgba(17, 39, 57, 0.72));
    box-shadow: 0 0 22px rgba(77, 243, 255, 0.28), inset 0 0 18px rgba(77, 243, 255, 0.1);
  }

  &.return {
    border-color: rgba(255, 92, 154, 0.72);

    &::before {
      background: var(--red);
      box-shadow: 0 0 16px var(--red), 0 0 28px rgba(255, 92, 154, 0.5);
      animation: return-pulse 1.5s ease-in-out infinite;
    }
  }
}

.tag {
  min-height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(130, 214, 255, 0.36);
  border-radius: 12px;
  padding: 2px 9px;
  color: var(--muted);
  font-size: 12px;
  font-style: normal;
  font-weight: 800;
  background: rgba(116, 172, 210, 0.08);

  &.run {
    color: var(--cyan);
    border-color: rgba(77, 243, 255, 0.72);
  }

  &.pass {
    color: var(--green);
    border-color: rgba(97, 255, 190, 0.58);
  }

  &.review {
    color: var(--violet);
    border-color: rgba(195, 92, 255, 0.68);
  }

  &.return {
    color: var(--red);
    border-color: rgba(255, 92, 154, 0.72);
  }

  &.wait {
    color: #6f8799;
  }
}

.center-stack {
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr) 210px;
  gap: 18px;
}

.work-panel {
  overflow: auto;
  padding: 20px;
}

.work-top {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 12px;
  margin-bottom: 16px;

  h2 {
    margin-bottom: 8px;
    font-size: 28px;
  }

  p {
    margin-bottom: 0;
    color: var(--muted);
  }
}

.command-dock {
  display: grid;
  grid-template-columns: auto minmax(180px, 1fr) auto;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  padding: 10px;
  border: 1px solid rgba(97, 219, 255, 0.22);
  border-radius: 14px;
  background: rgba(8, 23, 36, 0.58);

  label {
    color: var(--cyan);
    font-weight: 800;
    white-space: nowrap;
  }

  input {
    min-width: 0;
    height: 36px;
    border: 1px solid rgba(97, 219, 255, 0.28);
    border-radius: 18px;
    padding: 0 14px;
    color: var(--text);
    background: rgba(2, 12, 20, 0.6);
    outline: none;

    &::placeholder {
      color: rgba(145, 170, 188, 0.7);
    }
  }
}

.scene {
  min-height: 0;
}

.metric-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 14px;

  article {
    min-height: 76px;
    padding: 12px;
    border: 1px solid rgba(97, 219, 255, 0.25);
    border-radius: 12px;
    background: rgba(9, 26, 40, 0.62);
  }

  span {
    color: var(--muted);
    font-size: 12px;
  }

  strong {
    display: block;
    margin-top: 6px;
    color: var(--cyan);
    font-size: 24px;
  }
}

.quad-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.info-module,
.setting-card,
.trace-card {
  position: relative;
  min-height: 176px;
  padding: 14px;
  border: 1px solid rgba(97, 219, 255, 0.3);
  border-radius: 14px;
  background: rgba(9, 26, 40, 0.64);
  overflow: hidden;

  &::before {
    content: "";
    position: absolute;
    top: 0;
    left: 12px;
    right: 48%;
    height: 2px;
    background: linear-gradient(90deg, var(--cyan), transparent);
  }

  h3 {
    margin-bottom: 10px;
    font-size: 16px;
  }

  p,
  span {
    color: var(--muted);
    line-height: 1.55;
  }

  pre {
    margin: 0;
    color: #d8f5ff;
    font-family: "Cascadia Mono", Consolas, monospace;
    font-size: 12px;
    line-height: 1.55;
    white-space: pre-wrap;
    word-break: break-word;
  }
}

.script-grid {
  align-items: stretch;
}

.script-board {
  min-height: 260px;
}

.artifact-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 14px;
}

.artifact-card {
  min-height: 96px;
  padding: 12px;
  border: 1px solid rgba(97, 219, 255, 0.28);
  border-radius: 12px;
  background:
    linear-gradient(135deg, rgba(77, 243, 255, 0.12), rgba(195, 92, 255, 0.08)),
    rgba(7, 18, 30, 0.75);

  span,
  strong,
  p {
    display: block;
  }

  span {
    color: var(--cyan);
    font-size: 12px;
    font-weight: 800;
  }

  strong {
    margin-top: 6px;
    color: var(--text);
  }

  p {
    margin: 6px 0 0;
    color: var(--muted);
    font-size: 12px;
    line-height: 1.45;
  }

  &.pass {
    border-color: rgba(97, 255, 190, 0.5);
  }

  &.return {
    border-color: rgba(255, 92, 154, 0.58);
  }
}

.art-lab {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.art-asset-card {
  display: grid;
  grid-template-columns: 116px minmax(0, 1fr);
  gap: 14px;
  min-height: 280px;
  padding: 14px;
  border: 1px solid rgba(97, 219, 255, 0.3);
  border-radius: 16px;
  background: rgba(9, 26, 40, 0.64);
  overflow: hidden;
}

.asset-preview {
  min-height: 170px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(77, 243, 255, 0.28);
  border-radius: 14px;
  background:
    radial-gradient(circle at 45% 28%, rgba(77, 243, 255, 0.26), transparent 34%),
    linear-gradient(145deg, rgba(195, 92, 255, 0.2), rgba(6, 18, 30, 0.9));
  box-shadow: inset 0 0 28px rgba(77, 243, 255, 0.08);

  span {
    color: var(--cyan);
    font-size: 22px;
    font-weight: 900;
    letter-spacing: 1px;
  }
}

.asset-body {
  min-width: 0;

  p {
    margin: 8px 0;
    color: #d8f5ff;
    line-height: 1.55;
  }

  pre {
    max-height: 92px;
    margin: 10px 0;
    padding: 10px;
    border: 1px solid rgba(97, 219, 255, 0.18);
    border-radius: 10px;
    color: #d8f5ff;
    background: rgba(2, 12, 20, 0.5);
    font-family: "Cascadia Mono", Consolas, monospace;
    font-size: 12px;
    line-height: 1.5;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
  }

  dl {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    margin: 10px 0;
  }

  dt {
    color: var(--muted);
    font-size: 11px;
  }

  dd {
    margin: 3px 0 0;
    color: var(--text);
    font-size: 12px;
    line-height: 1.4;
  }
}

.asset-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;

  > div {
    min-width: 0;
  }

  strong {
    display: block;
    margin-top: 3px;
    color: var(--text);
    font-size: 16px;
  }
}

.asset-id {
  display: block;
  color: var(--cyan);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.4px;
}

.review-note {
  color: var(--muted) !important;
  font-size: 12px;
}

.post-lab {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.post-step {
  min-height: 260px;
  padding: 14px;
  border: 1px solid rgba(97, 219, 255, 0.3);
  border-radius: 16px;
  background:
    linear-gradient(135deg, rgba(77, 243, 255, 0.08), rgba(195, 92, 255, 0.08)),
    rgba(9, 26, 40, 0.64);

  &.review {
    border-color: rgba(195, 92, 255, 0.48);
  }

  p {
    margin: 10px 0;
    color: #d8f5ff;
    line-height: 1.55;
  }

  dl {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    margin: 10px 0;
  }

  dt {
    color: var(--muted);
    font-size: 11px;
  }

  dd {
    margin: 3px 0 0;
    color: var(--text);
    font-size: 12px;
    line-height: 1.4;
  }

  pre {
    margin: 10px 0 0;
    padding: 10px;
    border: 1px solid rgba(97, 219, 255, 0.18);
    border-radius: 10px;
    color: #d8f5ff;
    background: rgba(2, 12, 20, 0.5);
    font-family: "Cascadia Mono", Consolas, monospace;
    font-size: 12px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
  }
}

.post-step-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px 10px;
  align-items: center;

  span {
    color: var(--cyan);
    font-size: 11px;
    font-weight: 900;
  }

  strong {
    color: var(--text);
    font-size: 16px;
  }

  .tag {
    grid-row: 1 / span 2;
    grid-column: 2;
  }
}

.loop-map {
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 14px;

  &::before {
    content: "";
    position: absolute;
    left: 6%;
    right: 6%;
    top: 50%;
    height: 2px;
    background: linear-gradient(90deg, var(--cyan), var(--violet), var(--green));
    background-size: 220% 100%;
    box-shadow: 0 0 18px rgba(77, 243, 255, 0.34);
    opacity: 0.55;
    animation: conveyor-flow 4.8s linear infinite;
  }
}

.loop-node {
  position: relative;
  z-index: 1;
  min-height: 138px;
  padding: 14px;
  border: 1px solid rgba(97, 219, 255, 0.3);
  border-radius: 16px;
  background: rgba(7, 18, 30, 0.88);
  box-shadow: inset 0 0 24px rgba(77, 243, 255, 0.05);

  span,
  strong,
  small {
    display: block;
  }

  span {
    color: var(--cyan);
    font-size: 11px;
    font-weight: 900;
  }

  strong {
    margin-top: 6px;
    color: var(--text);
    font-size: 16px;
  }

  p {
    margin: 8px 0;
    color: #d8f5ff;
    line-height: 1.5;
  }

  small {
    color: var(--muted);
    font-family: "Cascadia Mono", Consolas, monospace;
  }

  &.return {
    border-color: rgba(255, 92, 154, 0.66);
    box-shadow: 0 0 18px rgba(255, 92, 154, 0.14);

    &::after {
      content: "reroute";
      position: absolute;
      right: 12px;
      top: 12px;
      color: var(--red);
      font-family: "Cascadia Mono", Consolas, monospace;
      font-size: 10px;
      text-transform: uppercase;
      animation: return-pulse 1.4s ease-in-out infinite;
    }
  }

  &.review {
    border-color: rgba(195, 92, 255, 0.58);
  }
}

@keyframes pipeline-scan {
  0% { transform: translateY(0); opacity: 0; }
  8% { opacity: 1; }
  92% { opacity: 1; }
  100% { transform: translateY(760px); opacity: 0; }
}

@keyframes station-pulse {
  0%, 100% { transform: scale(1); opacity: 0.78; }
  50% { transform: scale(1.18); opacity: 1; }
}

@keyframes return-pulse {
  0%, 100% { opacity: 0.72; }
  50% { opacity: 1; }
}

@keyframes conveyor-flow {
  0% { background-position: 0 0; }
  100% { background-position: 220% 0; }
}

.loop-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.loop-contract {
  min-height: 180px;
  padding: 14px;
  border: 1px solid rgba(97, 219, 255, 0.3);
  border-radius: 16px;
  background: rgba(9, 26, 40, 0.64);

  h3 {
    color: var(--cyan);
  }

  p {
    color: #d8f5ff;
    line-height: 1.55;
  }

  pre {
    margin: 10px 0 0;
    padding: 10px;
    border: 1px solid rgba(97, 219, 255, 0.18);
    border-radius: 10px;
    color: #d8f5ff;
    background: rgba(2, 12, 20, 0.5);
    font-family: "Cascadia Mono", Consolas, monospace;
    font-size: 12px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
  }
}

.graph-board {
  position: relative;
  min-height: 520px;
  border: 1px solid rgba(77, 243, 255, 0.36);
  border-radius: 16px;
  background:
    linear-gradient(90deg, rgba(77, 243, 255, 0.06) 1px, transparent 1px),
    linear-gradient(180deg, rgba(77, 243, 255, 0.05) 1px, transparent 1px),
    rgba(8, 23, 36, 0.68);
  background-size: 46px 46px;
}

.storyboard-lab {
  display: grid;
  grid-template-columns: minmax(420px, 0.9fr) minmax(420px, 1.1fr);
  gap: 14px;
}

.scene-title {
  margin-bottom: 12px;

  h2 {
    margin: 0;
    color: var(--text);
    font-size: 18px;
    line-height: 1.3;
  }

  p {
    margin: 6px 0 0;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.55;
  }
}

.graph-node {
  position: absolute;
  width: 190px;
  padding: 12px;
  border: 1px solid rgba(130, 214, 255, 0.48);
  border-radius: 12px;
  background: rgba(19, 47, 70, 0.88);

  strong,
  span {
    display: block;
  }

  span {
    margin-top: 6px;
    color: var(--muted);
    font-size: 12px;
    line-height: 1.45;
  }

  &.hot {
    border-color: var(--cyan);
    background: rgba(77, 243, 255, 0.16);
    box-shadow: 0 0 20px rgba(77, 243, 255, 0.24);
  }

  &.danger {
    border-color: var(--red);
    background: rgba(255, 92, 154, 0.12);
  }
}

.node-a { left: 28px; top: 34px; }
.node-b { left: 34%; top: 138px; }
.node-c { right: 34px; top: 68px; }
.node-d { left: 110px; bottom: 44px; }
.node-e { right: 120px; bottom: 48px; }

.wire {
  position: absolute;
  height: 2px;
  transform-origin: left center;
  background: linear-gradient(90deg, rgba(77, 243, 255, 0.1), var(--cyan), rgba(195, 92, 255, 0.65));
  box-shadow: 0 0 12px rgba(77, 243, 255, 0.38);
}

.wire-a { left: 190px; top: 92px; width: 260px; transform: rotate(22deg); }
.wire-b { left: 430px; top: 174px; width: 250px; transform: rotate(-18deg); }
.wire-c { left: 250px; bottom: 126px; width: 340px; transform: rotate(-5deg); }

.shot-inspector {
  min-height: 520px;
  display: grid;
  grid-template-rows: auto auto auto auto 1fr;
  gap: 12px;
  padding: 14px;
  border: 1px solid rgba(195, 92, 255, 0.38);
  border-radius: 16px;
  background: linear-gradient(180deg, rgba(15, 30, 49, 0.8), rgba(7, 18, 30, 0.78));
  box-shadow: inset 0 0 28px rgba(195, 92, 255, 0.07);
}

.inspector-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;

  strong {
    color: var(--text);
    text-align: right;
  }
}

.shot-preview-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.shot-version {
  min-height: 74px;
  display: grid;
  align-content: end;
  gap: 4px;
  padding: 10px;
  border: 1px solid rgba(97, 219, 255, 0.28);
  border-radius: 12px;
  background:
    linear-gradient(135deg, rgba(77, 243, 255, 0.18), rgba(195, 92, 255, 0.12)),
    rgba(8, 23, 36, 0.72);

  b,
  small {
    display: block;
  }

  small {
    color: var(--muted);
  }

  &.pass {
    border-color: rgba(97, 255, 190, 0.55);
  }

  &.return {
    border-color: rgba(255, 92, 154, 0.65);
    box-shadow: 0 0 18px rgba(255, 92, 154, 0.14);
  }

  &.review {
    border-color: rgba(195, 92, 255, 0.65);
  }
}

.inspector-block {
  padding: 12px;
  border: 1px solid rgba(97, 219, 255, 0.22);
  border-radius: 12px;
  background: rgba(4, 17, 28, 0.58);

  h3 {
    margin-bottom: 8px;
    color: var(--cyan);
    font-size: 15px;
  }

  p {
    margin-bottom: 8px;
    color: #d8f5ff;
    line-height: 1.55;
  }

  pre {
    margin: 0;
    color: #d8f5ff;
    font-family: "Cascadia Mono", Consolas, monospace;
    font-size: 12px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
  }

  dl {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    margin: 0;

    div {
      min-width: 0;
      padding: 8px;
      border-radius: 10px;
      background: rgba(77, 243, 255, 0.06);
    }

    dt {
      color: var(--muted);
      font-size: 12px;
    }

    dd {
      margin: 4px 0 0;
      color: var(--text);
      line-height: 1.4;
    }
  }
}

.audit-list,
.event-list,
.trace-scene,
.settings-scene {
  display: grid;
  gap: 10px;
}

.storyboard-toolbar {
  display: grid;
  grid-template-columns: repeat(3, minmax(150px, auto)) minmax(220px, 1fr);
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;

  span {
    justify-self: end;
    color: var(--muted);
    font-size: 12px;
  }
}

.audit-matrix {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

.audit-card {
  min-width: 0;
  padding: 12px;
  border: 1px solid rgba(97, 219, 255, 0.22);
  border-radius: 8px;
  background:
    linear-gradient(145deg, rgba(6, 22, 34, 0.9), rgba(10, 33, 48, 0.72)),
    rgba(9, 26, 40, 0.62);

  &.return {
    border-color: rgba(255, 80, 112, 0.6);
    box-shadow: 0 0 26px rgba(255, 80, 112, 0.08);
  }

  &.review {
    border-color: rgba(195, 92, 255, 0.46);
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    color: var(--muted);
    font-size: 11px;
  }

  h3 {
    margin: 10px 0;
    font-size: 15px;
  }

  dl {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin: 0;
  }

  dt {
    color: var(--dim);
    font-size: 11px;
  }

  dd {
    margin: 2px 0 0;
    color: var(--text);
    font-size: 12px;
    line-height: 1.35;
  }

  p {
    margin: 10px 0 0;
    color: var(--muted);
    font-size: 12px;
    line-height: 1.45;
  }
}

.return-chain {
  display: grid;
  gap: 8px;

  span {
    padding: 10px;
    border: 1px solid rgba(255, 80, 112, 0.26);
    border-radius: 8px;
    color: var(--muted);
    background: rgba(255, 80, 112, 0.07);
  }
}

.audit-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border: 1px solid rgba(97, 219, 255, 0.22);
  border-radius: 10px;
  background: rgba(9, 26, 40, 0.62);

  b {
    font-size: 12px;

    &.pass { color: var(--green); }
    &.return { color: var(--red); }
    &.wait { color: #6f8799; }
    &.review { color: var(--violet); }
  }
}

.event-list span {
  padding: 10px;
  border: 1px solid rgba(97, 219, 255, 0.22);
  border-radius: 10px;
  color: var(--muted);
  background: rgba(9, 26, 40, 0.62);
}

.settings-scene {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.setting-card {
  min-height: 136px;

  button {
    min-height: 30px;
    margin-top: 10px;
    border-radius: 15px;
    padding: 0 12px;
    color: #061019;
    background: var(--cyan);
  }
}

.trace-card {
  min-height: auto;

  strong,
  span {
    display: block;
  }

  span {
    margin-top: 6px;
  }
}

.shot-rail {
  padding: 16px 18px;
  overflow: hidden;
  display: grid;
  grid-template-rows: 28px minmax(0, 1fr);
  gap: 12px;
}

.rail-line {
  position: relative;
  height: 16px;
  margin: 5px 12px 0;
  border-radius: 8px;
  background: linear-gradient(90deg, var(--cyan), var(--violet), var(--blue));
  box-shadow: 0 0 16px rgba(77, 243, 255, 0.35);

  i {
    position: absolute;
    top: -5px;
    width: 10px;
    height: 26px;
    border-radius: 8px;
    background: rgba(232, 247, 255, 0.8);
    box-shadow: 0 0 10px var(--cyan);
  }
}

.shot-list {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 190px;
  gap: 12px;
  overflow-x: auto;
}

.shot-card {
  display: grid;
  gap: 6px;
  align-content: start;
  padding: 0 0 10px;
  text-align: left;
  color: var(--text);
  border: 1px solid rgba(97, 219, 255, 0.3);
  border-radius: 12px;
  background: rgba(8, 23, 36, 0.72);
  overflow: hidden;

  strong,
  small,
  .tag {
    margin-left: 10px;
    margin-right: 10px;
  }

  small {
    color: var(--muted);
  }

  &.return {
    border-color: var(--violet);
    box-shadow: 0 0 18px rgba(195, 92, 255, 0.28);
  }

  &.active {
    border-color: var(--cyan);
    box-shadow: 0 0 22px rgba(77, 243, 255, 0.3);
  }
}

.shot-thumb {
  height: 78px;
  background:
    linear-gradient(135deg, rgba(77, 243, 255, 0.28), rgba(195, 92, 255, 0.2)),
    linear-gradient(180deg, #14283a, #071018);
}

.monitor-panel {
  display: grid;
  grid-template-rows: 58px auto auto minmax(0, 1fr);
  gap: 14px;
  padding-bottom: 16px;

  > section {
    padding: 0 16px;
    overflow: auto;
  }
}

.monitor-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  padding: 16px 16px 0;

  article {
    min-height: 76px;
    padding: 12px;
    border: 1px solid rgba(97, 219, 255, 0.25);
    border-radius: 12px;
    background: rgba(9, 26, 40, 0.68);
  }

  span {
    color: var(--muted);
    font-size: 12px;
  }

  strong {
    display: block;
    margin-top: 6px;
    color: var(--cyan);
    font-size: 24px;
  }
}

.gate-card {
  margin: 0 16px;
  padding: 14px !important;
  border: 1px solid rgba(195, 92, 255, 0.66);
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(195, 92, 255, 0.15), rgba(8, 23, 36, 0.72));
  box-shadow: inset 0 0 22px rgba(195, 92, 255, 0.1);

  p {
    color: var(--muted);
    line-height: 1.55;
  }
}

.warehouse-section {
  min-height: 0;
}

.warehouse-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;

  select {
    min-width: 96px;
    border: 1px solid rgba(97, 219, 255, 0.28);
    border-radius: 6px;
    padding: 4px 6px;
    color: var(--text);
    background: rgba(8, 23, 36, 0.86);
  }
}

.warehouse-list {
  display: grid;
  gap: 6px;
}

.warehouse-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 3px 8px;
  padding: 8px;
  border: 1px solid rgba(97, 219, 255, 0.18);
  border-radius: 8px;
  background: rgba(9, 26, 40, 0.5);

  strong,
  span,
  b {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span {
    color: var(--muted);
    font-size: 11px;
  }

  b {
    grid-row: 1 / span 2;
    grid-column: 2;
    align-self: center;
    font-size: 11px;

    &.pass { color: var(--green); }
    &.wait { color: var(--muted); }
  }
}

.warehouse-empty {
  color: var(--muted);
  font-size: 12px;
}

@media (max-width: 1280px) {
  .harness-factory {
    height: auto;
    min-height: 100%;
    overflow: auto;
  }

  .factory-topbar,
  .factory-grid,
  .center-stack,
  .work-top,
  .command-dock,
  .storyboard-lab,
  .art-lab,
  .post-lab,
  .loop-map,
  .loop-grid,
  .artifact-strip,
  .audit-matrix,
  .storyboard-toolbar,
  .quad-grid,
  .metric-row,
  .settings-scene {
    grid-template-columns: 1fr;
  }

  .art-asset-card {
    grid-template-columns: 1fr;
  }

  .factory-topbar {
    min-height: 112px;
    padding: 16px;
  }

  .center-stack {
    grid-template-rows: auto auto;
  }
}
</style>
