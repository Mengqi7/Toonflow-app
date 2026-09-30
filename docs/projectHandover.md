# Toonflow 项目全景说明与 DeepSeek Harness 接管指南

> 文档定位：面向后续维护者与 DeepSeek Harness 编码 Agent 的代码级接管文档。  
> 基线：`develop-new` 分支，2026-09-30 静态审阅结果。  
> 事实来源：当前仓库源码、构建配置、开发规范；本文不会把宣传规划当成已经实现的能力。

## 1. 项目概述

Toonflow 是一个面向短剧、漫剧和短视频制作的本地优先 AI 创作平台。它不是单一的“文生视频”页面，而是把以下能力组织在同一个项目工作区中：

- 用无限画布组织剧本、文字、图片、音频、视频、生成任务和 3D 预演；
- 配置第三方或本地语言模型、图片模型、视频模型和音频模型；
- 通过内置 Agent 理解用户意图、读取项目资料并调用工具操作画布；
- 通过节点、Agent 工具、Skill、媒体供应商和 Agent Team 扩展能力；
- 通过 MCP 将 Toonflow 的画布、文件、媒体、插件管理等能力开放给外部 Coding Agent；
- 以 Web、独立 Server、Docker、Windows 桌面和 macOS 桌面多种方式运行；
- 将项目、素材和 Agent 历史保存到用户自己的目录，而非强制上传到 Toonflow 平台。

根包描述将产品概括为“利用 AI 将小说转化为剧本，并结合 AI 图片和视频完成短剧创作”。从当前代码看，真实产品能力已经扩展到工作区文件、富文本文档、动态图形节点、Agent 工具链、MCP、插件市场、FFmpeg 和桌面更新等多个层面。

### 1.1 当前实现状态的总判断

| 状态 | 能力 |
| --- | --- |
| 已实现 | 首次引导、项目创建/导入、无限画布、多画布、基础媒体节点、图片/视频生成节点、3D 导演台、素材库、Markdown 文档、内置 Agent、Skill、工具插件、节点插件、媒体供应商、MCP、FFmpeg 管理、桌面客户端与更新 |
| 有条件可用 | AI 和媒体生成依赖用户配置的模型及网络；MCP 需要显式开启；桌面原生功能只在桌面宿主可用；服务器工作区受 `data/workspaces` 边界限制 |
| 部分实现 | Agent Team、远程 Agent 与 A2A 后端已有较完整实现，但普通插件市场入口仍关闭；大量画布实例不主动回收；没有跨客户端编辑冲突合并 |
| 明确不是现有能力 | 全站用户登录和多租户权限、多人实时协作、数据库项目模型、云端素材同步、生产级插件沙箱、服务端集群共享锁、自动成片时间线编辑器 |

## 2. 技术栈与总体架构

### 2.1 技术栈

- 运行时与包管理：Bun 1.3.14；
- 语言：TypeScript、ES Modules；
- Monorepo：Bun Workspaces；
- Web：Vue 3、Vite、Vue Router、Pinia、Element Plus；
- 画布：Vue Flow，并应用仓库内 patch；
- 文档：Tiptap 3 + Markdown；
- Agent：`@earendil-works/pi-coding-agent`、`pi-agent-core`、`pi-ai`；
- Server：Express 5、Zod、`conf`；
- 桌面：Electrobun；
- 3D：Three.js、Tween.js、threejson；
- 媒体：FFmpeg/FFprobe、供应商插件；
- MCP：独立 `@toonflow/mcp` 包，支持 Streamable HTTP 和 stdio 桥。

### 2.2 运行拓扑

```text
浏览器 / Electrobun WebView
        │
        ├── Vue Web SPA
        │     ├── 首页、设置、画布、文档、Agent
        │     ├── 动态加载节点 UMD 与工具渲染器
        │     └── MCP 页面控制 SSE
        │
        ▼
Express/Bun Server
        ├── /api/* 业务接口
        ├── /mcp   MCP Streamable HTTP
        ├── /a2a   Agent-to-Agent
        ├── Agent Runtime + Tool Runtime
        ├── Provider Runtime + Media Generation
        ├── FFmpeg Runtime
        └── 工作区与 data/ 持久化
```

独立 Server 固定监听 `3000`。桌面端在主进程内复用同一个 `createApp()`，仅监听 `127.0.0.1` 的随机端口，再由 WebView 打开该地址。Web 不是能独立工作的纯静态站点，绝大多数能力依赖同源 Server。

### 2.3 设计特征

1. **本地优先**：画布、素材、文档和对话保存到本地工作区。
2. **文件即项目**：目前没有数据库项目实体；一个绝对目录就是一个项目。
3. **单进程假设**：文件锁、活跃 Agent、MCP 控制、FFmpeg 下载状态等均为进程内状态。
4. **插件化**：节点运行在浏览器，工具运行在 Server，媒体供应商运行在受限 VM，三者信任模型不同。
5. **Agent 与 UI 共用能力**：画布操作既供用户界面使用，也通过桥接开放给 Agent 和 MCP。

## 3. 仓库目录职责

```text
apps/
  web/                 Vue SPA
  server/              Express API、Agent、MCP 宿主、媒体与文件能力
  desktop/             Electrobun 桌面宿主、安装器、原生辅助程序、更新器
  updateServer/        桌面增量更新文件的轻量静态服务器
packages/
  assets/              Logo 等公共静态资源
  ffmpeg/              FFmpeg 下载、探测和安全包装
  mcp/                 MCP HTTP 协议与 stdio 桥
  modelIcons/          模型图标映射与组件
  nodeScaffold/        节点插件 SDK、运行上下文和通用组件
  nodes/               内置画布节点
  providers/           内置语言/媒体供应商定义
  startup/             桌面原生启动动画
  teamScaffold/        Agent Team 清单及构建校验
  teams/               示例 Agent Team
  toolScaffold/        Agent 工具插件 SDK 与客户端渲染器
  tools/               内置 Agent 工具
  skills/              内置创作 Skill
compat/macIntel/       Intel Mac 的旧版 Electrobun 兼容层
build/                 构建输出，Git 忽略
data/                  本地设置、插件、素材、工作区等运行数据，Git 忽略
docs/                  产品、开发和接管文档
patches/                第三方依赖补丁
```

## 4. 用户功能全景

### 4.1 首次启动与模型配置

第一次进入 `#/hello` 时，用户可以：

- 在嵌入式 TF-Router 页面登录或注册；
- 接收 TF-Router 返回的 API Key；
- 自动获取文本模型并安装/配置对应媒体供应商；
- 手工添加私有文本模型供应商；
- 跳过配置后进入首页。

登录消息会校验 `postMessage` 的 origin 和 iframe source。引导状态写入全局设置。若引导已完成，再访问 `/hello` 会跳转首页。

### 4.2 项目首页

首页提供两条项目入口：

1. **灵感创作**：输入创作描述，选择空工作目录、语言模型和推理强度，创建项目并把首条描述带入工作区 Agent。
2. **项目列表**：导入已有目录、添加空项目、打开最近项目、按最近时间排序、切换网格/列表展示、修改项目显示名、从列表移除。

创建项目时会确认目录为空，并以独占模式创建：

```json
{
  "toonflowCanvas": true,
  "nodes": [],
  "edges": [],
  "viewport": { "x": 0, "y": 0, "zoom": 1 }
}
```

初始文件名为 `画布1.json`。项目“重命名”只修改本机项目列表中的显示名，不重命名磁盘目录；“移除”也不会删除文件。

### 4.3 工作区主界面

工作区包含：

- 画布面板；
- 文档面板；
- 左上工作区菜单；
- 居中面板切换器；
- 可停靠、拖动和缩放的 Agent 面板；
- 设置弹窗。

切换面板前会保存文档；退出工作区前同时 flush 文档和画布。保存失败时用户可以留在项目重试，或明确接受丢弃未保存修改后退出。

### 4.4 无限画布

画布的主要用户能力包括：

- 创建、切换和重命名多张画布；
- 添加、删除、复制、粘贴、拖动和重命名节点；
- 框选、多选、编组和解组；
- 按端口类型连接节点、断开连线；
- 撤销、重做；
- 网格吸附；
- 隐藏/显示连线和配置连线颜色、动画；
- 平移、鼠标/触控缩放、适应视图；
- 搜索和聚焦节点；
- 自动整理整张画布或整理选区；
- 从文件选择器或拖放导入图片、视频、音频、文本；
- 打开项目素材库并把节点输出保存为素材；
- 使用可配置快捷键操作画布。

画布文件保存 `toonflowCanvas` 标记、`nodes`、`edges`、`viewport`。修改采用 500ms 防抖、同页串行写入和 revision 循环，避免较慢的旧请求覆盖新修改。它不解决多个浏览器/进程同时编辑同一文件的问题。

画布宿主会保留已打开画布实例，使后台节点任务在切换画布后继续运行；大量画布长时间打开可能增加内存占用。

### 4.5 内置节点

| 节点 | 能力 | 主要端口/行为 |
| --- | --- | --- |
| 文本 | 编写或承载剧本、提示词、说明 | 输入视频/图片/文本，输出 STRING；Agent 可调用 `setText` |
| 图片 | 展示工作区图片 | 输出 IMAGE；可选择已有图片 |
| 视频 | 播放工作区视频 | 输出 VIDEO；可选择已有视频 |
| 音频 | 播放工作区音频 | 输出 AUDIO；可选择已有音频 |
| 图片生成 | 通过媒体供应商生成图片 | 输入图片/文本参考，输出 IMAGE；可读写配置、提示词、开始/取消/查询生成 |
| 视频生成 | 通过媒体供应商生成视频 | 输入图片/视频/音频/文本参考，输出 VIDEO；支持模型模式、比例、分辨率、时长、音频等 |
| 3D 导演台 | 场景搭建、人物与动作、镜头关键帧和动画预演 | 输入文本/图片/视频；支持 AI 生成导演方案、预览动画、导出关键帧图片和视频节点 |

节点插件以 UMD 形式构建和加载，运行时类型通常为 `remote-<name>`。节点可以注册自己的 Agent 函数；Agent 必须先查询函数 schema，再调用具体 `node:*` 函数。

### 4.6 素材能力

系统存在两个不同概念：

1. **工作区素材**：通常在项目的 `assets/` 下，由画布节点、聊天附件和媒体生成使用。
2. **全局素材库**：在数据目录的 `assets/` 下，可跨项目管理，支持目录、读取、上传、重命名和删除。

生成媒体默认保存到工作区 `assets/generated/`。聊天附件保存到工作区 `assets/chat/`。单个 Agent 附件、媒体参考和生成结果上限通常为 100 MB；MCP 二进制传输和插件包上限通常为 20 MB。

### 4.7 Markdown 文档面板

文档面板文件树可发现：

- `.md`、`.markdown` 文件；
- 带 `toonflowCanvas: true` 的画布 JSON；
- 画布中具备 STRING 输出的节点。

编辑器支持：

- 1–6 级标题、正文；
- 有序、无序和任务列表；
- 引用、代码块、行内代码；
- 粗体、斜体、删除线、下划线、高亮、上下标；
- 左中右及两端对齐；
- 链接、图片链接、表格、分隔线；
- 撤销/重做、查找、复制 Markdown。

普通 Markdown 直接写回文件。节点文本通过画布接口写回：文本节点优先调用 `node:setText`；有 `textPath` 的节点写外部文本文件；否则更新节点输出。保存采用 400ms 防抖和顺序队列。

当前文件树没有普通文件的重命名/删除 UI；“插入图片”使用图片链接，不是本地图片上传器。

### 4.8 内置 Agent

Agent 是工作区内的持久 AI 创作搭档，而非一次性聊天框。能力包括：

- 新建、读取、重命名和删除对话；
- 会话以 `.agent/sessions/*.jsonl` 保存；
- 流式展示正文、思考内容、工具调用、提问、统计；
- 编辑并从历史用户消息重发，形成新的历史分支；
- 停止生成；
- 切换模型和推理等级；
- 显示 token、上下文使用量和生成速度；
- 粘贴图片/视频附件；
- 提及节点输出、素材和其他来源；
- 调用画布、文件、媒体、联网、Skill 等工具；
- 向用户发结构化问题；
- 使用本地长期记忆；
- 创建子 Agent 并接收阶段报告；
- 上下文过长时由 SDK 压缩，并拒绝空摘要覆盖原上下文。

服务端通过 NDJSON 返回事件。若 Agent 调用画布，服务端发 `canvasCall`，前端在真实画布上下文执行后将结果回传，保证 Agent 和用户看到的是同一张活动画布。

Agent 系统提示词强调：默认中文、简洁交付、主动使用匹配 Skill、不得猜测节点和模型 ID、媒体生成前确认算力消耗、区分“已开始生成”和“已生成”、尊重项目文件边界。

### 4.9 内置 Agent 工具

| 工具插件 | 暴露能力 |
| --- | --- |
| workspace | 工作区内列目录、读、写、编辑文件；可设置只读 |
| canvas | 查询画布/节点/边/节点函数；增删移动节点、连接、整理、切换画布、调用节点函数 |
| mediaGeneration | 查询可用媒体模型并生成图片、视频、音频 |
| askUser | 单题选项或多字段结构化提问 |
| skillOperator | 列出、读取、创建、更新工作区及全局 Skill |
| webSearch | DuckDuckGo 免 Key，或 DeepSeek/Tavily 搜索 |
| webFetch | 读取公开 HTTP(S) 页面、文本或 JSON，不执行页面脚本 |

此外运行时可按条件加入 `memory`、`subAgent` 和子 Agent 专用 `report` 工具。

### 4.10 Skill

内置 Skill 目前至少包括：

- `workflow`：完整视频制作工作流，包含从创意/小说/剧本到资产、分段提示词和媒体执行的规则；其当前版本内嵌严格的 Seedance 2.0/2.5 分段导演规范。
- `canvas`：画布操作手册，规定查询、分页、节点操作、端口连接、节点函数调用及失败恢复方式。

Skill 支持全局安装和工作区覆盖，主文件为 `SKILL.md`，可带 references。可从 `.md`、ZIP、tar、tar.gz、tgz 安装；安装器限制条目数量、解压大小、路径、特殊文件、重名和版本，整体暂存后切换目录。

### 4.11 模型供应商与媒体生成

文本模型支持自定义：

- Provider ID、显示名称；
- API URL、API Key；
- 协议；
- 模型 ID、显示名、上下文窗口、最大输出 token。

内置语言供应商定义包括 TF-Router、DeepSeek。媒体供应商文件由 TypeScript 描述，当前内置/首次安装来源包括 TF-Router、APIMart、Meta。媒体模型可声明：

- `image`、`video`、`audio` 类型；
- 图片尺寸和比例；
- 视频模式、时长与分辨率组合、是否生成音频；
- 音频音色、语速、音量、格式、采样率；
- 更多供应商自定义参数。

媒体生成统一完成：模型存在性检查、API Key 检查、工作区参考文件读取、MIME 探测、供应商调用、URL/Base64/二进制结果解析、100 MB 上限、随机文件命名、原子写入和失败回滚。

### 4.12 插件市场与扩展

插件类型包括：

- Node：浏览器 UMD；
- Tool：Server 端 `.tool.js`；
- Skill：文档与资源包；
- Provider：媒体供应商 TypeScript；
- Agent Team：`.agent.zip`；
- FFmpeg：不是业务插件，但在同一市场面板管理。

市场支持发现、搜索、分页、查看已安装项、安装、更新、启停、配置和卸载。开发者设置还允许从 URL 或本地文件手工安装。

**重要状态**：普通 UI 中 Agent 插件类型目前由常量禁用并标注“测试阶段，暂未开放”。后端 A2A、Team 安装和编辑代码存在，但不能将其描述为已正式开放的普通用户功能。

### 4.13 FFmpeg

FFmpeg 用于媒体处理和 3D 导出等任务。系统可以：

- 自动发现系统版或已下载版 FFmpeg/FFprobe；
- 选择自动、下载版、系统版模式；
- 从可用镜像源下载安装；
- 查询状态和下载进度；
- 通过 SSE 接收事件；
- 取消尚未进入安装阶段的下载；
- 在当前工作区创建受路径约束的 FFmpeg 执行实例。

若节点或工具需要 FFmpeg 而当前不可用，服务端会发出 `FFMPEG_REQUIRED`，前端显示安装提示。

### 4.14 MCP 外部接管

MCP 是 DeepSeek Harness 接管运行中 Toonflow 的首选产品级接口。

- 默认关闭；
- 默认首选端口 `10588`；
- 只绑定 `127.0.0.1`；
- 端口冲突时最多向后尝试 31 个端口；
- 使用至少 32 字符 Bearer token；
- 同时支持 Streamable HTTP 与 stdio→HTTP 桥；
- 设置改变会取消旧授权下的进行中调用；
- 外部 Agent 可读取已安装全局 Skill 的 MCP resources。

MCP 的主要工具层：

1. `getAppState`：发现打开的 Toonflow 页面、连接 ID、工作区、画布和能力。
2. UI 控制：`openProject`、`switchPanel`、`getDocument`、`openDocument`、`writeDocument`、`getSettings`、`updateSettings`。
3. 动态 Agent 工具：当前启用的 canvas/workspace/media/web/skill 等工具。
4. `workspaceFiles`：二进制文件管理。
5. `listAppOperations` + `appOperation`：插件、Skill、媒体供应商、全局素材库和 Agent 历史管理。
6. `runAgent`：从外部 Agent 委托 Toonflow 内置 Agent。

安全/一致性约定：

- 多页面时必须使用 `target.connectionId`；
- 画布操作建议同时指定 `directory` 和 `canvasId`；
- 直接文件工具拒绝修改当前在 Toonflow 中打开的画布或文档；
- 文档写入要求携带读取时的 `expectedText`，内容变化则拒绝覆盖；
- 设置密钥返回 `[REDACTED]`，禁止把脱敏占位符整体写回；
- 没有前端连接时，服务端文件/媒体工具仍可使用显式目录，但画布/UI 工具不可用；
- 非桌面服务器目录必须在 `<data>/workspaces` 内。

详细客户端配置和协议约定见 `packages/mcp/README.md`。

### 4.15 Agent Team 与 A2A

代码层已有：

- 安装、读取、编辑、启停和卸载本地 Team；
- 远程 Agent Card 连接；
- A2A 服务开关、token、授权工作区和模型配置；
- `/a2a/:name` 调用已启用团队；
- Team 内成员委派、私有 Skill 和知识文件。

仓库的 `storyboardTeam` 示例由 director 统筹 writer 和 reviewer，三者只被授予读取能力，用于生成和审阅文字分镜。

当前限制：内置 Team 的构建、安装和桌面打包在脚本中被明确注释，市场入口也关闭；A2A 任务状态主要在内存，进程重启会丢失。因此接管者应把这部分视为“已有后端基础但尚未正式恢复的功能线”。

### 4.16 桌面专属能力

桌面宿主提供：

- 原生目录选择；
- 原生文件选择和另存为；
- 系统剪贴板读写；
- 打开系统浏览器；
- 打开 DevTools；
- 读取本地 Provider TS 文件；
- `toonflow://` URL 协议安装插件；
- 原生启动动画；
- Windows/macOS 自动更新；
- Windows WebView2 版本预检；
- Windows 主窗口图标和安装注册修复。

桌面服务使用随机回环端口。页面通知 `/api/desktop/ready` 后才关闭启动动画并显示窗口。冷启动协议请求最多暂存 20 条，页面 ready 后投递。

## 5. 设置中心

| 面板 | 能力 |
| --- | --- |
| 界面设置 | 浅色/深色/跟随系统、主题色、字体缩放、圆角 |
| 常规配置 | 启动动画、画布合成优化、连线动画/颜色、画布快捷键 |
| 文本模型 | 添加、编辑、删除自定义供应商与模型，拉取模型列表 |
| 媒体模型 | 安装/编辑 Provider、API Key、模型能力与更多配置 |
| 插件市场 | 节点、工具、Skill、FFmpeg 管理；Agent 暂未开放 |
| MCP | 开关、状态、端口、token、HTTP/stdio 配置、导出 Toonflow Skill |
| 个性化 | 编辑 Toonflow 指令、本地记忆开关/查看/编辑/删除 |
| 隐私 | 匿名统计开关和匿名 ID |
| 开发者选项 | DevTools、重置首次引导、更新说明、Provider 调试、系统提示词、自定义更新源、手工安装插件、浏览器持久缓存 |
| 关于 | 版本、更新渠道和检查、仓库/社区/赞助信息 |

匿名统计默认开启。UI 声明不收集提示词、内容、路径和密钥；接管者修改统计事件时仍须保持这一边界。

## 6. 数据、文件和持久化

### 6.1 数据目录

典型布局：

```text
data/
  settings.json                 全局设置与插件配置
  nodes/                        已安装节点 UMD
  tools/                        已安装 Agent 工具
  providers/                    已安装媒体供应商
  skills/                       全局 Skill
  agents/                       Agent Team
  assets/                       全局素材库
  ffmpeg/<platform>/            下载的 FFmpeg
  workspaces/<project>/         服务器模式项目
  mcpRuntime<port>.json         MCP stdio 运行信息（开启时）
```

项目内部常见内容：

```text
project/
  画布1.json
  其他画布.json
  *.md
  assets/
    generated/
    chat/
    <nodeId>/
  .agent/
    sessions/*.jsonl
  AGENTS.md                     可选项目级 Agent 指令
```

全局个性化文件不在项目目录内，而是在数据目录保存为 `AGENTS.md` 与 `memories/memory.md`，供全部工作区共享。

### 6.2 不同运行方式的数据位置

- 源码开发、独立 Server：默认仓库根 `data/`，可用 `TOONFLOW_DATA_DIR` 覆盖；
- Docker：`/app/data`，Compose 映射命名卷；
- Windows 桌面：安装根目录下与可更新 `app/` 同级的 `data/`；
- macOS 桌面：`.app` 所在目录旁的 `data/`，不写应用包内部。

### 6.3 设置持久化

Server 只创建一个 `conf` 实例，文件名固定为 `settings.json`，权限模式 `0600`，并监听外部变化。主要包含：

- `settings`；
- `toolConfigs`；
- `nodeConfigs`；
- `remoteConnections`；
- `a2a`。

前端设置在应用挂载前加载，深度变化后全量保存。Pinia 持久化实际写入 `settings.stores`，从而避免桌面随机端口导致 localStorage 不稳定。当前保存队列只协调一个页面，不支持多客户端乐观锁。

### 6.4 工作区安全边界

- API 的目录参数使用绝对路径，文件 `path/target` 使用工作区相对路径；
- 拒绝绝对文件路径、`..`、控制字符、Windows 非法名和保留名；
- 拒绝通过符号链接逃逸；
- 通过 `realpath + relative` 确认目标位于工作区；
- 根目录不能被重命名或删除；
- 写入使用临时文件再 rename，独占创建使用 hard link；
- 文件/目录改名不覆盖已有目标；
- 进程内路径锁避免同进程相互覆盖。

桌面或本地开发只有在 loopback、同源和指定请求头同时成立时，才能操作任意本机绝对目录。服务器部署只能操作 `<data>/workspaces` 下的项目。

## 7. Server API 总览

当前自动生成路由共 100 项；准确清单以 `apps/server/src/router.ts` 为准。按业务域如下：

| 路径族 | 主要操作 |
| --- | --- |
| `/api/agent` | 启动流式 Agent |
| `/api/agent/*` | answer、canvasResult、create、get、list、mentionSource、message、rename、skills |
| `/api/agents/*` | Team/A2A get、save、connect、install、read、setEnabled、uninstall |
| `/api/ai/*` | 文本生成、文本模型列表、媒体模型列表、图片/视频生成 |
| `/api/assets/*` | 全局素材 list、mkdir、read、save、rename、remove |
| `/api/desktop/*` | 剪贴板、DevTools、外链、插件安装、Provider 文件、ready、保存/选择目录、更新 |
| `/api/ffmpeg/*` | status、progress、download、cancel、execute、events |
| `/api/mcp/*` | MCP 状态、Skill 导出、页面控制 state/events/result |
| `/api/nodes/*` | 节点列表、脚本、安装、配置、启停、卸载 |
| `/api/tools/*` | 工具列表、客户端渲染器、安装、配置、启停、卸载 |
| `/api/skills/*` | Skill 列表、文件列表/读写/移动/排序、安装、卸载 |
| `/api/providers/*` | 文本模型探测；媒体 Provider 添加、删除、列表、模型、保存、调试 |
| `/api/plugins/export` | 导出插件 |
| `/api/settings/*` | 设置读写、系统提示词、个性化文档 |
| `/api/workspaces/*` | 工作区 check/list/selectDirectory 和文件 CRUD |
| `/mcp` | MCP Streamable HTTP，不带 `/api` |
| `/a2a` | Agent-to-Agent，不带 `/api` |

路由约定：`routes/` 下一个接口一个文件，文件路径映射 URL，文件内只写 `"/"`。新增、移动、删除路由后运行 `bun run --cwd apps/server routes`，禁止手改生成的 `router.ts`。

JSON API 通常返回：

```ts
{ code: number; data: unknown; message: string }
```

Zod `validateFields` 只负责校验，不会把转换值或默认值写回 `req.body/query/params`。普通异常交统一错误处理中间件；文件不存在、冲突、权限等会映射为相应 HTTP 状态。

## 8. 插件运行与信任模型

### 8.1 Node

- 格式：`<smallCamel>.umd.js`；
- 安装时校验大小、文件名、宿主标记、导出名和 JS 语法；
- 浏览器加载后可访问节点宿主公开的 Vue、Vue Flow、Element Plus 和节点 SDK；
- **不是安全沙箱**：节点脚本会在页面上下文执行。

### 8.2 Tool

- 格式：`<smallCamel>.tool.js`；
- Server 通过动态 import 加载；
- ToolContext 可包含工作区文件、FFmpeg、媒体、画布、提问、Skill 和 SDK；
- **可信服务端代码模型，不是沙箱**，安装恶意工具等同于执行恶意服务端代码。

### 8.3 Provider

- 格式：小驼峰 `.ts`；
- 在有限 VM 上下文运行，禁止动态导入和字符串代码生成；
- 主动暴露 fetch、哈希、图像/音频和 FFmpeg 等所需能力；
- 受限 VM 只是能力约束，不能作为面对恶意代码的强隔离。

### 8.4 Skill

- 文档型指令和引用资源，本身不执行脚本；
- 安装器严格检查压缩包路径和特殊条目；
- Skill 正文仍属于 Agent 指令来源，必须遵循上层用户授权和安全边界。

### 8.5 Team

- 清单声明成员、入口、委派关系、工具、Skill、知识；
- 构建时检查结构、资源引用和委派无环；
- 当前正式分发链路暂停。

## 9. 安全与部署边界

### 9.1 必须知道的事实

- Web 页面和绝大多数 `/api` 没有用户登录鉴权；
- Server 使用开放 CORS；
- 独立 Server 的 `listen(3000)` 没有显式限定回环；
- Compose 默认只映射 `127.0.0.1:3000`；
- MCP 有独立 Bearer token，但它只保护 MCP，不保护 Web/API；
- 工作区/设置/桌面敏感接口依赖 loopback、同源、Host 和自定义头，这是来源边界，不是多用户身份认证；
- 插件下载和 `web_fetch` 可访问 HTTP(S)，没有完整的内网 SSRF 隔离；
- 工具插件拥有服务端代码执行权限；
- FFmpeg 参数包装约束显式路径，但不是操作系统级进程沙箱。

### 9.2 部署要求

1. 不要把 3000 端口直接暴露公网。
2. 远程使用优先 SSH 隧道；或用带身份认证的 HTTPS 反向代理保护整个站点。
3. 在云环境限制出站网络和云元数据地址，降低 SSRF 风险。
4. 只安装可信来源的节点、工具、Provider、Team 和 Skill。
5. 不要运行多个进程写同一个 `data/` 或工作区。
6. 自定义更新源优先 HTTPS；Windows 更新的哈希主要保证下载完整性，不能替代独立签名信任根。
7. API Key、token、真实项目、素材和 `data/` 不得提交 Git。

## 10. 开发与运行

### 10.1 环境

- Git；
- Bun 1.3.14；
- 媒体功能建议安装 FFmpeg，或在应用内下载；
- 桌面构建按平台准备原生工具。

安装：

```sh
bun install
```

### 10.2 Web + Server 开发

```sh
# 首次或修改节点/工具后，同步开发插件
bun run dev:plugins

# 启动 Vite 与业务 Server
bun run dev
```

访问 `http://localhost:5173`。Vite 将 `/api`、`/mcp`、`/a2a` 代理到 `127.0.0.1:3000`。

注意：

- `bun run dev` 不自动构建插件；
- `dev:plugins` 是一次性构建，不是 watcher；
- `dev:web` 只开 Vite，业务功能仍需 Server；
- `dev:server` 只开 Server；
- 不要重复启动并占用 3000。

### 10.3 独立 Server

```sh
bun run build:server
bun run start:server
```

`build:server` 会逐个构建 nodes/tools，再构建 Web 和 Server。访问 `http://127.0.0.1:3000`（实际监听地址须结合主机防火墙理解）。

### 10.4 Docker

```sh
docker compose up -d --build
docker compose logs -f toonflow
```

镜像包含 Bun 和 FFmpeg，以非 root `bun` 用户运行。数据卷挂载到 `/app/data`。不要执行 `docker compose down -v`，除非明确要删除全部持久数据。

### 10.5 桌面开发

```sh
bun run dev:desktop
```

支持：

- Windows x64：需要 WebView2；构建脚本使用 .NET Framework `csc.exe` 编译三个原生辅助程序；制作安装包另需 NSIS。
- macOS arm64：Electrobun 2.0.1。
- macOS x64：独立 Electrobun 1.18.1 兼容层。
- Linux：没有桌面构建，只支持 Web/Server/Docker。

macOS 首次需先构建当前架构启动库：

```sh
bun packages/startup/scripts/buildMac.ts
```

桌面开发使用构建后的 Web，不是 Vite HMR；修改 Web 后需要重新构建/重启桌面验证。

### 10.6 常用构建与检查

| 命令 | 作用 |
| --- | --- |
| `bun run --cwd apps/server routes` | 重新生成服务端路由 |
| `bun run --cwd apps/web typecheck` | Web 类型检查 |
| `bun run --cwd apps/server typecheck` | Server 类型检查 |
| `bun run typecheck` | 全工作区类型检查，桌面需先准备 SDK |
| `bun run --cwd apps/web build` | 构建 Web 到 `build/web` |
| `bun run --cwd apps/server build` | 构建 Server/MCP 并复制 Skill/Provider |
| `bun run build` | 构建工具、Web、Server/MCP，不含节点和桌面 |
| `bun run build:nodes` | 清空并构建所有节点 |
| `bun run build:tools` | 清空并构建所有工具 |
| `bun run build:mcp` | 构建 MCP |
| `bun run build:desktop` | 构建当前平台桌面程序和资源 |
| `bun run package:desktop` | 生成 Windows NSIS 或 macOS DMG |
| `bun run release:desktop` | 执行桌面发布流程 |

仓库规范明确禁止新增任何测试文件或测试框架；验证以已有类型检查、构建和必要手工验证为主，并如实报告未验证的模型、桌面和安装场景。

## 11. 构建与发布产物

- `build/web/`：Web 静态资源；
- `build/server/`：Bun Server bundle；
- `build/nodes/`：节点 UMD；
- `build/tools/`：工具 bundle；
- `build/mcp/`：HTTP 模块、stdio、README、外部 Skill；
- `build/providers/`、`build/skills/`：Server 分发资源；
- `build/desktop/app/`、`build/desktop/artifacts/`：桌面目录和安装产物。

正式 CI 构建 Windows x64、macOS arm64、macOS x64。ARM Mac 支持 Developer ID 签名与 Apple 公证；Intel Mac 使用兼容 SDK。Release 工作流验证版本标签指向构建提交后，将安装包和更新文件发布到 GitHub Release。

独立 `updateServer` 监听 `127.0.0.1:8091`，只提供平铺 ASCII 文件名的 GET/HEAD，禁缓存、不跟随符号链接。发布器最后切换 manifest，但不支持多个发布任务同时写同一发布目录。

## 12. 代码修改规则

接管 Agent 在任何代码修改前必须先阅读根 `AGENTS.md`。核心要求：

1. 先完整追踪真实调用链，再决定最小改动；修根因，不在多个调用方重复打补丁。
2. 优先复用已有 Store、工具和依赖；不做需求外抽象。
3. 默认 TypeScript；自有函数、变量、目录、文件和组件统一小驼峰。
4. 自有 Vue 组件文件、导入绑定、模板标签均用小驼峰；禁止 PascalCase。
5. `.vue` 顶层顺序必须是 template → script → style。
6. 组件 props、动态绑定和具名 v-model 参数使用小驼峰；Vue/HTML 强制语法除外。
7. Server 沿用 Bun + Express；一个接口一个文件；业务工具通过 `utils.ts` 暴露。
8. Server 外部输入用 Zod 与 `validateFields`；不要假设解析结果已回写请求。
9. JSON 响应复用统一格式；写入失败不能吞掉后返回成功。
10. 前端工作区文件统一使用 `useWorkspaceFiles`，不要手拼 `/api/workspaces/files/*`。
11. 跨 `await`、防抖和保存队列必须先固定目录快照，防止切换项目后写错位置。
12. 路由变更运行生成器，禁止手改 `router.ts`。
13. 禁止新增测试文件；只执行与改动相关的类型检查、构建和手工验证。
14. 只实现用户当前明确要求，不顺手扩需求、填占位内容或恢复关闭功能。

## 13. DeepSeek Harness 推荐接管流程

### 13.1 首次进入仓库

1. 读取 `AGENTS.md`。
2. 检查 `git status --short`，保留用户已有改动；当前基线存在未跟踪 `.idea/`，不要纳入提交或删除。
3. 读取根 `package.json` 和目标 workspace 的 `package.json`。
4. 按任务从真实入口追踪调用链：页面 → Store/lib → API route → utils/package → 持久化。
5. 搜索所有调用方和共享类型，不凭文件名猜行为。
6. 只编辑源码；不要把 `build/`、`data/` 或开发同步插件当源文件。
7. 根据影响范围选择验证命令，记录真实结果。

### 13.2 按任务定位

| 需求 | 优先入口 |
| --- | --- |
| 首页/引导/项目列表 | `apps/web/src/pages/hello`、`pages/home`、`stores/workspace.ts` |
| 画布交互 | `apps/web/src/pages/workspace/panels/canvas` |
| 节点公共行为 | `packages/nodeScaffold` |
| 具体节点 | `packages/nodes/<nodeName>` |
| 文档编辑 | `apps/web/src/pages/workspace/panels/document` |
| Agent UI | `apps/web/src/components/agent` |
| Agent 服务端 | `apps/server/src/agent`、`routes/agent*` |
| Agent 工具 | `packages/tools`、`apps/server/src/agent/tools` |
| MCP | `packages/mcp`、`apps/server/src/utils/mcp`、前端 `lib/mcpControl.ts` |
| 工作区文件 | 前端 `lib/workspaceFiles.ts`、服务端 `utils/workspace` |
| 设置 | `stores/settings.ts`、设置 panels、`routes/settings`、`utils/conf` |
| 媒体 Provider | `packages/providers`、`utils/media`、`routes/providers` |
| 插件安装 | `utils/plugins`、插件市场 UI |
| FFmpeg | `packages/ffmpeg`、`apps/server/src/utils/ffmpeg` |
| 桌面原生能力 | `apps/desktop/src`、`apps/server/src/routes/desktop` |
| 安装包/更新 | `apps/desktop/scripts`、`.github/workflows`、`apps/updateServer` |

### 13.3 典型改动检查表

#### 修改 Web

- 检查 props/事件/Store/API 调用；
- 保持 Vue 命名和区块顺序；
- 执行 `bun run --cwd apps/web typecheck`；
- 必要时执行 Web build；
- 真正涉及桌面 WebView 时还需重建桌面，浏览器结果不能替代。

#### 修改 Server API

- 搜索所有前端、MCP 和桌面调用方；
- 一个路由一个文件并校验输入；
- 路由结构变化后运行 routes；
- 执行 Server typecheck/build；
- 涉及文件或配置时使用临时目录做手工 HTTP 验证，避免污染真实 `data/`。

#### 修改节点/工具

- 改 `packages/nodes` 或 `packages/tools` 源码；
- 类型检查对应包；
- 开发验证前运行 `dev:plugins`；
- 注意同名开发产物会覆盖，删除/改名后手工检查残留；
- 不直接编辑 `data/nodes`、`data/tools` 或 `build/*`。

#### 修改持久化

- 明确是全局 `data/settings.json` 还是项目文件；
- 保留原子写、独占创建、不覆盖和错误传播语义；
- 检查目录切换、并发队列、失败回滚和符号链接边界；
- 不把项目列表操作误当磁盘操作。

## 14. 已知限制和技术风险

1. **无全站认证**：只能视为本地/受保护管理应用。
2. **单进程锁**：多实例共享数据目录会破坏并发保证。
3. **插件即代码**：格式校验不等于恶意代码隔离。
4. **潜在 SSRF**：插件下载和网页读取需部署侧网络限制。
5. **设置并发**：全量覆盖且只有页面内队列，没有多客户端 revision。
6. **画布并发**：同页顺序保存，不支持协同编辑。
7. **画布内存**：打开过的画布实例保留以支持后台任务，缺少回收策略。
8. **类型边界不统一**：设置主体仍为 `Record<string, unknown>`；`readJson<T>` 不做运行时 schema 校验。
9. **路由无 workspace 守卫**：直接打开 `/workspace` 可能得到无目录的半可用页面。
10. **文档能力有限**：只面向 Markdown 和 STRING 节点输出，文件树缺少完整文件管理。
11. **Agent Team 未正式开放**：后端代码存在，但构建和 UI 主入口关闭。
12. **更新信任**：自定义 HTTP 更新源有供应链风险；Windows SHA-256 不是独立签名认证。
13. **远程附件限制**：A2A 主要接受文本，不替用户下载远端附件。
14. **运行中状态不持久**：A2A 任务、活跃 Agent、FFmpeg 下载和 MCP 页面连接重启后消失。
15. **没有自动化测试体系**：仓库规范还明确禁止新增测试文件，回归依赖类型检查、构建和手工场景。

## 15. 事实核验入口

接管时优先阅读以下文件，而不是只依赖本文：

- 总脚本与 workspace：`package.json`
- 产品说明：`README.md`
- 强制开发规范：`AGENTS.md`
- 贡献和验证说明：`CONTRIBUTING.md`
- Web 启动：`apps/web/src/main.ts`
- 路由：`apps/web/src/router/index.ts`
- 设置：`apps/web/src/stores/settings.ts`
- 项目状态：`apps/web/src/stores/workspace.ts`
- 工作区：`apps/web/src/pages/workspace/index.vue`
- 画布：`apps/web/src/pages/workspace/panels/canvas/index.vue`
- 文档：`apps/web/src/pages/workspace/panels/document/index.vue`
- Server 装配：`apps/server/src/app.ts`
- API 总表：`apps/server/src/router.ts`
- Agent Runtime：`apps/server/src/agent/runtime/index.ts`
- Agent 系统提示：`apps/server/src/agent/runtime/prompt.ts`
- 文件安全：`apps/server/src/utils/workspace/files.ts`
- MCP 工具：`apps/server/src/utils/mcp/tools.ts`
- MCP 使用说明：`packages/mcp/README.md`
- 插件安装：`apps/server/src/utils/plugins/install.ts`
- 媒体生成：`apps/server/src/utils/media/generation.ts`
- 桌面生命周期：`apps/desktop/src/index.ts`
- 桌面构建：`apps/desktop/scripts/build.ts`
- Docker：`Dockerfile`、`compose.yaml`
- 发布：`.github/workflows/debug.yml`、`.github/workflows/release.yml`

## 16. 接管结论

Toonflow 的核心不是某一个页面，而是“工作区文件 + Vue Flow 画布 + 动态节点 + Agent 工具 + 模型供应商 + MCP”的组合。维护任何一项功能时，都要确认它是否同时存在于用户 UI、内置 Agent 和 MCP 三条调用路径中。

最重要的接管原则是：

- 以当前源码为事实源，区分已开放能力和被关闭的实验能力；
- 保护工作区边界、用户素材和失败时的数据完整性；
- 尊重单进程、本地优先的架构前提，不擅自把它当多租户云服务；
- 插件与模型调用是高信任、高成本边界，不能弱化校验或用户确认；
- 修改共享能力时同步检查 Web、Server、桌面、Agent 和 MCP；
- 用最小且完整的改动解决真实调用链上的根因。
