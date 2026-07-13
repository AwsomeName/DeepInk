/**
 * ActiveDeviceManager —— 当前活跃设备的唯一真相源
 *
 * DeepInk 支持多种 Android 设备来源（AVD 模拟器 / 物理真机 / 未来云手机），
 * 但同一时刻只有一个「活跃设备」被 AI 控制链路（AdbBridge / AgentDeviceManager /
 * scrcpy）寻址。本类持有「当前活跃设备的 serial + source」，所有下游统一从这里
 * 取 serial，对设备来源透明。
 *
 * 互斥切换模型：切换活跃设备时，旧设备由下游 manager 自治断开（AgentDeviceManager
 * unbind session、scrcpy disconnect），本类只负责广播「serial 变了 / 没了」。
 *
 * 与 EmulatorManager 联动：构造时订阅其 onStateChanged——running 时把模拟器 serial
 * 注册为活跃设备；stopped/error 时若当前活跃正是该模拟器则清除（不误清已连接的真机）。
 */
import type { EmulatorManager } from './emulator-manager'

export type DeviceSource = 'emulator' | 'physical'

export interface ActiveDevice {
  serial: string
  source: DeviceSource
  avdName?: string
}

export class ActiveDeviceManager {
  private active: ActiveDevice | null = null
  private listeners: Array<(device: ActiveDevice | null) => void> = []
  /** EmulatorManager 状态联动取消函数 */
  private offEmulatorState: (() => void) | null = null

  constructor(emulatorManager: EmulatorManager) {
    // 订阅模拟器状态：running → 注册为活跃设备；stopped/error → 仅当当前活跃是模拟器时清除
    this.offEmulatorState = emulatorManager.onStateChanged((state) => {
      if (state === 'running') {
        const serial = emulatorManager.getSerial()
        if (serial) {
          this.set(serial, 'emulator', { avdName: emulatorManager.getAvdName() ?? undefined })
        }
      } else if (state === 'stopped' || state === 'error') {
        // 守卫：仅清除模拟器。避免 terminate 的 stopped 事件晚到时误清真机
        // （connectPhysical 流程可能先 set('physical') 再收到模拟器 stopped）。
        if (this.active?.source === 'emulator') {
          this.clear()
        }
      }
    })
  }

  /** 设置当前活跃设备（覆盖式：serial/source 变化才广播，避免重复通知） */
  set(serial: string, source: DeviceSource, meta?: { avdName?: string }): void {
    const prev = this.active
    if (prev && prev.serial === serial && prev.source === source) return
    this.active = {
      serial,
      source,
      ...(meta?.avdName ? { avdName: meta.avdName } : {}),
    }
    console.log(`[ActiveDeviceManager] 活跃设备: ${serial} (source=${source})`)
    this.emit()
  }

  /** 清除当前活跃设备 */
  clear(): void {
    if (!this.active) return
    console.log(`[ActiveDeviceManager] 清除活跃设备: ${this.active.serial}`)
    this.active = null
    this.emit()
  }

  getSerial(): string | null {
    return this.active?.serial ?? null
  }

  getSource(): DeviceSource | null {
    return this.active?.source ?? null
  }

  getActive(): ActiveDevice | null {
    return this.active
  }

  /** 注册活跃设备变化监听，返回取消函数 */
  onChanged(cb: (device: ActiveDevice | null) => void): () => void {
    this.listeners.push(cb)
    return () => {
      this.listeners = this.listeners.filter((fn) => fn !== cb)
    }
  }

  private emit(): void {
    for (const cb of this.listeners) {
      try {
        cb(this.active)
      } catch (err) {
        console.error('[ActiveDeviceManager] listener 执行失败', err)
      }
    }
  }

  destroy(): void {
    this.offEmulatorState?.()
    this.offEmulatorState = null
    this.listeners = []
    this.active = null
  }
}
