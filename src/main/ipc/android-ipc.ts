import { ipcMain, BrowserWindow } from 'electron'
import { EmulatorManager } from '../android/emulator-manager'
import { AdbBridge } from '../android/adb-bridge'
import { ScrcpyBridge } from '../android/scrcpy-bridge'
import { ActiveDeviceManager } from '../android/active-device-manager'
import { PhysicalDeviceManager } from '../android/physical-device-manager'
import {
  getSetupStatus,
  fullSetup,
  isAdbInstalled,
  getAdbPath,
  getLicense,
  isLicenseAccepted,
  acceptLicense,
} from '../android/sdk-setup'
import { executeAndroidAction } from '../android/android-actions'
import { ensureStoreInstalled } from '../android/store-installer'

/**
 * 注册 Android 相关的 IPC 处理器（模拟器 + 物理真机）
 * 对标 ipc/browser-ipc.ts
 */
export function registerAndroidIpc(
  emulatorManager: EmulatorManager,
  adbBridge: AdbBridge,
  mainWindow: BrowserWindow,
  scrcpyBridge: ScrcpyBridge,
  activeDeviceManager: ActiveDeviceManager,
  physicalDeviceManager: PhysicalDeviceManager,
): void {
  // ─── SDK 设置（一键安装） ───

  /** 获取安装状态 */
  ipcMain.handle('android:getSetupStatus', () => {
    return getSetupStatus()
  })

  /** 获取需用户同意的 Android SDK License 正文 */
  ipcMain.handle('android:getLicense', async () => {
    try {
      return await getLicense()
    } catch (err: any) {
      return { id: 'android-sdk-license', text: `无法获取协议正文：${err.message}` }
    }
  })

  /** 记录用户已接受 License */
  ipcMain.handle('android:acceptLicense', () => {
    acceptLicense()
    return { success: true }
  })

  /** 一键安装：下载 adb + emulator + 系统镜像 + 创建默认 AVD */
  ipcMain.handle('android:setup', async () => {
    // 安装前必须已接受 License（emulator/系统镜像受其约束）
    if (!isLicenseAccepted()) {
      return { success: false, error: '请先阅读并同意 Android SDK 许可协议' }
    }
    try {
      const result = await fullSetup({
        onProgress: (step, progress) => {
          // 通过 IPC 推送进度到渲染进程
          if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send('android:setupProgress', { step, progress })
          }
        },
      })

      // 安装完成后，让 AdbBridge 使用新安装的 adb
      if (isAdbInstalled()) {
        adbBridge.setAdbPath(getAdbPath())
      }

      return { success: true, adbPath: result.adbPath, avdName: result.avdName }
    } catch (err: any) {
      console.error('[AndroidIpc] 设置失败:', err)
      return { success: false, error: err.message }
    }
  })

  // ─── 模拟器生命周期 ───

  /** 列出可用 AVD */
  ipcMain.handle('android:listAvds', async () => {
    return await emulatorManager.listAvds()
  })

  /** 启动 AVD */
  ipcMain.handle('android:launch', async (_event, avdName: string) => {
    await emulatorManager.launch(avdName)
  })

  /** 停止模拟器 */
  ipcMain.handle('android:terminate', async () => {
    await emulatorManager.terminate()
  })

  /** 获取模拟器状态 */
  ipcMain.handle('android:getState', () => {
    return emulatorManager.getState()
  })

  // ─── ADB 操控（通过共享 Action Executor） ───

  /** 获取 deviceId（scrcpy 连接需要） */
  ipcMain.handle('android:getDeviceId', () => {
    return adbBridge.getDeviceId()
  })

  /** 点击 */
  ipcMain.handle('android:tap', async (_event, x: number, y: number) => {
    return executeAndroidAction(adbBridge, { type: 'tap', x, y })
  })

  /** 滑动 */
  ipcMain.handle(
    'android:swipe',
    async (_event, x1: number, y1: number, x2: number, y2: number, duration?: number) => {
      return executeAndroidAction(adbBridge, { type: 'swipe', x1, y1, x2, y2, duration })
    },
  )

  /** 按键 */
  ipcMain.handle('android:pressKey', async (_event, key: string) => {
    return executeAndroidAction(adbBridge, { type: 'pressKey', key })
  })

  /** 输入文本（优先 scrcpy 通道，支持中文） */
  ipcMain.handle('android:typeText', async (_event, text: string) => {
    return executeAndroidAction(adbBridge, { type: 'typeText', text }, scrcpyBridge)
  })

  /** 截图 */
  ipcMain.handle('android:screenshot', async () => {
    return executeAndroidAction(adbBridge, { type: 'screenshot' })
  })

  /** 获取设备信息 */
  ipcMain.handle('android:getDeviceInfo', async () => {
    return executeAndroidAction(adbBridge, { type: 'deviceInfo' })
  })

  /** 列出已安装应用 */
  ipcMain.handle('android:listPackages', async (_event, filter?: string) => {
    return executeAndroidAction(adbBridge, { type: 'listPackages', filter })
  })

  // ─── 新增：缺失的 IPC Handler ───

  /** 导出 UI 层级 XML */
  ipcMain.handle('android:dumpUi', async () => {
    return executeAndroidAction(adbBridge, { type: 'dumpUi' })
  })

  /** 安装 APK */
  ipcMain.handle('android:installApk', async (_event, path: string) => {
    return executeAndroidAction(adbBridge, { type: 'installApk', path })
  })

  /**
   * 手动重试应用商店引导安装
   *
   * 开机自检失败后，用户在 UI 点「重试」时调用；
   * 复用 ensureStoreInstalled，进度通过 android:storeInstallProgress 推送，
   * 返回最终结果（渲染进程据此更新提示）。
   */
  ipcMain.handle('android:retryStoreInstall', async () => {
    // 后台自检仍在进行时不允许并发重试
    if (emulatorManager.isStoreBootstrapInProgress()) {
      return { status: 'failed' as const, storeId: '', displayName: '', message: '商店安装正在进行中，请稍候' }
    }
    return ensureStoreInstalled(adbBridge, (msg) => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('android:storeInstallProgress', msg)
      }
    })
  })

  /** 卸载包 */
  ipcMain.handle('android:uninstallPackage', async (_event, packageName: string) => {
    return executeAndroidAction(adbBridge, { type: 'uninstallPackage', packageName })
  })

  /** 推送文件 */
  ipcMain.handle('android:pushFile', async (_event, local: string, remote: string) => {
    return executeAndroidAction(adbBridge, { type: 'pushFile', local, remote })
  })

  /** 执行 shell 命令 */
  ipcMain.handle('android:shell', async (_event, command: string) => {
    return executeAndroidAction(adbBridge, { type: 'shell', command })
  })

  // ─── 物理真机 ───

  /** 发现物理真机（非 emulator-*，含 unauthorized 便于 UI 引导授权） */
  ipcMain.handle('android:listPhysicalDevices', async () => {
    return await physicalDeviceManager.listPhysicalDevices()
  })

  /**
   * 连接物理真机
   *
   * 互斥：若模拟器正在运行/启动，先停止（释放 serial + 进程），再连接真机。
   * 连接后 activeDeviceManager 切到 physical，AgentDeviceManager / scrcpy 联动。
   */
  ipcMain.handle('android:connectPhysical', async (_event, serial: string) => {
    const state = emulatorManager.getState()
    if (state === 'running' || state === 'booting') {
      await emulatorManager.terminate()
    }
    const { deviceInfo } = await physicalDeviceManager.connect(serial)
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('android:physicalConnected', { serial, deviceInfo })
    }
    return { success: true, serial, deviceInfo }
  })

  /** 断开物理真机 */
  ipcMain.handle('android:disconnectPhysical', async () => {
    await physicalDeviceManager.disconnect()
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('android:physicalDisconnected')
    }
    return { success: true }
  })

  // ─── Scrcpy 投屏 ───

  /**
   * 重连：按当前活跃设备 source 走对应重连，再 scrcpy connect
   *
   * emulator：reconcileNow 自愈重绑（AVD 可能换端口）→ 从 emulatorManager 取最新 serial 并同步到 activeDeviceManager
   * physical：serial 不变，直接取（真机无 AVD 重绑概念）
   */
  ipcMain.handle('android:reconnect', async () => {
    const source = activeDeviceManager.getSource()
    let serial: string | null
    if (source === 'emulator') {
      await emulatorManager.reconcileNow()
      serial = emulatorManager.getSerial()
      if (serial) {
        activeDeviceManager.set(serial, 'emulator', { avdName: emulatorManager.getAvdName() ?? undefined })
      }
    } else {
      serial = activeDeviceManager.getSerial()
    }
    if (!serial) {
      throw new Error(source === 'physical' ? '真机未连接，请重新连接设备' : '设备不可用，请重启模拟器')
    }
    await scrcpyBridge.connect(serial)
  })

  /** 连接 scrcpy 投屏 */
  ipcMain.handle('scrcpy:connect', async (_event, deviceId: string) => {
    await scrcpyBridge.connect(deviceId)
  })

  /** 断开 scrcpy 投屏 */
  ipcMain.handle('scrcpy:disconnect', async () => {
    await scrcpyBridge.disconnect()
  })

  /** 触摸事件（渲染进程 → 主进程，用于注入到设备） */
  ipcMain.on('scrcpy:touch', (_event, data: { action: number; x: number; y: number; pressure: number }) => {
    scrcpyBridge.injectTouch(data.action, data.x, data.y, data.pressure).catch((err: Error) => {
      console.warn('[AndroidIpc] injectTouch 失败:', err.message)
    })
  })
}
