# 开发指南

## 产品定位

**DeepInk — 下一代一站式 AI 桌面服务。**

用户打开 DeepInk 完成所有事情：写文档、跟同事沟通、浏览网页、跟 AI 协作（可插拔 Agent 后端）。

多端策略：桌面端（Mac 优先）全功能 + 移动端 APP 轻量版（IM + 文档查看 + AI 对话）。

## 环境准备

### 系统要求

- macOS 13+ (Ventura 及以上)
- Node.js 20+
- pnpm 9+

### 安装

```bash
git clone <repo-url> deepink
cd deepink
pnpm install
pnpm dev
```

## 项目结构

```
deepink/
├── src/
│   ├── main/                    # Electron 主进程
│   │   ├── index.ts             # 入口（初始化 13 个子系统）
│   │   ├── browser/             # WebContentsView + 缩放 + 设备模式
│   │   ├── cdp/                 # CDP 端口发现
│   │   ├── playwright/          # Playwright CDP 桥接 + 46 种操作
│   │   ├── agent/               # Agent 桥接（Claude Code CLI 子进程）
│   │   │   └── backend/         # 可插拔后端（Phase 3E 新增）
│   │   ├── mcp/                 # MCP 工具系统（模块化 + 权限）
│   │   │   └── modules/         # 工具模块（browser 46 / editor 5 / android 15）
│   │   ├── auth/                # 认证（手机验证码 + JWT）
│   │   ├── fs/                  # 文件系统 IPC（Phase 3B 新增）
│   │   ├── ipc/                 # IPC 处理器（browser / agent / auth / fs）
│   │   ├── im/                  # 即时通讯（Phase 4：TIM SDK）
│   │   ├── editor/              # 文档编辑器服务（Phase 5）
│   │   ├── memory/              # 独立 AI 记忆系统（Phase 6）
│   │   └── storage/             # 云文件存储（Phase 7）
│   ├── preload/
│   │   ├── index.ts             # contextBridge API（browser + auth + agent + fs + ...）
│   │   └── index.d.ts           # TypeScript 类型声明
│   └── renderer/
│       └── src/
│           ├── App.tsx           # 认证守卫 + 主布局 + 全局快捷键
│           ├── types/            # 全局类型
│           ├── stores/           # Zustand stores
│           ├── components/       # 组件
│           │   ├── activity-bar/     # 左侧图标栏
│           │   ├── sidebar/          # 侧栏面板（FileTree / Search / Contacts）
│           │   ├── workbench/        # 主工作区（多 Tab + 浏览器 + 编辑器 + 设置）
│           │   ├── agent-panel/      # Agent 对话面板
│           │   ├── im-panel/         # IM 消息面板（Phase 4）
│           │   ├── editor/           # 文档编辑器（Phase 5）
│           │   ├── settings/         # 设置页（Phase 3C）
│           │   ├── command-palette/  # 命令面板（Phase 3D）
│           │   ├── login/            # 登录页
│           │   ├── loading/          # 启动画面
│           │   ├── status-bar/       # 底部状态栏
│           │   └── common/           # 通用组件（Icons、ResizeHandle）
│           └── assets/           # 样式（VSCode 暗色/亮色主题）
├── backend/                     # 认证后端（腾讯云 SCF + MySQL）
├── cloud/                       # 认证后端（腾讯云 CloudBase + NoSQL）
├── docs/                        # 文档
├── electron.vite.config.ts      # 构建配置
├── electron-builder.yml         # 打包配置
└── dev.sh                       # 一键开发脚本
```

## 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 桌面框架 | Electron ^35 | Chromium + Node.js |
| 前端 | React ^19 + TypeScript ^5.9 | 严格模式 |
| 构建 | electron-vite ^5 | Vite ^6 驱动 |
| 状态管理 | Zustand ^5 | 按业务域拆分 Store |
| 浏览器自动化 | Playwright ^1.52 | 内嵌 CDP 模式 |
| MCP | @modelcontextprotocol/sdk ^1.29 | 模块化工具注册 |
| Schema | Zod ^4 | 参数校验 |
| 样式 | 纯 CSS | CSS 变量 + 组件样式，暗色/亮色主题 |
| 认证后端 | mysql2 + jsonwebtoken + UniSMS | 腾讯云 SCF |

## 开发规范

### 代码风格

- TypeScript strict mode
- 命名：文件夹 `kebab-case`，组件 `PascalCase.tsx`，函数 `camelCase.ts`
- 注释：中文
- 代码注释使用中文，public API 文档使用中英双语

### Git 规范

```bash
# 分支命名
feat/im-integration       # 新功能
fix/agent-streaming       # Bug 修复
docs/architecture         # 文档

# Commit 格式 (Conventional Commits, 中文描述)
feat: 集成腾讯 TIM SDK
fix: 修复 Agent 流式消息解析
docs: 更新架构设计文档
```

### IPC 通信规范

```typescript
// 命名规范: domain:action
'browser:navigate'
'agent:send'
'agent:approve'
'fs:readDir'
'fs:readFile'
'im:sendMessage'
'editor:openFile'
'memory:save'

// 使用 invoke/handle 模式（Promise-based）
// 主→渲染推流：mainWindow.webContents.send('agent:stream', data)
```

### Store 规范

```typescript
// Zustand Store 统一模式
interface XState {
  // 状态字段
  field: Type

  // --- Actions ---
  setField: (value: Type) => void
}

const useXStore = create<XState>((set) => ({
  field: defaultValue,

  setField: (value) => set({ field: value }),
}))
```

### 组件规范

- 命名函数导出（`export function ComponentName()`）
- 从 Store 读取状态用 `useStore((s) => s.field)` 选择器
- 样式写在 `assets/main.css`（CSS 变量，不使用 CSS Modules 或 CSS-in-JS）
- 图标使用 `components/common/Icons.tsx` 的 SVG 组件

### MCP 工具模块规范

```typescript
// ToolModule 接口（定义在 src/main/mcp/types.ts）
interface ToolModule {
  name: string                    // 模块名，如 'browser'、'im'
  tools: ToolDefinition[]         // 工具 Schema 数组
  execute(toolName: string, params: Record<string, unknown>): Promise<unknown>
}

// 新模块示例
class MyToolModule implements ToolModule {
  name = 'my-module'
  tools: ToolDefinition[] = [...]
  async execute(toolName: string, params: Record<string, unknown>) { ... }
}

// 注册（在 main/index.ts）
toolHost.registerModule(new MyToolModule(dependencies))
```

## 开发路线图

### Phase 1 — 脚手架 + 内嵌浏览器 ✅ 已完成

- [x] 项目脚手架（electron-vite + React + TypeScript）
- [x] VSCode 风格布局骨架
- [x] **WebContentsView 嵌入主窗口**
- [x] **Playwright CDP 桥接**（46 种操作）
- [x] 浏览器工具栏 UI
- [x] IPC 通信框架
- [x] Zustand 状态管理
- [x] 打包配置

### Phase 2 — Agent + 认证 ✅ 已完成

- [x] **AgentBridge：Claude Code CLI 子进程管理**
  - `spawn('claude', ['--output-format', 'stream-json'])`
  - `--resume` 会话延续，`--mcp-config` 工具注入
  - NDJSON 流式事件解析
- [x] **MCP 工具系统**
  - McpToolHost：HTTP 服务器 + 模块化工具注册
  - BrowserToolModule：46 个浏览器工具
  - 权限管理（3 模式 + 确认流程）
  - 外部 MCP 服务器配置
- [x] **Agent Panel UI**
  - 流式消息渲染（text/thinking/tool_use/tool_result）
  - 工具确认卡片（Approve/Always Allow/Reject）
  - 费用追踪、会话管理、中止功能
- [ ] Agent 面板双形态布局
  - 空工作台默认居中，作为 AI 工作入口
  - 浏览器 / 文档 / Android / 预览打开后切到右侧协作面板，压缩主工作区
  - Agent 默认跟随 active tab 上下文，多上下文通过显式添加
  - 用户手动拖拽、隐藏、切换布局后不再自动介入，直到重置布局
- [x] **认证系统**
  - 登录页（手机号验证码）
  - 手机短信验证（UniSMS）
  - JWT Token 加密存储（safeStorage/Keychain）
  - 后端服务（SCF + MySQL / CloudBase + NoSQL）
- [x] SVG 图标库（~30 个）
- [x] 面板拖拽调整 + 折叠
- [x] 浏览器智能缩放 + 移动设备模式

---

### Phase 3 — 应用骨架加固 🔴 当前阶段

**目标**：把可用的原型变成真正的应用。补上测试和 Lint、替换假数据、实现多 Tab、设置页、命令面板、可插拔 AI 后端、主题切换。

**前置依赖**：Phase 1-2 完成。

#### 3A: 基础设施

**ESLint + Prettier：**

- [ ] 完善 `eslint.config.js`（已安装 eslint ^9.39，需添加 TypeScript + React 插件配置）
- [ ] 新建 `.prettierrc.yaml` + `.prettierignore`
- [ ] 修改 `package.json` — 添加 devDependencies（prettier, eslint-plugin-react 等），添加 `format` script

**Vitest 测试框架：**

- [ ] 完善 `vitest.config.ts`（已安装 vitest ^3.2，已有基础配置，需添加 jsdom 环境和路径别名）
- [ ] 新建 `src/main/__tests__/permission.test.ts` — 测试权限管理 3 模式 + 超时 + always-allow
- [ ] 新建 `src/main/mcp/modules/browser/__tests__/tool-mapping.test.ts` — 测试工具名映射
- [ ] 新建 `src/main/__tests__/mcp-client-manager.test.ts` — 测试 MCP 服务器配置管理
- [ ] 新建 `src/renderer/src/stores/__tests__/ui-store.test.ts` — 测试面板切换逻辑
- [ ] 新建 `src/renderer/src/stores/__tests__/agent-store.test.ts` — 测试流式消息生命周期
- [ ] 修改 `package.json` — 添加 devDependencies（@testing-library/react, jsdom）

**Debug 代码清理：**

- [ ] 修改 `src/main/index.ts` — 删除 DPI 诊断代码块（`console.log('[DPI 诊断]')`、`executeJavaScript` 查询），保留正常的 operational logs
- [ ] 修改 `src/renderer/src/components/workbench/Workbench.tsx` — 删除 DPI 诊断 `console.log`

#### 3B: 多 Tab + 文件系统 IPC

**文件系统 IPC：**

- [ ] 新建 `src/main/fs/file-service.ts` — 文件操作服务（readDir, readFile, writeFile, stat, mkdir, rename, delete），含路径安全校验（防止目录穿越）
- [ ] 新建 `src/main/fs/fs-ipc.ts` — `registerFsIpc()` 注册 `fs:readDir` / `fs:readFile` / `fs:writeFile` / `fs:stat` / `fs:watch` 等 IPC 处理器
- [ ] 修改 `src/main/index.ts` — 调用 `registerFsIpc()`
- [ ] 修改 `src/preload/index.ts` — 添加 `deepink.fs` 命名空间（readDir, readFile, writeFile, stat, watch）
- [ ] 修改 `src/preload/index.d.ts` — 添加 `FsAPI` 接口

**多 Tab 管理：**

- [ ] 新建 `src/renderer/src/stores/tab-store.ts` — 统一 Tab 状态：`Tab[]`（类型 browser/editor/preview/settings）、活跃 Tab、Tab 分组。Actions: openTab, closeTab, activateTab, moveTab
- [ ] 修改 `src/renderer/src/types/index.ts` — 扩展 `TabType` 为 `'browser' | 'editor' | 'preview' | 'settings'`，添加 `filePath` 字段
- [ ] 修改 `src/renderer/src/stores/browser-store.ts` — 移除 tabs/activeTabId/addTab/closeTab/setActiveTabId（迁移到 tab-store），保留浏览器专属状态（URL、zoom、viewMode）
- [ ] 修改 `src/renderer/src/stores/index.ts` — 导出 `useTabStore`
- [ ] 修改 `src/renderer/src/components/workbench/Workbench.tsx` — Tab 栏从 tab-store 读取，按 `tab.type` 渲染不同内容（browser 渲染浏览器工具栏 + WebContentsView，editor/preview 渲染占位符，settings 渲染设置页）

#### 3C: 侧栏 + 状态栏 + 设置页

**侧栏真实数据：**

- [ ] 新建 `src/renderer/src/stores/fs-store.ts` — 文件系统状态：workspacePath, directoryTree, loading。Actions: setWorkspace, refreshTree, expandDir
- [ ] 新建 `src/renderer/src/components/sidebar/FileTree.tsx` — 虚拟化文件树组件，从 fs-store 读取目录树。单击文件 → 打开编辑器 Tab，单击文件夹 → 展开/折叠
- [ ] 新建 `src/renderer/src/components/sidebar/SearchPanel.tsx` — 文件搜索面板，通过文件系统 IPC 搜索文件名和内容
- [ ] 修改 `src/renderer/src/components/sidebar/Sidebar.tsx` — 删除全部 `PANEL_CONFIG` 假数据，替换为 `<FileTree />`（文件面板）和 `<SearchPanel />`（搜索面板）
- [ ] 修改 `src/renderer/src/stores/ui-store.ts` — 添加 `workspacePath` + `setWorkspacePath`

**动态 StatusBar：**

- [ ] 修改 `src/renderer/src/components/status-bar/StatusBar.tsx` — 替换硬编码项为真实数据：Agent 连接状态从 `agent-store.backendState`，活跃 Tab 信息从 `tab-store`，版本号通过 IPC 读取

**设置页：**

- [ ] 新建 `src/renderer/src/components/settings/SettingsPage.tsx` — 主设置容器，侧栏导航（外观 / Agent / 浏览器 / 快捷键 / 关于）
- [ ] 新建 `src/renderer/src/components/settings/AppearanceSettings.tsx` — 主题切换（dark/light/system）、字体大小
- [ ] 新建 `src/renderer/src/components/settings/AgentSettings.tsx` — 权限模式选择、预算上限、后端选择
- [ ] 新建 `src/renderer/src/components/settings/ShortcutsSettings.tsx` — 快捷键列表 + 重绑定 UI
- [ ] 新建 `src/renderer/src/components/settings/Settings.css` — VSCode 风格设置页样式
- [ ] 修改 `src/renderer/src/components/workbench/Workbench.tsx` — 处理 `tab.type === 'settings'` 渲染 `<SettingsPage />`

#### 3D: Command Palette + 快捷键

**命令注册中心：**

- [ ] 新建 `src/renderer/src/stores/command-store.ts` — 命令注册表：`{ id, label, shortcut, action }[]`，最近使用，palette 开关状态

**Command Palette UI：**

- [ ] 新建 `src/renderer/src/components/command-palette/CommandPalette.tsx` — 模态覆盖层：模糊搜索输入框、过滤命令列表、键盘导航（↑↓ 选择、Enter 执行、Escape 关闭）
- [ ] 新建 `src/renderer/src/components/command-palette/CommandPalette.css` — 覆盖层 + 下拉样式
- [ ] 修改 `src/renderer/src/App.tsx` — 添加全局 `keydown` 监听（`Cmd+Shift+P`），渲染 `<CommandPalette />`

**注册核心命令：**

| 命令 ID | 快捷键 | 功能 |
|---------|--------|------|
| `workbench.commandPalette` | `Cmd+Shift+P` | 打开命令面板 |
| `workbench.toggleSidebar` | `Cmd+B` | 切换侧栏 |
| `workbench.toggleAgentPanel` | `Cmd+J` | 切换右侧面板 |
| `workbench.newTab` | `Cmd+T` | 新建 Tab |
| `workbench.closeTab` | `Cmd+W` | 关闭当前 Tab |
| `settings.open` | `Cmd+,` | 打开设置 |
| `browser.navigate` | `Cmd+L` | 聚焦地址栏 |
| `browser.zoomIn` | `Cmd+=` | 放大 |
| `browser.zoomOut` | `Cmd+-` | 缩小 |
| `browser.toggleDeviceMode` | — | 切换设备模式 |
| `agent.resetSession` | — | 重置 Agent 会话 |
| `sidebar.focusFiles` | `Cmd+Shift+E` | 聚焦文件面板 |
| `sidebar.focusSearch` | `Cmd+Shift+F` | 聚焦搜索面板 |

- [ ] 修改 `src/renderer/src/components/workbench/Workbench.tsx` — 接入 `Cmd+T`、`Cmd+W`、`Cmd+L`
- [ ] 修改 `src/renderer/src/App.tsx` — 接入 `Cmd+B`、`Cmd+J`、`Cmd+Shift+P`、`Cmd+,`

#### 3D-1: Agent 面板双形态布局

**目标**：Agent 面板根据工作状态在“居中入口”和“右侧协作面板”之间切换。空工作台时 Agent 是主入口；进入浏览器、文档、Android、预览等工作状态后，Agent 成为右侧协作者。

**状态模型：**

```typescript
type AgentPanelMode = 'center' | 'right' | 'hidden'
type AgentPanelModeSource = 'system' | 'user'
type WorkContext = 'empty' | 'browser' | 'editor' | 'android' | 'preview' | 'settings'

interface AgentLayoutState {
  mode: AgentPanelMode
  source: AgentPanelModeSource
  width: number
}
```

**自动布局规则：**

| 条件 | 行为 |
|------|------|
| `source === 'user'` | 保持用户选择，不自动切换 |
| `source === 'system'` 且无工作 Tab | `mode = 'center'` |
| `source === 'system'` 且 active tab 是 browser/editor/android/preview/settings | `mode = 'right'` |

**上下文策略：**

- 第一阶段 Agent 只默认绑定 `activeTab`，不自动读取其他 Tab。
- `browser` 上下文包含当前 URL、标题、可见内容和浏览器工具。
- `editor` 上下文包含当前文件路径、Markdown 内容和编辑器工具。
- `android` 上下文包含当前设备、Activity、截图/UI 树和 Android 工具。
- 后续通过 context chips 显式添加多上下文，例如 `[当前: 简历.md] [+ 添加上下文]`。

**实现拆解：**

- [ ] 修改 `src/renderer/src/stores/ui-store.ts` — 扩展 `agentPanelMode`, `agentPanelModeSource`, `setAgentPanelMode()`, `resetAgentLayout()`
- [ ] 修改 `src/renderer/src/stores/ui-store.test.ts` — 覆盖 system/user 两种 source 的自动切换与手动锁定
- [ ] 修改 `src/renderer/src/App.tsx` — 根据 active tab 推导 `WorkContext`，仅在 `source === 'system'` 时自动切换布局
- [ ] 修改 `src/renderer/src/App.tsx` — Agent `right` 模式沿用现有右侧面板和 resize；`center` 模式作为主区域居中面板渲染
- [ ] 修改 `src/renderer/src/components/agent-panel/AgentPanel.tsx` — 支持 `variant="center" | "side"`，复用同一套对话、工具确认、输入框逻辑
- [ ] 修改 `src/renderer/src/components/workbench/Workbench.tsx` — 空工作台/无 Tab 时不再显示占位页，交给居中 Agent 作为入口
- [ ] 修改 `src/renderer/src/assets/main.css` — 增加 `.agent-panel-center-shell`、`.agent-panel-side` 等布局样式；保留右侧宽度拖拽逻辑
- [ ] 修改命令注册 — `Cmd+J` 在 right/hidden 间切换，新增“专注对话”命令切到 center

**验收标准：**

- 无 Tab 启动时，Agent 面板居中显示，工作区不出现重复占位内容。
- 打开浏览器、文档或 Android 后，Agent 自动切到右侧并压缩主工作区。
- 用户手动隐藏、切到居中或拖拽宽度后，切换 Tab 不再改变 Agent 布局。
- 重置布局后恢复系统自动规则。
- Agent 对话内容、工具确认卡片、流式输出在 center/side 两种形态下复用同一数据源，不分叉。

#### 3E: 可插拔 AI 后端

**后端接口抽象：**

- [ ] 新建 `src/main/agent/backend/types.ts` — `IAgentBackend` 接口：`start()`, `sendMessage(msg)`, `abort()`, `resetSession()`, `getStatus()`, `destroy()`, `onEvent(callback)`。定义 `AgentEvent` 联合类型（stream, complete, error, system）
- [ ] 新建 `src/main/agent/backend/claude-code-backend.ts` — 从 `AgentBridge` 提取 CLI 逻辑，实现 `IAgentBackend`：spawn、NDJSON 解析、会话管理、MCP 配置组装
- [ ] 新建 `src/main/agent/backend/http-api-backend.ts` — 占位骨架（用于国内模型 API），实现 `IAgentBackend` 接口，方法暂抛 "not implemented"
- [ ] 新建 `src/main/agent/backend/backend-factory.ts` — 工厂函数：根据 `{ type: 'claude-code' | 'http-api', ... }` 返回对应后端实例

**接入现有系统：**

- [ ] 修改 `src/main/agent/agent-bridge.ts` — 重构为薄协调层：接收 IPC 请求，委托给 `IAgentBackend` 实例，转发事件。构造函数接收 `IAgentBackend` 参数
- [ ] 修改 `src/main/index.ts` — 创建 `ClaudeCodeBackend` 实例，传入 `AgentBridge` 构造函数
- [ ] 修改 `src/renderer/src/stores/agent-store.ts` — 添加 `backendType` 字段 + `setBackendType` action
- [ ] 修改 `src/preload/index.ts` — 添加 `agent.getBackendType` / `agent.setBackendType`
- [ ] 修改 `src/renderer/src/components/settings/AgentSettings.tsx` — 添加后端类型下拉选择

#### 3F: 主题系统

**主题基础设施：**

- [ ] 新建 `src/renderer/src/stores/theme-store.ts` — Zustand store：`theme: 'dark' | 'light' | 'system'`，解析后的实际主题，`setTheme` action。变更时设置 `<html data-theme="...">` 并持久化到 localStorage
- [ ] 修改 `src/renderer/src/assets/main.css` — 添加 `[data-theme="light"]` CSS 变量块，覆盖所有 `--bg-*`、`--text-*`、`--border-*` 变量（白色/浅灰背景，深灰文字，浅色边框）
- [ ] 修改 `src/renderer/src/App.tsx` — 初始化 theme-store，挂载时应用 `data-theme` 属性
- [ ] 修改 `src/renderer/src/components/settings/AppearanceSettings.tsx` — 主题切换 UI（dark/light/system 单选按钮）

---

### Phase 4 — IM 即时通讯

**目标**：集成腾讯 TIM SDK，实现 AI-Native 即时通讯。

**前置依赖**：Phase 3 完成（多 Tab、真实侧栏、设置页）。

> 详细规格见 `docs/features/im-system.md`

#### 4A: TIM SDK 集成 + 用户体系对接

- [ ] 新建 `src/main/im/tim-manager.ts` — TIM SDK 初始化、登录/登出生命周期（DeepInk userID + TIM UserSig）
- [ ] 新建 `src/main/im/im-ipc.ts` — `registerImIpc()`：`im:login` / `im:logout` / `im:getConversationList` / `im:sendMessage` / `im:getMessageList` / `im:getFriendList`
- [ ] 新建 `src/main/im/message-handler.ts` — 消息事件分发：接收 TIM 事件，解析标准 + 自定义消息，通过 IPC 转发
- [ ] 修改 `src/main/index.ts` — 认证成功后初始化 TIM manager
- [ ] 修改 `src/preload/index.ts` — 添加 `deepink.im` 命名空间
- [ ] 修改 `src/preload/index.d.ts` — 添加 `IMAPI` 接口
- [ ] 修改 `backend/` — 添加 TIM admin API 端点（生成 UserSig）
- [ ] 安装依赖：`tim-js-sdk`

#### 4B: IM Store + 会话/联系人 UI

- [ ] 新建 `src/renderer/src/stores/im-store.ts` — 会话列表、消息（按会话 ID 索引）、好友列表、在线状态、连接状态
- [ ] 新建 `src/renderer/src/components/sidebar/ConversationList.tsx` — 侧栏会话列表面板
- [ ] 新建 `src/renderer/src/components/sidebar/ContactList.tsx` — 好友/联系人列表 + 在线状态指示
- [ ] 新建 `src/renderer/src/components/im-panel/IMPanel.tsx` — 右侧面板聊天 UI：消息气泡、输入框、发送按钮
- [ ] 新建 `src/renderer/src/components/im-panel/IMPanel.css` — 聊天气泡 + 消息列表样式
- [ ] 修改 `src/renderer/src/components/activity-bar/ActivityBar.tsx` — 添加 `messages` 图标（💬）
- [ ] 修改 `src/renderer/src/types/index.ts` — 添加 IM 类型（Conversation, Message, Friend, OnlineStatus）

#### 4C: 自定义消息 + AI 集成

- [ ] 新建 `src/main/im/custom-messages.ts` — 定义并解析自定义 TIM 消息：`WorkShareMessage`、`AgentNotificationMessage`、`AgentCollabMessage`
- [ ] 新建 `src/renderer/src/components/im-panel/WorkShareCard.tsx` — AI 工作成果分享卡片
- [ ] 新建 `src/renderer/src/components/im-panel/AgentNotificationCard.tsx` — Agent 任务完成/失败通知卡片
- [ ] 新建 `src/renderer/src/components/agent-panel/ShareButton.tsx` — Agent 面板中的"分享给好友"按钮，弹出好友选择器
- [ ] 修改 `src/renderer/src/components/agent-panel/AgentPanel.tsx` — 在 AI 完成任务后添加 `<ShareButton />`

#### 4D: IM MCP 工具模块

- [ ] 新建 `src/main/mcp/modules/im/index.ts` — `IMToolModule` 实现 `ToolModule`：`im_send_message` / `im_share_work` / `im_get_contacts`
- [ ] 修改 `src/main/index.ts` — 注册 `IMToolModule`
- [ ] 修改 `src/main/agent/agent-bridge.ts` — 更新工具上下文 prompt 包含 IM 工具

#### 4E: 文件/图片消息 + 打磨

- [ ] 新建 `src/renderer/src/components/im-panel/ImageMessage.tsx` — 图片消息渲染（缩略图）
- [ ] 新建 `src/renderer/src/components/im-panel/FileMessage.tsx` — 文件传输消息（下载进度）
- [ ] 修改 `src/main/im/tim-manager.ts` — 添加图片上传/发送、文件上传/发送、已读回执

---

### Phase 5 — 文档编辑器

**目标**：AI 驱动的文档编辑器。

**前置依赖**：Phase 3 完成（文件系统 IPC、多 Tab、设置页）。Phase 4（IM 分享）可并行但非阻塞。

> 详细规格见 `docs/features/document-editor.md`

#### 5A: Tiptap 集成 + 基础编辑器

- [ ] 新建 `src/renderer/src/components/editor/EditorTab.tsx` — Tiptap 编辑器 React 组件：接收文件路径、加载内容、渲染工具栏 + 编辑区
- [ ] 新建 `src/renderer/src/components/editor/EditorToolbar.tsx` — 格式化工具栏：Bold, Italic, Heading, Lists, Links, Images, Code blocks
- [ ] 新建 `src/renderer/src/components/editor/EditorToolbar.css` — 工具栏样式
- [ ] 新建 `src/renderer/src/stores/editor-store.ts` — 编辑器状态：openDocs, activeDocId, dirty 标记, AI 生成状态
- [ ] 新建 `src/main/editor/editor-ipc.ts` — `registerEditorIpc()`：`editor:openFile` / `editor:saveFile` / `editor:autoSave`
- [ ] 新建 `src/main/editor/file-parsers/markdown.ts` — Markdown ↔ ProseMirror JSON 转换
- [ ] 新建 `src/main/editor/file-parsers/docx.ts` — DOCX 导入/导出（使用 `docx` npm 包）
- [ ] 修改 `src/main/index.ts` — 注册 editor IPC
- [ ] 修改 `src/preload/index.ts` — 添加 `deepink.editor` 命名空间
- [ ] 修改 `src/renderer/src/components/workbench/Workbench.tsx` — 处理 `tab.type === 'editor'` 渲染 `<EditorTab />`
- [ ] 修改 `src/renderer/src/components/sidebar/FileTree.tsx` — 双击文件打开编辑器 Tab
- [ ] 安装依赖：`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/pm`, `@tiptap/extension-*` (link, image, table, placeholder, markdown), `docx`

#### 5B: AI 写作辅助

- [ ] 新建 `src/renderer/src/components/editor/extensions/ai-continue.ts` — Tiptap Extension：光标处 AI 自动补全（幽灵文字，Tab 接受）
- [ ] 新建 `src/renderer/src/components/editor/extensions/ai-rewrite.ts` — Tiptap Extension：选中文字后浮现 AI 操作工具栏（改写/翻译/总结）
- [ ] 新建 `src/renderer/src/components/editor/AIFloatingToolbar.tsx` — 选中文字后的浮动 AI 工具栏
- [ ] 修改 `src/renderer/src/components/editor/EditorTab.tsx` — 注册 AI 扩展，接入 Agent IPC

#### 5C: 多格式预览

- [ ] 新建 `src/renderer/src/components/preview/PdfViewer.tsx` — PDF.js PDF 预览
- [ ] 新建 `src/renderer/src/components/preview/ExcelViewer.tsx` — SheetJS 表格预览
- [ ] 新建 `src/renderer/src/components/preview/PptxViewer.tsx` — PPTX 预览
- [ ] 修改 `src/renderer/src/stores/tab-store.ts` — 根据文件扩展名决定打开编辑器 Tab 还是预览 Tab（`.pdf` / `.xlsx` / `.pptx` → preview）
- [ ] 修改 `src/renderer/src/components/workbench/Workbench.tsx` — 处理 `tab.type === 'preview'` 渲染
- [ ] 安装依赖：`pdfjs-dist`, `xlsx`, `pptxjs`

#### 5D: MCP 编辑器工具 + IM 分享

- [x] 新建 `src/main/mcp/modules/editor/index.ts` — `EditorToolModule` 实现 `ToolModule`：`editor_write` / `editor_append` / `editor_insert` / `editor_read` / `editor_save`
- [ ] 修改 `src/main/index.ts` — 注册 `EditorToolModule`
- [ ] 修改 `src/main/agent/agent-bridge.ts` — 更新工具上下文 prompt 包含编辑器工具

---

### Phase 6 — 独立 AI 记忆系统

**目标**：DeepInk 自己的记忆系统，不依赖任何 AI 服务的记忆。用户可以查看、编辑、删除 AI 对自己的记忆。

**前置依赖**：Phase 3 完成（设置页、文件系统），Phase 3E（可插拔后端用于记忆钩子）。

#### 记忆存储层

- [ ] 新建 `src/main/memory/memory-store.ts` — 本地记忆存储（SQLite / JSON 文件）。表：`long_term_memory`（偏好、习惯、关系）、`conversation_history`（所有 Agent 对话及元数据）、`working_memory`（当前会话上下文）
- [ ] 新建 `src/main/memory/context-manager.ts` — 上下文检索：给定用户消息，搜索相关记忆（初期关键词匹配，后续向量相似度），组装上下文块注入 AI prompt
- [ ] 新建 `src/main/memory/memory-ipc.ts` — `registerMemoryIpc()`：`memory:getAll` / `memory:getByCategory` / `memory:search` / `memory:update` / `memory:delete` / `memory:export`

#### 对话持久化

- [ ] 新建 `src/main/memory/conversation-store.ts` — 保存所有 Agent 对话到本地 DB。每条记录：session ID、时间戳、消息数、AI 生成的摘要、标签
- [ ] 修改 `src/main/agent/agent-bridge.ts` — 对话结束后保存到记忆 store，发送新消息前检索相关上下文

#### 记忆 UI

- [ ] 新建 `src/renderer/src/components/settings/MemorySettings.tsx` — 记忆浏览器：分类、搜索、编辑/删除单条记忆、导出按钮
- [ ] 新建 `src/renderer/src/components/sidebar/HistoryPanel.tsx` — 对话历史面板（侧栏），按日期/关键词搜索

#### MCP 记忆工具

- [ ] 新建 `src/main/mcp/modules/memory/index.ts` — `MemoryToolModule`：`memory_save` / `memory_recall` / `memory_search`

---

### Phase 7 — 云文件存储

**目标**：DeepInk 云盘（付费功能）+ 用户自有云盘接入，实现文件跨设备同步。

**前置依赖**：Phase 3（文件系统 IPC），Phase 5（编辑器保存/加载）。

#### 存储后端抽象

- [ ] 新建 `src/main/storage/storage-manager.ts` — `IStorageProvider` 接口：`upload` / `download` / `list` / `delete` / `getMetadata` / `syncStatus`
- [ ] 新建 `src/main/storage/private-cloud-client.ts` — DeepInk 云存储客户端（S3 兼容 API）
- [ ] 新建 `src/main/storage/storage-ipc.ts` — `registerStorageIpc()`

#### 用户云盘适配器

- [ ] 新建 `src/main/storage/adapters/webdav-adapter.ts` — WebDAV 适配器（通用，兼容多数网盘）
- [ ] 新建 `src/main/storage/adapters/baidu-adapter.ts` — 百度网盘适配器
- [ ] 新建 `src/main/storage/adapters/aliyun-adapter.ts` — 阿里云盘适配器

#### 同步引擎

- [ ] 新建 `src/main/storage/sync-engine.ts` — 后台同步：监听本地文件变更、上传差异、下载远端变更、冲突解决（时间戳 + 用户提示）

#### 云端后端

- [ ] 新建/修改 `backend/src/storage.js` — 云存储 API 端点（预签名 URL、文件元数据、同步标记）

---

### Phase 8 — 移动端 APP

**目标**：配套轻量版移动应用，侧重 IM + 文档查看 + AI 对话。

**前置依赖**：Phase 4（IM），Phase 6（记忆系统用于跨设备上下文）。

#### 项目搭建

- [ ] 新建 `mobile/` — React Native 项目（推荐，可共享 TypeScript 类型和 Zustand Store 定义）

#### 核心功能

- [ ] IM 消息（TIM 原生 SDK）— 核心功能
- [ ] 文档查看与简单编辑
- [ ] AI 对话（复用后端 API，移动端优化 UI）
- [ ] 推送通知
- [ ] 设置同步

---

### Phase 9 — 进阶功能

**目标**：表格编辑器、PPT 编辑器、Agent 间协作等高阶能力。

**前置依赖**：Phase 4（IM），Phase 5（编辑器）。

- [ ] 表格编辑器（Handsontable 或自研 Canvas 网格）
- [ ] 演示文稿（PPT）编辑器（幻灯片式，AI 大纲生成）
- [ ] Agent 间协作（你的 Agent ↔ 好友的 Agent，通过 `AgentCollabMessage`）
- [ ] Command Palette 生态（插件系统）
- [ ] 协同编辑（Yjs + Tiptap）

---

### Phase 10 — 生产打磨

**目标**：交付生产级 v1.0。

**前置依赖**：所有功能阶段完成。

#### 性能优化

- [ ] 虚拟滚动（文件树、会话历史、IM 消息列表）
- [ ] 懒加载（编辑器、IM、预览模块）
- [ ] Bundle 分析 + Tree-shaking
- [ ] 内存泄漏审计（Electron 主进程长期运行）

#### 错误处理 + 遥测

- [ ] React Error Boundaries
- [ ] 主进程 crash reporter（Electron `crashReporter`）
- [ ] 用户行为分析（隐私友好、opt-in）
- [ ] 自动更新（`electron-updater`）

#### 安全加固

- [ ] CSP 审计
- [ ] IPC channel 白名单
- [ ] 内嵌浏览器内容安全策略
- [ ] 认证流程安全测试

#### 打包 + 分发

- [ ] 代码签名（Apple Developer 证书）
- [ ] macOS 公证
- [ ] 自动更新通道（stable/beta）
- [ ] DMG 安装包打磨

#### 文档 + 引导

- [ ] 首次运行引导 / 教程
- [ ] 用户文档
- [ ] 应用内帮助

---

## 阶段依赖关系

```
Phase 1-2 (DONE)
    ↓
Phase 3: 骨架加固
    3A → 3B → 3C → 3D → 3E → 3F
    ↓
Phase 4: IM        ←┐ 可并行
    ↓               │
Phase 5: 编辑器    ←┘
    ↓
Phase 6: 记忆      ←┐ 可并行
    ↓               │
Phase 7: 云存储    ←┘
    ↓
Phase 8: 移动端
    ↓
Phase 9: 进阶功能
    ↓
Phase 10: 生产打磨
```

**并行化建议**：Phase 4（IM）和 Phase 5（编辑器）可同时推进。Phase 6（记忆）和 Phase 7（云存储）也可并行。

## 调试

### 开发者工具

- 渲染进程: `Cmd+Option+I` 打开 DevTools
- 主进程: 终端查看日志
- WebContentsView: 右键 → 检查元素

### 常用命令

```bash
pnpm dev          # 开发模式（热重载）
pnpm build        # 构建
pnpm test         # 运行测试（Phase 3A 后可用）
pnpm lint         # 代码检查（Phase 3A 后可用）
pnpm package      # 打包 Mac 应用 (.dmg)
./dev.sh          # 一键启动/重启
```

## 关键文件索引

会被每个 Phase 反复修改的核心文件：

| 文件 | 角色 | 修改频率 |
|------|------|---------|
| `src/main/index.ts` | 主进程入口，注册所有子系统 | 每个 Phase |
| `src/preload/index.ts` | Renderer↔Main 桥梁，每个新模块加 namespace | 每个 Phase |
| `src/preload/index.d.ts` | Preload API 类型声明 | 每个 Phase |
| `src/renderer/src/components/workbench/Workbench.tsx` | 主工作区，多 Tab 渲染 | Phase 3B/C/D/E, 5 |
| `src/renderer/src/components/sidebar/Sidebar.tsx` | 侧栏，替换假数据 | Phase 3C, 4B |
| `src/renderer/src/assets/main.css` | 全局样式 + 主题 | Phase 3C/F, 4B, 5A |
| `src/renderer/src/stores/agent-store.ts` | Agent 状态（流式消息、后端类型） | Phase 3E |
| `src/main/agent/agent-bridge.ts` | Agent 桥接（重构为可插拔） | Phase 3E, 6 |
| `src/main/mcp/tool-host.ts` | MCP 工具注册中心 | Phase 4D, 5D, 6 |
