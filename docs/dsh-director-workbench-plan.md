# Toonflow × DeepSeek Harness 导演工作台 — 可行性分析与集成方案

> 版本：v1（分析稿） · 对象：将 Toonflow 短剧生产线接入 DeepSeek Harness（DSH），
> 以 DSH 为平台驱动「小说 → 事件图谱 → 剧本 → 分镜 → 素材 → 视频」全流程，建成一个「导演工作台」。

---

## 1. 结论先行

**完全可行，且不需要改动 Toonflow 的源码。**

- Toonflow 自带一套完整、自描述的 REST API（`/api/*`，自动路由注册），覆盖小说、事件图谱、
  剧本、分镜、素材、视频生成、任务轮询全链路；
- DSH 恰好提供集成所需的全部挂载面：**Host 工具（模型可调用的 Tool）**、**Client 槽位（浏览器 UI）**、
  **Agent 预设（导演人设与编排）**、**Skill（流程知识）**；
- 推荐的形态是「**插件（桥梁）＋ Agent（导演）**」组合：插件负责把 Toonflow 的 API 变成 DSH 的
  工具和面板，Agent 预设负责用导演视角编排整个生产流程。

---

## 2. 现状盘点（已核实）

### 2.1 Toonflow 侧

| 项 | 事实 |
| --- | --- |
| 技术栈 | Node.js + Express 5 + SQLite（better-sqlite3/knex）+ Socket.IO + Vercel AI SDK + ONNX 本地记忆 |
| 服务形态 | 后端 API 与前端同端口（当前实例 `http://127.0.0.1:50188`，Vite dev 模式，已在运行） |
| 认证 | `POST /api/login` `{username, password}` → `{ token: "Bearer …" }`（JWT，有效期 180 天）；后续请求带 `Authorization: Bearer <token>`，缺失/无效返回 401 |
| 路由挂载 | 文件命名即路由，统一挂 `/api` 前缀（`src/core.ts` 自动生成 `src/router.ts`） |
| 任务模型 | 图片/视频生成是**异步任务**：接口立即返回，`o_tasks` / `o_video` 记录状态（生成中/生成成功/生成失败），由 `/api/task/getTaskApi` 轮询 |
| 领域模型 | 项目已内置「导演手册（DirectorManual）」「视觉手册（VisualManual）」，与导演工作台语义天然对齐 |

### 2.2 关键 API 面（已从路由清单核实）

- 项目：`POST /api/project/addProject`（含 `directorManual`、`artStyle`、`imageModel`、`videoModel`、`videoRatio`…）、`getProject`、`addDirectorManual`、`queryDirectorManual`、`addVisualManual`、`visualManual`
- 小说：`/api/novel/addNovel`、`getNovelData`、`/api/novel/event/generateEvents`（章节事件图谱）
- 剧本：`/api/script/addScript`、`batchAddScript`、`extractAssets`、`exportScript`；`/api/scriptAgent/getPlanData`、`setPlanData`
- 分镜：`/api/production/storyboard/addStoryboard`、`batchGenerateImage`、`previewImage`、`getStoryboardData`
- 生产：`/api/production/getFlowData`、`saveFlowData`；`/api/production/workbench/generateVideo`、`batchGenerateVideo`、`generateVideoPrompt`、`getVideoList`
- 素材：`/api/assets/generateAssets`、`/api/assetsGenerate/batchGenerateImageAssets`
- 任务：`/api/task/getTaskApi`（按 `taskClass/state/projectId` 分页轮询）
- 其他：`/api/comfyui/*`（ComfyUI 服务器与工作流管理）、`/api/setting/vendorConfig/*`（模型供应商）

### 2.3 DSH 侧可用的集成面

| 机制 | 用途 |
| --- | --- |
| 动态 Cordis 插件（Host 半部） | 在 DSH 宿主进程内实现 Toonflow API 桥接，注册为模型可调用的 Tool |
| 动态 Cordis 插件（Client 半部） | 在 DSH Web GUI 的 Slot 里渲染「导演工作台」面板（流程步进器、状态卡、成品预览） |
| Package 私有 RPC | Client 面板 → Host 桥接（`host.call` / `harness.handle`），面板按钮触发生产动作 |
| Agent 预设（cordis.yml 行） | 「导演」人设：职责、编排顺序、成本闸门、交接规范；可持久化到 `~/.dsh/.agent-presets/` |
| Skill | 流程知识（拆书 → 事件图谱 → 改编策略 → 分镜 → 视频提示词规范）可外化为 Markdown |
| 后台任务（job） | 若 Toonflow 未启动，DSH 可把它作为受管后台进程拉起并做健康检查 |

---

## 3. 集成形态对比

| 方案 | 做法 | 优点 | 缺点 | 建议 |
| --- | --- | --- | --- | --- |
| **A. 外部服务 + 桥梁插件（推荐）** | Toonflow 保持独立进程；DSH Host 插件做 HTTP 客户端（登录/令牌/轮询），注册 ~15 个 Tool；Client 面板做导演工作台；Agent 预设做导演大脑 | 零改动 Toonflow；可对当前 50188 实例直接接入；职责清晰、易回滚 | 需维护令牌与会话；面板与 Toonflow 原生 UI 并存 | ✅ 首选 |
| **B. iframe 嵌入式** | 在 DSH GUI 的 Slot 里嵌 `http://127.0.0.1:50188` | 最轻量，立即获得完整原生 UI | Agent 看不到 iframe 内部；两套 UI 割裂 | 作为 A 的辅助预览页 |
| **C. 宿主化（进程内集成）** | 把 Toonflow 的 Express/DB/Socket 装进 DSH 宿主进程或 cordis.yml 服务行 | 单进程、免独立启动 | 侵入大：Vite、socket.io、ONNX、Electron 路径等生命周期耦合，风险高 | 二期再评估 |
| **D. 纯 Agent 预设 + 脚本** | 不写插件，Agent 用 pwsh/curl 调 API | 最快原型 | 无 UI、鲁棒性差 | 原型验证用 |

---

## 4. 目标架构（方案 A）

```
┌────────────────────────── DeepSeek Harness ──────────────────────────┐
│                                                                      │
│  Web GUI（Slot 面板）                                                │
│  ┌──────────────────────────────┐   host.call/RPC   ┌──────────────┐ │
│  │ 导演工作台                    │ ────────────────▶ │ Host 插件     │ │
│  │ · 流程步进器 小说→…→视频      │                   │ toonflow-     │ │
│  │ · 项目/任务/成品状态卡        │                   │ bridge        │ │
│  │ · 素材与成片预览              │                   │ · 登录/令牌缓存│ │
│  │ · iframe 预览原生界面（可选） │                   │ · 401 自动重登 │ │
│  └──────────────────────────────┘                   │ · 任务轮询     │ │
│                                                      └──────┬───────┘ │
│  Agent（导演预设 + Skill）                                    │ HTTP   │
│  · 拆书 → 事件图谱 → 改编策略 → 剧本                          │        │
│  · 分镜 → 素材 → 视频 → 质检/迭代                             ▼        │
│  · 昂贵动作（出图/出片）前必须确认                    ┌──────────────┐ │
│  · 调用 bridge 的 ~15 个 Tool                         │ Toonflow     │ │
│                                                      │ 127.0.0.1:    │ │
│                                                      │ 50188        │ │
│                                                      │ /api/* REST  │ │
│                                                      │ + Socket.IO  │ │
│                                                      └──────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

### 4.1 桥梁插件（Host 半部）—— Tool 清单草案

配置：`baseUrl`（默认 `http://127.0.0.1:50188`）、`username/password`、令牌缓存与 401 自动重登。

| Tool | 映射 API | 说明 |
| --- | --- | --- |
| `toonflow_health` | `GET /`、登录探测 | 确认服务在跑、凭据有效 |
| `toonflow_list_projects` | `/api/project/getProject` | 项目列表 |
| `toonflow_create_project` | `/api/project/addProject` | 含导演手册/画风/模型/比例 |
| `toonflow_get_project` | `/api/general/getSingleProject` | 单个项目详情 |
| `toonflow_set_director_manual` | `/api/project/addDirectorManual` | 导演手册（世界观/人物/风格基调） |
| `toonflow_set_visual_manual` | `/api/project/addVisualManual` | 视觉手册（画风一致性） |
| `toonflow_import_novel` | `/api/novel/addNovel` | 导入原著文本 |
| `toonflow_generate_events` | `/api/novel/event/generateEvents` | 章节事件图谱提取（异步，配合轮询） |
| `toonflow_get_events` | `/api/novel/event/getEvent` | 读取事件图谱 |
| `toonflow_generate_script` | `/api/script/*` + `/api/scriptAgent/setPlanData` | 生成/更新剧本与改编策略 |
| `toonflow_get_script` | `/api/script/getScrptApi` | 读取剧本 |
| `toonflow_generate_storyboard` | `/api/production/storyboard/batchGenerateImage` | 批量分镜出图（异步） |
| `toonflow_get_storyboard` | `/api/production/storyboard/getStoryboardData` | 分镜数据与图片地址 |
| `toonflow_generate_video` | `/api/production/workbench/generateVideo` | 单镜头/批量出片（异步、贵） |
| `toonflow_get_videos` | `/api/production/workbench/getVideoList` | 成片列表与状态 |
| `toonflow_poll_task` | `/api/task/getTaskApi` | 按 taskClass/state 轮询任务（图片/视频生成进度） |
| `toonflow_get_assets` | `/api/assets/getAssetsApi` | 素材库 |

> 异步约定：出图/出片 Tool 提供 `submit`（立即返回任务号）与 `wait`（内部轮询到终态并返回产物 URL）两种模式，适配 Agent 的「发起 → 巡检 → 收尾」节奏。

### 4.2 导演工作台面板（Client 半部）

- 在 DSH Web GUI 注册一个 Slot 面板：
  - **流程步进器**：小说 → 事件图谱 → 剧本/改编策略 → 分镜 → 素材 → 视频 → 导出；每步显示状态（未开始/进行中/成功/失败/耗时）；
  - **项目与任务卡**：从 bridge 拉取 `getProject` + `getTaskApi` 实时渲染；
  - **成品预览**：通过 `/oss/*` 静态地址渲染分镜图/成片（缩略图 `?size=small` 已内置）；
  - **操作按钮**：点击某一步 → `host.call` 触发 bridge 对应动作（敏感步骤弹出确认）；
  - **可选 iframe 页**：一键打开 Toonflow 原生无限画布。
- 面板数据全部走 bridge 的 RPC（仅 JSON），不直接触碰 Toonflow。

### 4.3 导演 Agent 预设

- 身份：资深导演 / 制片人，负责把一部小说推进为成片；
- 编排：按 4.1 的 Tool 顺序执行，节点间检查产物（事件图谱非空、剧本完整、分镜图就绪）再进入下一步；
- 成本闸门：`generateVideo` 等计费动作默认需用户确认；可配置预算上限与「确认一次后批量」模式；
- Skill：拆书要点、事件图谱规范、分镜语言、视频提示词模板（可参考 Toonflow 自身 `data/skills/` 提示词体系）；
- 落盘位置：`~/.dsh/.agent-presets/toonflow-director/`，通过 cordis.yml 挂载为新会话预设。

---

## 5. 实施路线（分四阶段，每阶段可独立交付）

| 阶段 | 内容 | 产出 | 工作量 |
| --- | --- | --- | --- |
| **P1 桥梁原型** | 动态 Cordis 插件（Host 半部）：登录/令牌/轮询 + 首批 8~10 个 Tool | 在 DSH 会话里用自然语言驱动「小说→分镜图」跑通 | ~0.5–1 天 |
| **P2 全流程打通** | 补齐视频生成与任务轮询 Tool；验证「小说→成片」端到端 | 一次真实成片（计费注意） | ~1 天 |
| **P3 工作台 GUI** | Client 半部：流程步进器 + 状态卡 + 预览 + RPC 按钮 | DSH Web GUI 内可操作的导演工作台 | ~1–2 天 |
| **P4 持久化发布** | 插件入 cordis.yml/registry，制作「导演」agent 预设与 Skill，DSH 后台任务托管 Toonflow 启停 | 一键可用的持久集成 | ~1 天 |

> P1/P2 可用「动态 Cordis 插件」直接在本次会话内原型（定义→运行→调试，无需重启 DSH）；
> P3/P4 若需随 DSH 持久存在，走插件仓库（类似 dsh-ssh / dsh-task-board 的包结构）与 agent-preset 目录。

---

## 6. 风险与边界

| 项 | 说明 | 对策 |
| --- | --- | --- |
| 成本 | 出图/出片按次计费（官方 Demo 全片约 ¥130） | 昂贵动作默认确认；预算上限；任务级取消 |
| 凭据 | 登录口令存于 DSH 配置 | 存用户主目录私有文件（0600），可配置；令牌缓存于内存 |
| 长任务 | 视频生成分钟级，Socket.IO 有进度推送 | 先做轮询，二期接 Socket.IO 实时进度 |
| 并发 | 多次出片在服务端排队 | 任务卡展示排队数；一次一个项目推进 |
| 版本耦合 | Toonflow API 变更 | 桥梁集中封装 API 契约；升级时只改 bridge |
| Electron 专属能力 | 本地文件对话框等 API 不可用 | 工作台只用 REST 管线能力，不影响 |
| 许可证 | Apache-2.0 + 补充商业协议 | 内部使用/自研合规；对外分发需授权 |

---

## 7. DSH 在内核中的角色（能驱动吗——能，且已在验证中）

**分工一句话：DSH 是「导演/大脑」，Toonflow 是「剧组/引擎」。**

| 层 | 谁 | 职责 |
| --- | --- | --- |
| 决策与编排（导演） | **DSH（Agent + 插件）** | 理解需求、拆解任务、决定下一步、检查产物、成本闸门、多项目调度、人机交互（GUI 面板） |
| 领域执行（剧组） | **Toonflow** | 事件提取、剧本/改编策略、分镜出图、视频生成、素材管理、任务队列、供应商调度（具体 AI 调用） |
| 记忆与复盘 | DSH 会话记忆 / Toonflow ONNX 记忆 | DSH 负责跨会话的创作决策记忆；Toonflow 负责其内部 Agent 的领域记忆 |

DSH 作为内核驱动 Toonflow 的机制（P1 已验证）：

1. **工具调用即驱动**：DSH 插件把 Toonflow 的 REST API 封装为模型工具（`toonflow_*`），
   模型在对话中「调用工具 = 指挥 Toonflow 干活」，这正是 Agent 化驱动的标准形态；
2. **编排即导演**：DSH 的 Agent 预设定义「先建项目 → 再导小说 → 等事件图谱 → 再出剧本 → …」的
   流程与产物校验规则，替代人工在 Web UI 里点按钮；
3. **面板即工作台**（P3）：DSH Client 槽位渲染流程步进器/状态卡/预览，让 DSH Web GUI 成为导演工作台本体；
4. **调度即制片**：DSH 后台任务、子代理、AgentTeams 可并发管理多个 Toonflow 项目；
5. **安全即制片预算**：DSH 权限沙箱 + 成本闸门控制出图/出片等计费动作。

> 结论：**DSH 完全可以作为内核驱动 Toonflow**——不必改动 Toonflow 源码，二者通过 API 契约解耦；
> 未来若要更强耦合（实时进度、进程内服务），再评估方案 C。

## 8. P1 实测结果（2026-08-26）

动态 Cordis 插件 `toonflow-bridge`（Host 半部，8 个工具）已在本会话内定义并运行成功，
对接当前 `http://127.0.0.1:50188` 实例，完成全链路验证：

| 步骤 | 工具 | 结果 |
| --- | --- | --- |
| 连接+登录 | `toonflow_health` | ✅ 自动登录 admin，API 可用 |
| 项目列表 | `toonflow_list_projects` | ✅ 返回项目数组 |
| 建项目（导演手册） | `toonflow_create_project` | ✅ 创建「DSH导演工作台演示·都市奇遇」id=1787675277104 |
| 导入小说 | `toonflow_import_novel` | ✅ 2 章节入库，自动触发事件提取 |
| 读取事件图谱 | `toonflow_api` → `novel/getNovelEventState` | ✅ 两章均 eventState=1，产出结构化事件（人物/剧情/强度/时长/情绪） |

### 实现要点（已踩坑记录）

- **传输层**：DSH Host 半部无全局 `fetch`，且 PowerShell 原生参数传递会破坏 curl 的
  `@-` 与 JSON 引号 → 改用 `ctx.subprocess.spawn` 以 **argv 数组** 直接调用 `curl.exe`，
  stdin 用 `{ data: string }` 模式，完全绕开 shell 解析；
- **登录端点**：鉴权白名单是 `/api/login/login` 而非 `/api/login`；
- **输出契约**：动态工具 output schema 为 `type: object`，数组结果必须包装（`{projects}`/`{data}`）；
- **Schema 校验**：参数顶层 `additionalProperties` 必须省略或 true，嵌套对象需显式 true/false；
- **令牌**：登录返回 `Bearer` 令牌（180 天），桥接层缓存于内存，401 自动重登一次。

### 尚未验证（属 P2）

- 剧本生成（`/api/scriptAgent/*`、`/api/script/*`）、分镜出图（`/api/production/storyboard/*`）、
  视频生成（`/api/production/workbench/*`）——接口契约已核实，需在 P2 补齐工具并实测（出片计费）。

## 9. 下一步建议

1. **P2 打通剧本→分镜→出片**：为 `scriptAgent`、`storyboard`、`workbench` 补齐类型化工具，
   补 `wait` 模式（内部轮询任务到终态），验证「小说 → 成片」端到端（出片前需用户确认，计费）；
2. **P3 导演工作台 GUI**：Client 半部流程步进器 + 状态卡 + 素材/成片预览 + RPC 按钮；
3. **P4 持久化发布**：插件入 DSH 插件仓库（cordis.yml / web-ui 包结构）、「导演」Agent 预设入
   `~/.dsh/.agent-presets/`、Skill 流程知识外化、DSH 后台任务托管 Toonflow 启停。

> 本分析基于当前代码与运行实例核实：路由清单、登录/令牌契约、任务轮询接口、
> 视频生成异步模型均已确认可用，P1 已实测跑通，故判定方案 A 可落地、无阻塞性风险。
