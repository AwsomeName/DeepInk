# CCLink Studio 架构说明

> 当前事实源。最后更新：2026-07-16。

## 结论

CCLink Studio 是 CCLink 的开源桌面工作台端，不是 CCLink Studio 接入 CCLink，也不是独立账号体系。

开源仓库的目标是提供本地优先的桌面壳、浏览器/文档/Android/Terminal/Agent 工作台、MCP 工具和可扩展 IPC 边界。官方账号、云函数、配对、消息路由、额度、签名、公证、生产 API 注入和官方发布链路由闭源工作区与 CCLink 主项目承接。

## 项目边界

| 位置 | 角色 |
| --- | --- |
| `/Users/apple/Desktop/cclink-dev/cclink-studio` | 开源桌面壳。默认不内置官方生产 API 地址，不带登录/订阅/官方消息网络/云同步/网络工作区实现。 |
| `/Users/apple/Desktop/cclink-dev` | 闭源总控/官方编译工作区。承接官方集成层、签名、公证、生产 API 注入、多仓库集成脚本和 release 基线。 |
| `/Users/apple/Desktop/chat-cc/deploy` | CCLink 云函数与账号体系。 |
| `/Users/apple/Desktop/chat-cc/Agent` | CCLink Agent runtime。 |

不存在额外拆分出的云端或 Agent 独立项目。

## 开源版能力

CCLink Studio 开源壳保留这些本地能力：

- Electron + React + TypeScript 桌面工作台。
- VSCode 风格布局：Activity Bar、Sidebar、Workbench、Agent Panel、Status Bar。
- 本地工作空间、标签页、浏览器、Markdown 编辑器、Android/设备视图、Terminal。
- 本地 Agent 会话、本地 Claude Code 后端、MCP 工具系统和权限确认。
- 本地设置、诊断、文件访问和工作台状态恢复。
- updater 的中性检查框架，但不开源默认生产更新源、签名、公证或 制品上传链路。

这些能力不需要用户登录 CCLink，也不依赖官方云服务。

## 独立启动边界

`cclink-studio` 必须可以作为单仓库独立启动：

- `pnpm dev` 直接启动开发模式。
- `bash scripts/restart.sh restart` 启动后台开发进程。
- 默认启动不得要求存在 `cclink-dev`、`chat-cc/deploy` 或 `chat-cc/Agent`。
- 官方账号、官方运行时、生产 API、签名、公证和发布上传只通过官方集成层进入。

Android 是本地真机能力：只连接用户自有 USB 或 Wi-Fi ADB 真机。不提供 Android SDK 下载、AVD 创建、模拟器启动或托管设备服务。找不到 `adb` 时，Studio 应继续启动，Android 设备能力降级为不可用。

## 不在开源壳默认路径的能力

以下能力必须通过 `cclink-dev` / `chat-cc` 侧官方集成层接入：

- CCLink account / device / message / runtime 网络。
- 官方消息凭证、消息路由、配对、网络运行时注册。
- 登录、订阅、entitlement、quota、官方 feature gate。
- 云同步、网络文件树、网络文件查看、网络 session sidebar。
- 私有服务配置、生产 API 地址、官方更新源、制品上传、签名和公证流程。
- Android SDK/AVD 管理、模拟器启动、托管设备服务。

验收上，开源壳不应默认 import 官方账号、订阅、同步、消息网络或网络工作区实现，也不应默认暴露这些 preload API。

## 运行时分层

```text
renderer
  React UI, Zustand stores, workbench tabs, settings, local Agent panel

preload
  contextBridge exposes local-safe APIs only
  browser / agent / editor / fs / terminal / settings / updater / android ...

main
  Electron app lifecycle
  Browser WebContentsView
  Agent bridge and local Claude Code backend
  MCP tool host
  local filesystem, editor, terminal, diagnostics, updater shell

official integration layer (outside OSS default path)
  account, entitlement, CCLink device/message/runtime network, official release
```

## 文档状态

当前事实源：

- `README.md`
- `AGENTS.md`
- `docs/README.md`
- `docs/architecture.md`
- `docs/development.md`
- `docs/official-integration-contract.md`

## 拷问

最容易出错的地方是把官方账号、消息、网络运行时或发布链路重新写进 Studio 默认路径。Studio 侧只保留本地工作台能力和清晰的官方集成接口。
