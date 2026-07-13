# 架构审查记录（2026-07-06）

本文记录一次架构审查中发现的结构性问题，供后续重构排期使用。

## 验证结果

- `pnpm build`：通过。
- `npx vitest run`：102 个测试通过。
- `npx tsc --noEmit -p tsconfig.web.json`：失败。
- `npx tsc --noEmit -p tsconfig.node.json`：失败。

结论：当前构建链路可产物化，但完整 TypeScript 严格检查未成为门禁，类型与 IPC contract 已经出现漂移。

## 高优先级问题

### 1. 主进程初始化顺序与能力耦合过重

位置：
- `src/main/index.ts`
- `src/main/ipc/agent-ipc.ts`
- `src/main/settings/settings-ipc.ts`

问题：
- `agent:getPermissionMode` 等 Agent/权限相关 IPC 注册在 CDP/Playwright 初始化之后，renderer 启动早时会调用到未注册 handler。
- 权限模式、设置、外部 MCP 配置这些基础能力不应依赖 Playwright 是否成功连接。
- `registerSettingsIpc` 需要 `agentBridge` 参数，但入口调用未传入，导致 API 设置热重载链路断开。

建议：
- 把主进程启动拆成 `bootstrapCoreServices`、`bootstrapWindow`、`bootstrapAutomationRuntime`、`bootstrapAgentRuntime`。
- 权限、设置、MCP server 配置管理提前注册。
- AgentBridge 使用 getter 或 runtime registry 获取可选能力，避免初始化顺序循环。

### 2. Agent runtime 对 Playwright/MCP 的非空依赖过硬

位置：
- `src/main/index.ts`
- `src/main/agent/agent-bridge.ts`
- `src/main/agent/backend/backend-factory.ts`
- `src/main/agent/backend/claude-code-backend.ts`

问题：
- CDP/Playwright 初始化失败后，入口仍用非空断言传入 `playwrightBridge!`、`toolHost!`、`mcpClientMgr!`。
- Claude backend 在发送消息时会直接访问 `playwrightBridge.getPage()`、`toolHost.getPort()`、`mcpClientMgr.composeMcpConfig()`。
- 结果是 Agent UI 可能显示就绪，但实际发送时进入空依赖路径。

建议：
- 引入 `AgentRuntimeCapabilities`，明确 browser/editor/android/meshy/agent-device 是否可用。
- CDP 失败时禁用 browser scope 和 browser tools，但保留纯文本/HTTP API 对话能力。
- MCP tool host 应作为 Agent runtime 的可选能力，而不是所有 backend 的硬依赖。

### 3. IPC contract 没有单一事实源

位置：
- `src/preload/index.ts`
- `src/preload/index.d.ts`
- `src/renderer/src/**`
- `src/main/**`

问题：
- renderer 多处直接 import `preload/index.d.ts`，路径已经出现解析失败。
- preload 类型、main IPC 返回值、renderer 使用方式之间存在漂移。
- 例如 `fs.readFile` 实际返回 `{ content, encoding }`，但类型写成 `string | { content, encoding }`，调用方有的解构对象、有的兼容 string。

建议：
- 新增 `src/shared/ipc-contract.ts` 或按 feature 拆分 shared contract。
- main/preload/renderer 都引用 shared contract。
- preload 只负责 contextBridge 暴露，不作为共享类型库。

### 4. 完整类型检查没有纳入质量门禁

位置：
- `package.json`
- `tsconfig.web.json`
- `tsconfig.node.json`

问题：
- `pnpm build` 只执行 `electron-vite build`，没有执行 `tsc --noEmit`。
- 当前 Vite build 可过，但 node/web 两套 tsconfig 都有错误。

建议：
- 新增脚本：
  - `typecheck:web`
  - `typecheck:node`
  - `typecheck`
- 在 CI 和 release 前执行 `pnpm typecheck && pnpm test && pnpm build`。

## 中优先级问题

### 5. Workbench 状态持久化主要散落在 renderer localStorage

位置：
- `src/renderer/src/stores/tab-store.ts`
- `src/renderer/src/stores/browser-store.ts`
- `src/renderer/src/stores/editor-store.ts`
- `src/renderer/src/stores/ui-store.ts`
- `src/renderer/src/stores/fs-store.ts`

问题：
- 当前可恢复状态，但缺少 workspace/user 维度。
- 多工作区会互相污染。
- 缺少 schema version、迁移、统一清理和云同步入口。
- 与“所有文件读写通过 IPC 经主进程完成”的原则不完全一致。

建议：
- 在 main process 新增 `WorkspaceStateService`。
- 以 `userId + workspaceId` 分区存储状态。
- 加 schema version 和 migration。
- renderer store 只做缓存，主进程负责持久化真相。

### 6. `src/main/index.ts` 已经成为装配巨石

位置：
- `src/main/index.ts`

问题：
- 单文件同时负责窗口、浏览器、认证、订阅、同步、设置、更新、Android、MCP、Agent、CCLink、Meshy、退出清理。
- 模块越多，初始化顺序越脆弱，错误隔离困难。

建议：
- 提取 `AppRuntime` 或 `ServiceRegistry`。
- 每个 feature 提供 `registerFeature(runtime)`，并声明依赖。
- 优雅退出也按服务注册顺序集中管理，而不是在入口文件手写所有资源。

## 低优先级问题

### 7. shared/chatcc 类型导出冲突

位置：
- `src/shared/chatcc/index.ts`
- `src/shared/chatcc/models.ts`
- `src/shared/chatcc/protocol.ts`

问题：
- `models` 和 `protocol` 都导出了 `ChatccAgentToolMessage`，`export *` 产生歧义。

建议：
- 区分领域命名，例如 `ChatccStoredAgentToolMessage` 与 `ChatccProtocolAgentToolMessage`。
- 或在 barrel file 显式导出，避免 `export *`。

### 8. 新增依赖类型不完整

位置：
- `src/renderer/src/components/workbench/ModelViewer.tsx`
- `package.json`

问题：
- `three` 相关类型缺失，导致 `tsc.web` 报错。

建议：
- 安装并配置 `@types/three`，或增加最小模块声明。

## 建议重构顺序

1. 修主进程初始化顺序和 Agent degraded mode。
2. 抽 shared IPC contract，清理 renderer 对 preload 类型的直接依赖。
3. 把 `typecheck` 纳入构建/CI 门禁，并清零当前 TS 错误。
4. 抽 `WorkspaceStateService`，把工作台持久化从散落 localStorage 迁到主进程。
5. 拆分 `src/main/index.ts` 为 runtime/service registry。

