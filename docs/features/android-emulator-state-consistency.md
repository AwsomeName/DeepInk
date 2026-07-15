# Android 模拟器状态一致性修复方案

> 关联文档：[`android-mirror.md`](./android-mirror.md)、[`android-app-store.md`](./android-app-store.md)
>
> 本文记录「模拟器状态左右面板不一致」bug 的根因与修复方案。**本文档为方案设计，尚未实现。**

## 问题概述

模拟器运行时出现：左侧面板显示「运行中」，中间 workbench 报 `device 'emulator-5554' not found`，重试仍报同样错误。两侧状态对不上。

## 根因：三份互相不校验的状态

CCLink Studio 内部用三块**各自独立、从不对账**的状态拼出「模拟器」这件事：

| # | 状态 | 位置 | 更新时机 | 实际含义 |
|---|------|------|----------|----------|
| ① | `EmulatorManager.state` | [`emulator-manager.ts:28`](../../src/main/android/emulator-manager.ts#L28) | 仅在 CCLink Studio spawn 的 ChildProcess 的 `exit` 事件 / `terminate()` 里变 | 「我 spawn 的那个进程句柄还活着吗」 |
| ② | `AdbBridge.deviceId`（缓存序列号） | [`adb-bridge.ts:35`](../../src/main/android/adb-bridge.ts#L35) | 仅 boot 时 `waitForDevice()` 写一次（[:108](../../src/main/android/adb-bridge.ts#L108)），之后永不刷新 | 「开机时 `adb devices` 第一行抓到的序列号」 |
| ③ | OS 上真实的 emulator/qemu 进程 | 操作系统 | 任何东西都能动（崩溃、`kill`、孤儿） | 「实际占用 5554/5555 端口的进程」 |

三者之间没有任何对账逻辑：
- `getDeviceId()`（[`adb-bridge.ts:351`](../../src/main/android/adb-bridge.ts#L351)）永远返回缓存的 ②，重试也不重新 `adb devices`；
- `scrcpy:connect` 直接用传入 serial（[`scrcpy-bridge.ts:98`](../../src/main/android/scrcpy-bridge.ts#L98)），不重新发现设备；
- EmulatorManager 无任何进程存活探活（无 `setInterval`、无 `process.killed`、无 `adb get-state`）。

**额外缺陷**：EmulatorManager 持有进程、AdbBridge 独立发现 serial，两者解耦，没有一个地方记录「这个 serial = 我 spawn 的那个进程」。这是状态能各走各路的结构性原因。

## 漏洞形成机制

1. 由于上一次会话崩溃或 `terminate()` 没杀干净，OS 上遗留一个仍存活的 emulator 进程（孤儿），占着标准端口 5554/5555。
2. 本次 `launch()` 又起一个新 emulator，抢不到 5554，落在别的端口（如 emulator-5556）。于是 OS 上同时存在两个实例。
3. `waitForDevice()` 用 `lines.find(...)` 取 `adb devices` 第一行（[`adb-bridge.ts:101-108`](../../src/main/android/adb-bridge.ts#L101-L108)），`emulator-5554` 字典序在前，于是**抓到了孤儿的序列号**，而非 CCLink Studio 自己 spawn 的那个。
4. 系统进入脆弱稳态：① 跟踪新进程（活着 → `running`），② 缓存序列号指向孤儿。
5. Agent 用裸 Bash 执行 `kill <孤儿 PID>`：孤儿死 → `emulator-5554` 消失 → 中间连不上、重试仍用同一序列号 → 永远 `not found`；而 ① 跟踪的新进程未受影响 → 左侧继续「运行中」。

被杀的进程（② 指向的）和左侧跟踪的进程（①）不是同一个，这是左右不一致的精确机制。

## 解决方案

### 设计原则

1. **单一事实来源**：用一次实时查询确定「我的设备」，一切状态从它派生。
2. **绑定归属明确**：由 spawn 的一方（EmulatorManager）产出 serial，使用的一方（AdbBridge）被告知 serial、不再自己发现。一个字段记录「serial ↔ 我 spawn 的进程」的对应关系。
3. **分层防御**：预防（不产生两个实例）→ 探测（定期校验）→ 恢复（失败自愈），不依赖任何单一环节。

### 1. 绑定：stdout 自报为主，差集为辅，AVD 消歧

emulator 进程启动时会把 console port / serial 打到 stdout。**优先解析 CCLink Studio spawn 的那个子进程的 stdout 拿 serial**——这是直接归属，无竞态、无需消歧。

差集（spawn 前后对 `adb devices` 求差）只作兜底，且必须满足消歧规则：
- 只认 `emulator-` 前缀的 serial，排除 USB 真机等；
- 若差集里仍出现多个 emulator serial，按 AVD 身份匹配（同一个 AVD 同一时刻只应有一个 console），仍无法确定则判定启动失败，**不认领**。

绑定结果写入 EmulatorManager，再下发给 AdbBridge。**永远不再用「取 `adb devices` 第一行」。**

### 2. 派生：所有 adb/scrcpy 操作都用绑定的 serial

移除「开机抓一次、之后只读缓存」的 `getDeviceId()`。连接、重试、点击、shell 全部走绑定值。绑定值的刷新只由第 4 点的自愈触发，不被普通操作改动。

### 3. 校验：定期 reconcile，设备在线为权威信号

每隔几秒检查：
- **权威信号**：绑定的 serial 是否仍在 `adb devices` 且状态为 `device`；
- 辅助信号：`this.process` 是否仍活着（因存在 launcher/qemu 分裂，进程活着 ≠ 设备活着，故只作辅助）。

权威信号判定不在线时，**不立即翻 `stopped`**，先连续确认 N 次（迟滞，避免设备短暂 `offline` 时抖动断连）。确认后翻 `stopped`、断开 scrcpy、通知渲染层。这一条让「外部 kill、崩溃、设备掉线」全部能被发现，不再唯一依赖 `exit` 事件。

### 4. 自愈：失败先 reconcile，重绑必须是同一逻辑模拟器

任何 adb/scrcpy 操作报 `device not found / offline` 时：
1. 先按第 3 点 reconcile；
2. 若 serial 仍可恢复（短暂掉线后回来），重试原操作；
3. 若 serial 确实没了，**按 AVD 身份重新查找当前在线的对应 serial**（不是「随便一个在线设备」），找到则重绑并重试；
4. 找不到则判定不可恢复 → `stopped`/`error`，向用户报错。

**关键约束**：重绑必须按 AVD 身份匹配，绝不能落到「第一个在线设备」，否则就是把原始「抓错设备」bug 以新形式复活。

### 5. 入口收敛 + 启动前检查（不收养外来进程）

- 启动前若 `adb devices` 已有同 AVD 的设备：**二选一**——要么拒绝启动并提示用户先停止已有的，要么显式杀掉再起新的并完全拥有它。**不要「接管/收养」CCLink Studio 没 spawn 的进程**（收养后 `terminate()` 杀不掉、状态归属说不清）。
- 当前 [`cleanupStaleFiles`](../../src/main/android/emulator-manager.ts#L393) 会删 lock 文件后硬起第二个，反而促成两实例共存，需改为：lock 存在且对应进程存活时，走上面的二选一，而不是删 lock。
- `terminate()` 杀「我启动出来的设备」整体：主手段用 `adb emu kill`（现有 terminate 已有，之前失败/被跳过），进程组 kill（`detached: true` + `kill(-pgid)`）作兜底，确保 launcher 和 qemu 子进程都退出。

## 覆盖矩阵

| 实际情况 | 被哪条覆盖 |
|---|---|
| 正常单实例 | 1 + 2，绑定正确 |
| 存在上次遗留的孤儿进程 | 1（stdout 归属）+ 5（启动前检查） |
| Agent / 用户外部 `kill` 了进程 | 3，reconcile 发现设备消失 → 翻 `stopped` |
| 设备 serial 变了或短暂掉线 | 3（迟滞）+ 4（AVD 感知重绑） |
| 开机抓错设备（本次 bug） | 1，stdout/差集取代「第一行」 |
| 启动时同时有真机/其他 emulator 上线 | 1，`emulator-` 前缀 + AVD 消歧 |

**关键点**：有了 3 和 4，Agent 怎么用裸 `kill` 都无所谓——系统会自己发现并修正，不依赖 Agent 守规矩。正确性建立在「实时查现实」上，而非「谁都不许绕过我的 API」上。

## 细化实现方案

> 下面的 TS 伪代码描述改动形状，非最终实现。所有 adb 调用仍走参数数组（`execAdb`），不经 shell 解析。

### A. 绑定记录与归属：EmulatorManager 拥有，AdbBridge 消费

```ts
// emulator-manager.ts
class EmulatorManager {
  private process: ChildProcess | null = null
  private serial: string | null = null        // 新增：绑定的 serial
  private avdName: string | null = null
  private state: EmulatorState = 'stopped'
  private reconcileTimer: NodeJS.Timeout | null = null
  private missCount = 0
  getSerial(): string | null { return this.serial }
}

// adb-bridge.ts —— 移除独立发现，改为被动接收
class AdbBridge {
  private serial: string | null = null        // 由 EmulatorManager 下发
  private avdName: string | null = null        // 自愈重绑需要
  setSerial(serial: string | null, avdName: string | null): void { /* … */ }
  clearSerial(): void { this.serial = null }
  getDeviceId(): string | null { return this.serial }  // 保留签名，返回绑定值
}
```

绑定时机：`spawnAndWait` 解析出 serial 后，`this.serial = ...` 并 `adbBridge.setSerial(serial, avdName)`。`terminate`/`handleDeviceLost` 时 `clearSerial()`。

### B. serial 解析（stdout → AVD 身份匹配 → 失败，永不取第一行）

AdbBridge 新增辅助方法（均走参数数组）：

```ts
listOnlineEmulators(): Promise<string[]>         // adb devices 中 emulator-* 且状态 device
isSerialOnline(serial): Promise<boolean>         // 指定 serial 是否在线（reconcile 权威信号）
findSerialByAvd(avdName): Promise<string | null> // 遍历 emulator-*，adb -s <s> emu avd name 匹配
waitForSerial(serial, timeoutMs): Promise<void>  // 轮询直到指定 serial 上线
waitForSerialGone(serial, timeoutMs): Promise<void>
```

`spawnAndWait` 解析流程：

1. spawn 前 `before = listOnlineEmulators()`；
2. spawn 后解析子进程 stdout，正则抓 console port（如 `/console.*?(\d{4,5})/`）→ 候选 `emulator-<port>`，确认它在线即用；
3. stdout 无信号 → 轮询 `listOnlineEmulators()`，对 `before` 之外的新设备用 `findSerialByAvd(avdName)` 匹配，命中即用；
4. 超时未确定 → 启动失败，**不认领任何设备**。

`waitForDevice()` 改为 `waitForSerial(this.serial)`；`waitForBoot()` 的 shell 走绑定 serial。

### C. 定期 reconcile（设备在线为权威，连续 N 次丢失才判死）

```ts
private static RECONCILE_MS = 5000
private static MISS_THRESHOLD = 3               // ~15s 连续不在线才判丢失（防抖动）

private startReconcile(): void { this.stopReconcile(); this.missCount = 0
  this.reconcileTimer = setInterval(() => this.reconcile().catch(() => {}), RECONCILE_MS) }
private stopReconcile(): void { /* clear timer */ }

private async reconcile(): Promise<void> {
  if (this.state !== 'running' || !this.serial) return
  if (await this.adbBridge.isSerialOnline(this.serial)) { this.missCount = 0; return }
  if (++this.missCount < MISS_THRESHOLD) return
  await this.handleDeviceLost()
}
private async handleDeviceLost(): Promise<void> {
  this.stopReconcile(); this.serial = null; this.process = null
  this.adbBridge.clearSerial(); await this.scrcpyBridge?.disconnect()
  this.setState('stopped'); mainWindow.send('android:deviceLost', { reason: 'device gone' })
}
```

`launch()` 成功后 `startReconcile()`；`terminate()`/`destroy()` 里 `stopReconcile()`。`this.process` 的 exit 保留为快速通道（进程自退出立刻 stopped）。

### D. 自愈（失败 → AVD 身份重绑 → 重试一次，绝不认领任意设备）

把 `execAdb` 改成带自愈：

```ts
private async execAdb(args, opts?): Promise<AdbResult> {
  try { return await this.rawExec(args, opts) }
  catch (err) {
    if (!this.serial || !this.avdName || !this.isDeviceGone(err)) throw err
    const rebound = await this.findSerialByAvd(this.avdName)   // AVD 身份重绑
    if (!rebound) throw err
    this.serial = rebound; emulatorManager.syncSerial(rebound) // 绑定两边同步
    return await this.rawExec(args, opts)                      // 重试一次
  }
}
```

`isDeviceGone(err)` 匹配 `device '...' not found` / `device offline` / `device not found`。重绑必须按 AVD，找不到就让错误冒泡，由 reconcile 翻 `stopped`。

### E. 渲染层重试 → 走主进程 reconnect（不再裸拿 getDeviceId）

新增 IPC `android:reconnect`：

```ts
'android:reconnect': async () => {
  await emulatorManager.reconcileNow()        // 立即校验 + 必要时 AVD 重绑
  const serial = emulatorManager.getSerial()
  if (!serial) throw new Error('设备不可用，请重启模拟器')
  await scrcpyBridge.connect(serial)
}
```

AndroidDisplay「重试」按钮改调 `android:reconnect`。新增事件 `android:deviceLost`：收到后显示「设备已断开，点重连」，而非裸 error。

### F. 启动前检查（拒绝，不收养外来进程）

```ts
async launch(avdName): Promise<void> {
  // …既有的 booting/running 守卫…
  const existing = await this.adbBridge.findSerialByAvd(avdName)
  if (existing) throw new Error(`AVD ${avdName} 已在运行 (${existing})，请先停止`)
  // …spawn…
}
```

`cleanupStaleFiles` 改为：仅当 `findSerialByAvd(avdName)` 返回 null（无在线实例）时才删 lock；否则抛冲突，**不删 lock、不硬起第二个**。

> 显式的、用户点「停止」触发的 `terminate()` 允许按 serial 杀（`adb emu kill`）来清掉遗留实例——要避免的是**静默收养**，不是用户主动清理。

### G. terminate() 按 serial 杀，并修一个现有 latent bug

**现状 bug**：`terminate()` 调 `adbBridge.shell('emu kill')`，实际执行 `adb -s X shell emu kill`——把 `emu kill` 当**Android guest shell 命令**跑，根本没发到 emulator 控制台。graceful 路径一直无效，才退回 SIGTERM（且只杀进程句柄，杀不到 qemu）。控制台命令应是 `adb -s <serial> emu kill`（`emu`，不是 `shell emu`）。

```ts
async terminate(): Promise<void> {
  this.stopReconcile()
  if (this.serial) {                                         // 主：控制台命令
    try { await this.adbBridge.execAdb(['emu', 'kill']) } catch {}
    await this.adbBridge.waitForSerialGone(this.serial, 10000)
  }
  if (this.process) await this.forceKillProcess()            // 兜底：进程组 kill
  this.serial = null; this.process = null
  this.adbBridge.clearSerial(); await this.scrcpyBridge?.disconnect()
  this.setState('stopped')
}
```

配套：`spawnAndWait` 的 spawn 改 `detached: true`，`forceKillProcess` 用 `process.kill(-child.pid)` 杀整个进程组（含 qemu）。

### H. 渲染兜底

Sidebar.`handleTerminate`：调 `terminate()` 后立即 `setEmulatorState('stopped')`（防 `stateChanged` 事件丢失），失败再回滚。

### I. 常量

`RECONCILE_MS = 5000`、`MISS_THRESHOLD = 3`，`waitForSerial`/`waitForBoot` 超时沿用现有值。

## 实现约束（动手前要预期的摩擦）

- **进程树清理**：macOS 上 `child.kill` 杀不到孙进程（qemu）。`adb emu kill` 为主，进程组 kill 为辅，二者都要有。
- **adb I/O 成本**：周期性 `adb devices` 会反复 spawn adb 进程，adb server 不稳时反而引入延迟。优先复用一条长连，或用 `@yume-chan` 的设备列表变更通知，避免每次新起进程。
- **绑定归属**：必须新增一个「serial ↔ 我 spawn 的进程」的对应记录，由 EmulatorManager 拥有，AdbBridge 只消费。移除 AdbBridge 的独立发现路径。
- **迟滞参数**：reconcile 的「连续 N 次不在线才判 stopped」需要可调，避免在高负载机器上误判。
- **验证方式**：bug 本质是状态机，建议对 reconcile/绑定/自愈的状态转移写单元测试，覆盖「孤儿存在」「外部 kill」「短暂 offline」等场景。

## 涉及文件

| 文件 | 改动 |
|------|------|
| [`emulator-manager.ts`](../../src/main/android/emulator-manager.ts) | stdout/差集绑定 + 定期 reconcile + 启动前检查（不删 lock 硬起）+ `terminate()` 杀干净；持有「serial ↔ 进程」绑定 |
| [`adb-bridge.ts`](../../src/main/android/adb-bridge.ts) | 接收 EmulatorManager 下发的 serial，移除一次性缓存 `deviceId` 与独立发现；操作前校验、失败触发自愈 |
| [`AndroidDisplay.tsx`](../../src/renderer/src/components/workbench/AndroidDisplay.tsx) | 重试走主进程 reconcile（不再直接拿 `getDeviceId()`） |
| [`scrcpy-bridge.ts`](../../src/main/android/scrcpy-bridge.ts) | `connect` 前校验设备存在（主进程已校验则免） |
| [`Sidebar.tsx`](../../src/renderer/src/components/sidebar/Sidebar.tsx) | `handleTerminate` 调用后兜底置 `stopped`（防 IPC 事件丢失） |
