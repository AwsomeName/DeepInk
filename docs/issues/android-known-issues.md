# Android 模拟器模块 — 已知问题与改进项

> 本文档记录 Android AI 操控模块在审阅中发现的问题，按优先级排列。
>
> 评审时间：2026-06-08
> 评审范围：`src/main/android/`、`src/main/mcp/modules/android/`、`src/main/ipc/android-ipc.ts`、`src/renderer/src/components/workbench/Android*`

## P0 — 阻塞功能跑起来

### 1. `currentActivity` 命令拼接 bug

**位置**：[src/main/android/adb-bridge.ts:238-240](../../src/main/android/adb-bridge.ts#L238-L240)

```ts
async currentActivity(): Promise<string> {
  const { stdout } = await this.shell('dumpsys activity top | grep ACTIVITY')
  return stdout.trim()
}
```

**问题**：`shell(cmd)` 把整串传给 `execFile('adb', ['shell', 'dumpsys activity top | grep ACTIVITY'])`。`execFile` 不经过 shell 解析，**`|` 管道符不会被解释**，`adb shell` 接到的也是裸字符串。

**结果**：`adb shell` 内部确实会启动一个 Android 端的 shell，理论上 `|` 在那里能工作，但实际行为依赖于 Android shell 的解析能力（toybox/mksh），且容易因设备版本差异失败。同时主进程的 grep 过滤本应在 Node 端做更可靠。

**修复方向**：
- 主进程做 grep 过滤：`shell('dumpsys activity top')` 然后 Node 端按行过滤 `ACTIVITY`
- 或者改用更稳定的命令：`shell('cmd activity get-top-resumed-activity')`（API 29+）

---

### 2. `typeText` 不支持中文

**位置**：[src/main/android/adb-bridge.ts:192-195](../../src/main/android/adb-bridge.ts#L192-L195)

```ts
async typeText(text: string): Promise<void> {
  const escaped = text.replace(/ /g, '%s')
  await this.execAdb(['shell', 'input', 'text', escaped])
}
```

**问题**：`adb shell input text` **不支持 Unicode**（中文、Emoji）。`android-mirror.md` 中已明确指出这是方案 A 的缺点，scrcpy 协议有 text control message 可解，但目前 `ScrcpyBridge` 只实现了 `injectTouch`，**没接 text 注入**。

**业务影响**：AI 给安卓上的 IM 输入中文会失败。这在移动端自动化场景中是关键问题。

**修复方向**：
- `ScrcpyBridge` 增加 `injectText(text)` 方法，调用 `controller.injectText` 或 `setClipboard`
- `android_type_text` 工具优先用 scrcpy 注入，scrcpy 未连接时回退到 ADB（仅 ASCII 可用）
- 或者直接走剪贴板：`adb shell input keyevent COPY` 后 `adb shell am broadcast` 写剪贴板，再 `PASTE`

---

## P1 — 影响可靠性

### 3. `launchPackage` 使用 monkey 命令 + 字符串拼接

**位置**：[src/main/android/adb-bridge.ts:244-247](../../src/main/android/adb-bridge.ts#L244-L247)

```ts
async launchPackage(packageName: string): Promise<string> {
  const { stdout } = await this.shell(`monkey -p ${packageName} -c android.intent.category.LAUNCHER 1`)
  return stdout.trim()
}
```

**问题**：
1. `monkey` 是测试工具，会输出"Events injected"噪声，且语义不是"启动应用"
2. `packageName` 直接拼接到 shell 命令字符串。虽然外层 execFile 不走 shell，但 `adb shell` 内部会再 split — 含空格或特殊字符的包名会出问题（理论上合法包名不含这些，但仍是潜在注入面）

**修复方向**：换 `am start -n ${pkg}/${launcher_activity}`。若不知道 launcher activity，可用：
```sh
cmd package resolve-activity --brief ${pkg} | tail -1
```
获取目标 activity 再启动。

---

### 4. 缺少元素定位的高阶工具

**问题**：当前只暴露裸坐标 `tap(x, y)`。Agent 流程必须：
1. `android_dump_ui` → 拿 XML（可能上百 KB）
2. 自己解析 XML 找元素
3. 算坐标
4. `android_tap`

**代价**：每次操作多消耗 2 次工具调用 + 大量 token（XML 体积大）。对比浏览器侧有 selector 一步到位。

**建议**：增加高阶工具
- `android_tap_by_text` — 按可见文本点击
- `android_tap_by_resource_id` — 按 resource-id 点击
- `android_wait_for_element` — 等待元素出现（轮询 dumpUi）

实现可在主进程解析 XML（fast-xml-parser 或简单正则）后直接调用 `bridge.tap()`。

---

### 5. 多点触控 / 长按未实现

**位置**：[src/main/android/scrcpy-bridge.ts:189-211](../../src/main/android/scrcpy-bridge.ts#L189-L211)

**问题**：`injectTouch` 的 `pointerId` 写死 `BigInt(0)`，不支持双指手势。Agent 想做缩放、游戏多指操作不可行。

**建议**：暴露 `pointerId` 参数，MCP 工具加 `android_pinch` / `android_long_press`。

---

## P2 — 安全 / 体验

### 6. `android_shell` 权限过宽

**位置**：[src/main/mcp/modules/android/index.ts:180-190](../../src/main/mcp/modules/android/index.ts#L180-L190)

**问题**：标了 `destructiveHint: true`，但走同一套 PermissionManager。`shell` 可以 `rm -rf /`、读通讯录、安装后门 APK — 破坏性远高于 `tap`，应有更严格的确认层（如要求用户在 UI 上手动输入确认码）。

**建议**：分级权限模式：
- 默认拒绝（即使 permission mode 是 auto）
- 必须用户主动在 UI 切换"允许 shell 工具"
- 或者按命令前缀白名单：`getprop/dumpsys/pm list` 允许，`rm/wipe/install` 拒绝

---

### 7. 测试覆盖薄

**位置**：[src/main/android/android-actions.test.ts](../../src/main/android/android-actions.test.ts)

**问题**：只测了 `ANDROID_ACTION_TYPES` 数组长度，没有任何执行路径的测试。`AdbBridge` 完全无 mock 测试。`executeAndroidAction` 的 switch 全分支未覆盖。

**建议**：
- mock `AdbBridge`，测试 `executeAndroidAction` 所有 case 的参数传递
- 测试 `toolNameToActionType` 边界（空串、不带前缀、连续下划线）
- 测试 `currentActivity` 修复后的输出解析

---

### 8. 模拟器启动超时硬编码 120s

**位置**：[src/main/android/emulator-manager.ts:125-126](../../src/main/android/emulator-manager.ts#L125-L126)

**问题**：`waitForDevice(120)` + `waitForBoot(120)` 写死。冷启动 + 首次 AVD 创建可能超过 120s（特别是 Apple Silicon 转译 x86 镜像或低配机器）。

**建议**：从设置读取超时，默认 180s。

---

## 修复进度

- [ ] P0-1 修复 `currentActivity` grep 拼接
- [ ] P0-2 接入 scrcpy text injection 支持中文
- [ ] P1-3 改用 `am start` 替代 monkey
- [ ] P1-4 加 `tap_by_text` 高阶工具
- [ ] P1-5 多点触控
- [ ] P2-6 shell 工具分级权限
- [ ] P2-7 补充单元测试
- [ ] P2-8 超时可配置
