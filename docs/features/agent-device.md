# Android 真机与 agent-device

> 当前事实源。最后更新：2026-07-16。

## 结论

CCLink Studio 的 Android 能力是本地真机能力，只面向用户自有 USB 或 Wi-Fi ADB 设备。

本仓库不提供 Android SDK 下载、AVD 创建、模拟器启动或托管设备服务。找不到 `adb` 时，Studio 仍应正常启动，Android MCP / agent-device 能力报告不可用。

## 启动与依赖

- Studio 可单仓库独立启动：`pnpm dev` 或 `bash scripts/restart.sh restart`。
- Android 不是启动依赖。
- `adb` 只在用户连接 Android 真机、执行 Android MCP 工具或 agent-device 语义工具时需要。
- adb 发现顺序：可选自带 platform-tools、`ANDROID_HOME`、`ANDROID_SDK_ROOT`、系统常见 SDK 目录、PATH。

## 当前能力

- 扫描用户本机可见 Android 设备。
- 连接 USB / Wi-Fi ADB 真机。
- 通过 scrcpy 显示真机画面。
- 通过 Android MCP 执行 tap、swipe、type、press key、screenshot、dump UI、shell 等操作。
- 使用 published `agent-device` npm package 做语义 UI snapshot。

## 不做什么

- 不下载 Android SDK。
- 不创建或管理 AVD。
- 不启动模拟器。
- 不接托管设备服务。
- 不把 Android 设备能力接到官方账号或网络运行时默认路径。

## 代码边界

- `src/main/android/agent-device-manager.ts`：agent-device 桌面集成、可用性探测和降级。
- `src/main/mcp/modules/agent-device`：CCLink Studio MCP adapter。
- `src/main/android/physical-device-manager.ts`：物理真机发现和连接。
- `src/main/android/adb-bridge.ts`：adb 二进制发现和命令执行。
- `src/renderer/src/stores/android-store.ts`：renderer 设备状态。

## 验收标准

- `pnpm typecheck` 通过。
- `pnpm test` 通过。
- `pnpm build` 通过。
- `bash scripts/restart.sh restart` 可以在没有官方仓库、没有 adb 的机器上启动 Studio。
- 扫描不到 SDK 下载、虚拟设备生命周期或托管设备服务的 IPC / preload / renderer 状态。

## 拷问

如果 Android 真机能力启动失败，先区分是应用启动失败，还是 adb/设备能力不可用。前者是阻塞；后者只应显示为设备未连接或 adb 未找到。

如果某个改动要求重新加入 SDK 下载、AVD 管理或模拟器启动，它不属于 Studio OSS 默认路径，应先进入新的设计评审。
