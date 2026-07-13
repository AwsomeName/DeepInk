# DeepInk — AGENTS.md

> 本文件为 Codex 提供项目上下文，每次会话自动加载。

## 默认协作规则

- **默认启用 `$grill-me`**：每次进行架构方案、实现计划、阶段总结、质量判断或重大技术取舍时，自动执行 `/grilling` 风格审查，不需要用户手动输入 `$grill-me`。
- `/grilling` 风格要求：先给结论，再主动拷问假设、完成度、边界条件、失败路径和下一步最该做什么；不能只报喜。
- 对普通小修、小 bug、明确代码实现任务，保持简洁执行；但最终总结仍要点出残余风险和验证结果。

## 产品定位

**DeepInk — 下一代一站式 AI 桌面服务。**

不是 AI 助手，不是 AI 工具，是 AI 时代的工作入口。用户打开 DeepInk，完成所有事情：

- **写文档、做表格、做 PPT**（AI 驱动文档编辑）
- **跟同事/好友沟通**（AI-Native IM，📋 未开始）
- **浏览网页、自动化操作**（内嵌浏览器 + AI Agent，✅ 已实现）
- **操控手机 App**（内嵌 Android 模拟器 + AI Agent，🔧 技术验证中）
- **跟 AI 协作完成一切**（可插拔 AI 后端：Claude Code / 国内模型 / BYOK）

多端策略：**桌面端（Mac 优先）全功能工作台 + 移动端 APP 轻量版**（侧重 IM + 文档查看 + AI 对话）。

## 设计精神：不是 VSCode，但看起来和用起来像 VSCode

DeepInk 不是 VSCode。不做代码编辑、不做终端、不做 Git。

但 DeepInk 遵循 VSCode 的设计精神。用户一打开应该觉得"这就像 VSCode"：

- **布局**：Activity Bar + 侧栏 + 主工作区 + 右侧面板（Agent + IM 统一消息流）
- **设置页**：VSCode 风格的 Settings UI（搜索、分组、Toggle、下拉、JSON 编辑模式切换）
- **Command Palette**：`Cmd+Shift+P` 快速命令
- **Status Bar**：底部状态栏显示当前状态
- **键盘优先**：所有操作都有快捷键，可自定义
- **面板可拖拽**：侧栏、Agent+IM 面板可拖拽调整宽度，可折叠
- **主题系统**：深色/浅色主题
- **Tab 管理**：多 Tab、Tab 分组、拖拽排序

## 布局

```
┌──┬──────────┬─────────────────────┬──────────────────┬─┐
│  │          │                     │                  │  │
│  │  文件    │                     │  🤖 AI 对话      │  │
│A │  联系人  │   主工作区           │  💬 好友消息     │S │
│c │  消息列表│   (编辑器/浏览器 Tab) │  🤝 Agent 通知   │t │
│t │  (侧栏)  │                     │  📎 工作分享     │a │
│i │          │                     │                  │t │
│v │ ~250px   │     flex: 1         │    ~350px        │u │
│i │          │                     │                  │s │
│t │          │                     │                  │B │
│y │          │                     │                  │a │
│  │          │                     │                  │r │
│B │          │                     │                  │  │
│a │          │                     │                  │  │
│r │          │                     │                  │  │
├──┴──────────┴─────────────────────┴──────────────────┴─┤
│                    Status Bar                           │
└────────────────────────────────────────────────────────┘
```

- **Activity Bar**（左侧 ~48px）：图标导航（文件、搜索、浏览器、消息、设置等）
- **侧栏**（~250px）：对应 Activity Bar 选中项的面板内容（文件浏览器、联系人列表、消息列表等）
- **主工作区**（flex:1）：编辑器 / 浏览器 Tab
- **右侧面板**（~350px）：Agent 对话 + IM 消息统一面板
  - 🤖 Agent 对话（跟自己的 AI 聊）
  - 💬 好友消息（跟人聊，腾讯 TIM SDK）
  - 🤝 好友 Agent 消息（跟别人的 AI 聊）
  - 📎 工作成果分享（AI 完成的文档/任务 → 一键发给好友）
  - 🔔 Agent 工作通知（AI 做完了、出错了、需要确认）
- **Status Bar**（底部 ~22px）：当前状态信息

### Agent 面板双形态

Agent 面板根据工作状态在两种布局间切换：

| 状态 | Agent 角色 | 默认布局 |
|------|------------|----------|
| 空工作台 / 无工作 Tab | 工作入口 | 居中大面板 |
| 浏览器 / 文档 / Android / 预览已打开 | 协作侧栏 | 右侧固定面板，压缩主工作区 |

规则：

- 默认启动或没有工作 Tab 时，Agent 面板居中显示，承接“想做什么”的第一条指令。
- 打开浏览器、Markdown 文档、Android、预览或设置后，Agent 自动切为右侧面板，主工作区被压缩而不是被遮挡。
- Agent 默认跟随 active tab 作为上下文；多上下文协作通过显式添加 context chips 完成。
- 用户手动拖拽宽度、隐藏面板、切换布局后，系统不再自动介入；只有“重置布局”恢复系统自动规则。
- Android 不做特殊布局处理，它和浏览器、文档一样都是 workbench tab。

## 技术栈

### 已在用的

| 层级 | 技术 | 说明 |
|------|------|------|
| 桌面框架 | Electron ^35.7 | 基于 Chromium + Node.js |
| 前端 | React ^19 + TypeScript ^5.9 | 严格模式 |
| 构建 | electron-vite ^5 | Vite ^6 驱动 |
| 包管理 | pnpm | 单 root package |
| 状态管理 | Zustand ^5 | 19 个 store |
| 浏览器自动化 | Playwright ^1.52 | 内嵌 CDP 模式，46 个 MCP 工具 |
| Android 自动化 | @yume-chan/adb + scrcpy + ADB | 内嵌 Android 模拟器（技术验证中），15 个工具 |
| 文档编辑 | Tiptap (ProseMirror) ^3 | Markdown 编辑器（所见即所得） |
| 格式转换 | markdown-it + highlight.js + juice | 微信公众号 HTML |
| MCP 工具 | @modelcontextprotocol/sdk ^1.29 | 模块化工具注册（browser/editor/android） |
| Schema | Zod ^4 | 参数校验 |
| 认证后端 | jsonwebtoken + UniSMS | 腾讯云 CloudBase + NoSQL |
| 样式 | 纯 CSS（CSS 变量 + 组件样式） | 暗色主题 |

### 规划中的

| 模块 | 技术 | 用途 |
|------|------|------|
| 即时通讯 | 腾讯 IM SDK（TIM） | 好友消息、群聊、Agent 消息转发（📋 未开始） |
| 文档渲染 | PDF.js、SheetJS 等 | 多格式预览 docx/xlsx/pptx/pdf（📋 未开始） |
| 移动端 | 待定（React Native / Flutter） | 配套 APP（📋 未开始） |
| 云存储 | 自建 + 用户自有云盘接入 | 文件存储扩展（📋 未开始，与 WebDAV 同步不同） |

## 项目结构

```
deepink/
├── AGENTS.md                  # 本文件
├── README.md
├── docs/                      # 项目文档
│   ├── architecture.md        # 架构设计
│   ├── development.md         # 开发指南
│   └── features/              # 功能规格
│       ├── agent-system.md    # Agent 系统
│       ├── browser-automation.md  # 浏览器自动化
│       ├── subscription.md   # 订阅系统（免费 + Pro）
│       ├── im-system.md       # 即时通讯（规划）
│       └── document-editor.md # 文档编辑器（规划）
├── src/
│   ├── main/                  # Electron 主进程
│   │   ├── index.ts           # 入口：窗口、CDP、Playwright、MCP、Auth 初始化
│   │   ├── agent/             # Agent 桥接（可插拔后端：Codex CLI / HTTP API）
│   │   │   └── backend/       # 后端实现（Codex、http-api、工厂）
│   │   ├── auth/              # 认证（手机验证码、JWT、Token 加密）
│   │   ├── subscription/     # 订阅系统（套餐管理、微信支付、Apple IAP）
│   │   ├── browser/           # 内嵌浏览器（WebContentsView + 缩放 + 设备模式）
│   │   ├── cdp/               # CDP 端口发现
│   │   ├── ipc/               # IPC 处理器（browser、agent、auth、editor、android）
│   │   ├── settings/          # 设置持久化（SettingsService + IPC + 类型定义）
│   │   ├── mcp/               # MCP 工具系统（模块化注册、权限管理、外部服务器）
│   │   │   └── modules/       # 工具模块（browser 46 / editor 5 / android 15）
│   │   ├── playwright/        # Playwright 集成（CDP 连接、46 种操作、能力验证）
│   │   ├── sync/              # ✅ 云同步（WebDAV + 凭证加密存储）
│   │   ├── subscription/      # ✅ 订阅系统（套餐管理 + 支付）
│   │   ├── fs/                # ✅ 文件系统服务（Home 目录浏览 + 读写）
│   │   ├── android/           # 🔧 内嵌 Android 模拟器（ADB + scrcpy + 模拟器管理）
│   │   ├── im/                # 📋 即时通讯（未开始：TIM SDK 集成）
│   │   ├── memory/            # 📋 独立 AI 记忆系统（未开始）
│   │   └── storage/           # 📋 云文件存储扩展（未开始）
│   ├── preload/               # Preload 脚本
│   │   ├── index.ts           # contextBridge API（browser、auth、agent、settings、sync 等）
│   │   └── index.d.ts         # TypeScript 类型声明
│   └── renderer/              # 渲染进程（React UI）
│       └── src/
│           ├── App.tsx         # 认证守卫 + 主布局
│           ├── assets/         # 样式（VSCode 暗色主题）
│           ├── types/          # 类型定义
│           ├── stores/         # Zustand stores（共 19 个，见 architecture.md）
│           ├── components/     # 组件
│           │   ├── activity-bar/   # 左侧图标栏
│           │   ├── sidebar/        # 侧栏面板
│           │   ├── workbench/      # 主工作区（浏览器工具栏 + 内容）
│           │   ├── agent-panel/    # Agent 对话面板
│           │   ├── im-panel/       # IM 消息面板（规划）
│           │   ├── editor/         # 文档编辑器（规划）
│           │   ├── settings/       # 设置页（规划）
│           │   ├── login/          # 登录页
│           │   ├── loading/        # 启动画面
│           │   ├── status-bar/     # 底部状态栏
│           │   └── common/         # 通用组件（Icons、ResizeHandle）
│           └── layouts/           # 布局组件
├── backend/                   # 🔒 旧认证后端（私有仓库：private-serv）
├── cloud/                     # 🔒 认证后端（私有仓库：private-serv）
├── electron-builder.yml       # 打包配置
├── electron.vite.config.ts    # 构建配置
├── package.json
└── pnpm-workspace.yaml
```

## 核心架构

### 1. 内嵌浏览器 ✅ 已实现

Electron 窗口内嵌入 Chrome，用户直接看到浏览器操作过程：

- `WebContentsView`（Electron 30+ API）
- Playwright 通过 CDP 连接内嵌 Chromium
- 46 个 MCP 工具：导航、交互、截图提取、文件上传/下载、Cookie、网络拦截/mock、iframe、多 Tab、坐标鼠标、对话框等
- 智能缩放（适应宽度）、移动设备模式
- 反指纹检测（清理 UA、屏蔽自动化标记）

### 2. Agent 系统 ✅ 已实现

AI Agent 驱动一切操作：

- **可插拔后端**：Codex CLI + 国内模型 API + HTTP API（OpenAI 兼容）
- **多提供商支持**：Anthropic / DeepSeek / 智谱 GLM / 通义千问 / Moonshot / 硅基流动 / OpenAI / 自定义
- **双 API 格式**：
  - Anthropic 格式 → Codex CLI + 环境变量注入（`ANTHROPIC_BASE_URL` + `ANTHROPIC_API_KEY`）
  - OpenAI 格式 → HTTP POST + SSE 流式（`HttpApiBackend`）
- **设置热重载**：切换提供商/API 格式/密钥后自动重建后端，无需重启
- MCP 工具系统：模块化注册，3 个模块共 66 个工具（browser 46 + editor 5 + android 15）
- 权限管理：3 模式（自动/分类/严格），操作确认卡片
- 流式对话：NDJSON 事件解析，支持 thinking/text/tool_use/tool_result
- 外部 MCP 服务器配置（stdio/http/sse）

### 3. 文档编辑器 ✅ 已实现（基础）

AI 驱动的 Markdown 文档编辑：

- **Tiptap (ProseMirror)** 富文本编辑（StarterKit/Markdown/CodeBlock/图片/任务列表/表格/链接）
- **Agent ↔ 编辑器双向通信**：5 个 MCP 工具（write/append/insert/read/save）
- **微信公众号格式转换**：Markdown → 全内联样式 HTML
- 编辑器作为主工作区的 Tab，与浏览器 Tab 并列
- 📋 后续：AI 续写/改写/翻译、docx/xlsx/pptx/pdf 多格式预览
- 详见 `docs/features/document-editor.md`

### 4. 内嵌 Android 模拟器 🔧 技术验证中

与浏览器支柱对称的移动自动化能力，AI 操控手机 App：

- **模拟器全生命周期**：一键安装 SDK/系统镜像、创建/启停 AVD（跨平台，Apple Silicon 原生虚拟化）
- **ADB 桥接**（@yume-chan/adb，对标 playwright-bridge）
- **scrcpy 投屏**：H.264 推流 + WebCodecs 硬解 + 触摸回注
- **15 个 MCP 工具**：tap/swipe/screenshot/dump_ui/launch_package/install_apk/shell 等
- 详见 `docs/features/android-mirror.md`、`docs/features/cloud-phone.md`

### 5. 即时通讯 📋 未开始

AI-Native IM 即时通讯：

- **腾讯 TIM SDK**：消息路由、存储、推送、离线同步由腾讯托管
- 消息类型：文本、文件、**AI 工作成果**（自定义消息）、Agent 通知
- 核心场景：用户聊天 / 给好友的 AI Agent 发任务 / Agent 间协作
- 详见 `docs/features/im-system.md`

### 6. 独立 AI 记忆系统 📋 未开始

DeepInk 有自己的记忆系统，不依赖任何 AI 服务的记忆：

- **长期记忆**：用户偏好、工作习惯、常用联系人、常用工具
- **对话历史**：所有 Agent 对话的持久化存储和检索
- **上下文管理**：跨会话的上下文衔接，让 AI "记得"之前做过什么
- **记忆权限**：用户可以查看、编辑、删除 AI 对自己的记忆

### 7. 云文件存储 📋 未开始

- **DeepInk 云盘**：付费功能，文件云端同步
- **用户自有云盘接入**：支持接入用户的网盘（百度网盘、阿里云盘等）
- 文件在设备间同步，移动端可查看/编辑
- （当前已实现 WebDAV 云同步，见 `sync/`；本节指更深层的存储抽象）

### 8. Agent 在环（Human-in-the-loop）

Agent 的所有操作都必须在用户的许可和监视下进行：
- 操作前需用户确认（权限系统 3 模式）
- 操作过程可视化（浏览器/Android 动作实时展示）
- 用户可随时中断

## 开发规范

- **语言**: TypeScript，严格模式 (`"strict": true`)
- **命名**: 文件名 kebab-case，组件 PascalCase，函数/变量 camelCase
- **注释**: 代码注释使用中文，public API 文档使用中英双语
- **提交**: Conventional Commits（中文描述）
- **分支**: `main` 为稳定分支，功能开发用 `feat/xxx` 分支

## 常用命令

```bash
pnpm install          # 安装依赖
pnpm dev              # 启动开发模式（热重载）
pnpm build            # 构建
pnpm test             # 运行测试（待建）
pnpm lint             # 代码检查（待建）
pnpm package          # 打包 Mac 应用 (.dmg)
pnpm package:dev      # 打包开发版
```

## 注意事项

- **Mac 优先**，但架构需为跨平台预留接口
- **Electron 安全**：禁用 `nodeIntegration`，启用 `contextIsolation`
- **所有文件读写通过 IPC 经主进程完成**
- **Agent 后端可插拔**：Claude Code 只是其中一种，支持国内模型和 BYOK
- **IM 走腾讯 TIM SDK**，不自建即时通讯基础设施
- **AI 记忆独立管理**，不依赖任何外部 AI 服务的记忆系统
- **云存储付费**或用户接入自有云盘
- **UI 遵循 VSCode 设计精神**：设置页、Command Palette、Activity Bar、Status Bar、键盘优先、主题
