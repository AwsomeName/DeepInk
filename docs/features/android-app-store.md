# Android 应用商店引导安装 — 决策文档（ADR）

> 决策日期：2026-06-10
> 状态：**已决策，实施中**
> 关联：[android-mirror.md](./android-mirror.md)、[cloud-phone.md](./cloud-phone.md)

## 一、背景与问题

CCLink Studio 自建的 AVD 使用 Google 官方 **Google APIs 镜像**（[sdk-setup.ts](../../src/main/android/sdk-setup.ts) `createDefaultAvd()` 中 `tag.id=google_apis` + `PlayStore.enabled=false`），开机后桌面**没有任何应用商店**（无 Google Play，无国产商店），用户无法安装 APP。

`AdbBridge.installApk()`（[adb-bridge.ts:331](../../src/main/android/adb-bridge.ts#L331)）已具备"传输安装"能力，但完整装应用链路有 5 步，CCLink Studio 只通了 1 步：

| 步骤 | 现状 |
|------|------|
| 1. 发现（搜应用） | ❌ |
| 2. 获取 APK | ❌ |
| 3. 传输安装（adb install） | ✅ 已有 |
| 4. 未知来源授权 | ⚠️ 部分 |
| 5. 图形入口 | ❌ |

本方案补齐"获取 APK + 图形入口"，让用户开机即有一个可用的国产应用商店。

## 二、决策

### 2.1 装应用链路：方案 A —— 运行时下载 + adb install + 开机自检补装

**采用**。首次启动后从官方源下载商店 APK，`adb install` 装入 userdata，靠 userdata 持久化 + 开机幂等自检保持常驻。

**否决**：

| 方案 | 否决理由 |
|------|----------|
| **B. quickboot 快照** | 现状 [emulator-manager.ts:156](../../src/main/android/emulator-manager.ts#L156) 已 `-no-snapshot`，每次冷启动。快照仅是可选加速层，非持久化必要条件，先不做 |
| **C. 烧进 system.img** | 维护成本最高（需重建镜像），且每次 Google 更新镜像要重打。留作分发态终极方案，当前不做 |
| **自建应用中心** | APK 源无官方程序化 API（应用宝/酷安/APKPure 均不开放），是死结 |
| **接入 MuMu 作为主线** | MuMu 仅作"重度游戏/国产生态"的可选后端，优先级低（见 2.3） |

### 2.2 镜像/运行时：保留自建 Google AVD 为基石

- **Google AVD（现状）**：可控、可打包分发、CCLink Studio 自有资产 → **默认运行时**
- **MuMu**：`adb connect 127.0.0.1:16384` 可复用全部 ADB+scrcpy 能力，自带国产生态，但属第三方产品、不可捆绑分发 → **可选后端**（仅游戏/重度兼容场景）
- **长期**：抽象 `AndroidBackend` 接口，本地 AVD / MuMu / 云手机三后端可切换（与 agent-backend 可插拔模式一致）

### 2.3 商店选择：应用宝（`com.tencent.android.qqdownloader`）

- 国内分发量最大、应用最全
- 约 32MB（酷安 96MB，更重）
- **裸 Android 可跑**，不依赖 MIUI/HMS 框架 → 与 Google APIs AVD 兼容

### 2.4 APK 来源：多源解析 + 缓存抗失效

无官方 API；直链（`imtt*.dd.qq.com` 的 hash 链）随版本失效。采用**多源解析 + 配置化**：

| 优先级 | 源 | 获取方式 |
|--------|----|---------|
| 1 | 腾讯详情页 `sj.qq.com/appdetail/{pkg}` | 解析页面下载按钮 → dd.qq.com 直链 |
| 2 | APKPure download 页（.cn，国内可访问） | 解析拿 CDN 链接 |
| 3 | 硬编码直链模板 | 兜底（hash 失效快） |

源全部失败 → 降级为"引导用户手动下载"。

## 三、接入点（基于现有代码）

| 环节 | 现有 | 复用方式 |
|------|------|----------|
| 安装 APK | [adb-bridge.ts:331](../../src/main/android/adb-bridge.ts#L331) `installApk()` | 直接调用 |
| boot 完成信号 | [emulator-manager.ts:218-219](../../src/main/android/emulator-manager.ts#L218-L219) `waitForBoot()` 后 setState('running') | 在其后挂自检 |
| 启动参数 | [emulator-manager.ts:156](../../src/main/android/emulator-manager.ts#L156) `-no-snapshot` | 现状即纯方案 A 形态 |

**关键约束**：[emulator-manager.ts:120-122](../../src/main/android/emulator-manager.ts#L120-L122) 首次启动失败会 `-wipe-data` 重试，会清空 userdata → **商店必然丢失**。因此自检必须在"最终 running 之后"，且必须能从 wipe 中恢复（幂等）。

## 四、自检补装流程（幂等）

```
EmulatorManager.launch() 成功 → setState('running')
        │
        ▼
   ensureStoreInstalled()（后台，不阻塞）
        │
        ▼
  pm list packages com.tencent.android.qqdownloader
        │
   ┌────┴────┐
 已装       未装
   │         │
 完成    本地缓存有可用 APK？
            │
       ┌────┴────┐
       有        没有
       │         │
       │     按 store-sources.json 多源尝试下载（详情页解析 → 直链）
       │         │
       │     ┌───┴───┐
       │   成功     全失败
       │     │       │
       │     │    降级：IPC 通知 UI "商店获取失败，请手动下载"
       ▼     ▼
   adb install -r <path>
        │
   装失败 → 重试 1 次 → 仍失败则记录，下次开机再补
        │
        ▼
      完成
```

## 五、缓存策略

- 路径：`app.getPath('userData')/apk-cache/yingyongbao.apk`
- **装完保留**（下次自检直接用，不重下、不依赖网络）
- 缓存是抗源失效的护城河：源全挂时，只要本地有一次成功的 APK，仍能装上

## 六、失败降级

1. 多源尝试（腾讯详情页 → APKPure → 硬编码直链）
2. 全失败 → 不卡住启动，IPC `android:storeInstallFailed` 通知渲染进程
3. UI 弹"获取应用宝失败，点击手动下载" + 跳官网；支持拖入 APK 走已有 `android:installApk`

## 七、实施清单

| 文件/改动 | 作用 | 状态 |
|-----------|------|------|
| `resources/store-sources.json`（新） | 多源获取配置（包名、详情页 URL、解析规则、直链模板） | ✅ 已完成 |
| `src/main/android/store-installer.ts`（新） | `ensureStoreInstalled()`：自检 + 下载 + 安装 + 降级 | ✅ 已完成 |
| [emulator-manager.ts](../../src/main/android/emulator-manager.ts) `launch()` 末尾 | running 后调 `ensureStoreInstalled()`（后台，不阻塞 UI） | ✅ 已完成 |
| [android-ipc.ts](../../src/main/ipc/android-ipc.ts) | `android:storeInstallProgress/Result` 推送 + `android:retryStoreInstall` 重试 | ✅ 已完成 |
| [preload](../../src/preload/index.ts) | `onStoreInstallProgress` / `onStoreInstallResult` / `retryStoreInstall` IPC 绑定 | ✅ 已完成 |
| 渲染进程 [AndroidDisplay.tsx](../../src/renderer/src/components/workbench/AndroidDisplay.tsx) | 进度浮层 + 成功/失败提示 + 重试按钮 + 手动选 APK 入口 | ✅ 已完成 |
| [agent-device-manager.ts](../../src/main/android/agent-device-manager.ts)（新） | 语义 Accessibility Tree 会话管理 + 优雅降级 | ✅ 已完成 |
| [agent-device MCP 模块](../../src/main/mcp/modules/agent-device/index.ts)（新） | 4 个语义工具：snapshot / click / swipe / type | ✅ 已完成 |

`AdbBridge` / `installApk` / `waitForBoot` / IPC `installApk` —— **全部复用，不改**。

## 八、已知代价（开工前认掉）

1. **网页解析会失效**：腾讯/APKPure 页面改版时解析规则需更新。这是方案 A 的终身运维成本，配置化只是让它好改，不能消灭。缓解：多源 + 缓存兜底。
2. **首次启动慢**：现状冷启动 + 首次还要下 APK（32MB）+ install。缓解靠缓存（第二次起跳过下载）。
3. **合法灰度**：运行时从腾讯官方源下载 ≠ 重新分发，CCLink Studio 安装包内不含别人 APK，风险低；解析官方页面属灰色地带。

## 九、调研来源

- [应用宝官方详情页](https://sj.qq.com/appdetail/com.tencent.android.qqdownloader)
- [APKPure 应用宝下载页](https://apkpure.com/cn/ying-yong-bao/com.tencent.android.qqdownloader)
- [非官方 APKPure 解析库（GitHub）](https://github.com/anishomsy/apkpure)
- [MuMu Mac ADB 连接教程](https://mumu.163.com/mac/function/20240126/40028_1134600.html)
