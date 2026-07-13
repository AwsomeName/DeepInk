/**
 * Android 操作执行器
 *
 * 从 MCP 模块和 IPC 处理器提取的共享函数，供两条路径复用。
 * 对标 playwright-actions.ts（16 种浏览器操作）。
 *
 * 支持 15 种 Android 设备操控操作。
 */

import type { AdbBridge } from './adb-bridge'
import type { ScrcpyBridge } from './scrcpy-bridge'
import { KEYCODE_MAP } from './android-constants'

/**
 * 执行单个 Android 设备操作
 *
 * @param bridge - AdbBridge 实例（已连接设备）
 * @param action - 操作指令，type 字段标识操作类型
 * @param scrcpy - 可选的 scrcpy 桥接；若已连接则 typeText 会走 scrcpy 通道
 *                 （支持中文/Unicode），否则回退到 ADB input text（仅 ASCII）
 * @returns 操作结果
 */
export async function executeAndroidAction(
  bridge: AdbBridge,
  action: { type: string; [key: string]: any },
  scrcpy?: ScrcpyBridge,
): Promise<any> {
  switch (action.type) {
    // ── 只读 ──────────────────────────────
    case 'screenshot': {
      const buffer = await bridge.screenshot()
      return { image: buffer.toString('base64'), mimeType: 'image/png' }
    }

    case 'dumpUi': {
      const xml = await bridge.dumpUi()
      return { xml }
    }

    case 'deviceInfo': {
      return await bridge.getDeviceInfo()
    }

    case 'listPackages': {
      const packages = await bridge.listPackages(action.filter)
      return { packages }
    }

    case 'currentActivity': {
      const activity = await bridge.currentActivity()
      return { activity }
    }

    // ── 操作 ──────────────────────────────
    case 'tap':
      await bridge.tap(action.x, action.y)
      return { success: true }

    case 'swipe':
      await bridge.swipe(action.x1, action.y1, action.x2, action.y2, action.duration)
      return { success: true }

    case 'pressKey': {
      const key = (action.key as string).toLowerCase()
      const keyCode = KEYCODE_MAP[key]
      if (keyCode === undefined) {
        throw new Error(`未知按键: ${key}。支持的按键: ${Object.keys(KEYCODE_MAP).join(', ')}`)
      }
      await bridge.pressKey(keyCode)
      return { success: true }
    }

    case 'typeText': {
      // 优先走 scrcpy 通道（支持中文/Unicode），不可用时回退 ADB（仅 ASCII）
      const injected = scrcpy ? await scrcpy.injectText(action.text as string) : false
      if (!injected) {
        await bridge.typeText(action.text)
      }
      return { success: true, channel: injected ? 'scrcpy' : 'adb' }
    }

    case 'launchPackage': {
      const result = await bridge.launchPackage(action.packageName)
      return { result }
    }

    case 'goHome':
      await bridge.pressKey(KEYCODE_MAP['home']!)
      return { success: true }

    // ── 写入 ──────────────────────────────
    case 'installApk': {
      const result = await bridge.installApk(action.path)
      return { result }
    }

    case 'uninstallPackage': {
      const result = await bridge.uninstallPackage(action.packageName)
      return { result }
    }

    case 'pushFile': {
      const result = await bridge.pushFile(action.local, action.remote)
      return { result }
    }

    case 'shell': {
      const { stdout } = await bridge.shell(action.command)
      return { output: stdout }
    }

    default:
      throw new Error(`未知 Android 操作类型: ${action.type}`)
  }
}

/**
 * 所有支持的 Android action type
 */
export const ANDROID_ACTION_TYPES = [
  'screenshot',
  'dumpUi',
  'deviceInfo',
  'listPackages',
  'currentActivity',
  'tap',
  'swipe',
  'pressKey',
  'typeText',
  'launchPackage',
  'goHome',
  'installApk',
  'uninstallPackage',
  'pushFile',
  'shell',
] as const

export type AndroidActionType = (typeof ANDROID_ACTION_TYPES)[number]
