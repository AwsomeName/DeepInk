import { create } from 'zustand'
import type { AndroidDeviceInfo, PhysicalDevice } from '@shared/ipc/android'

/** 应用商店引导安装阶段 */
export type StoreInstallPhase = 'idle' | 'installing' | 'done' | 'failed'

/** 当前活跃设备类型（当前主流程只主动连接 physical 真机） */
export type DeviceMode = 'physical' | null

/** 发现的物理真机（adb，含 unauthorized 便于 UI 引导授权） */
export type PhysicalDeviceInfo = PhysicalDevice

/**
 * Android Store
 *
 * 管理 Android 设备状态。当前主流程只连接物理真机。
 */
interface AndroidState {
  /** 设备信息 */
  deviceInfo: AndroidDeviceInfo | null
  /** scrcpy 是否已连接（画面流） */
  mirrorConnected: boolean
  /** 设备屏幕分辨率 */
  screenSize: { width: number; height: number } | null
  /** 应用商店引导安装状态（提升到 store 层，避免 Tab 未挂载时漏事件） */
  storeInstall: {
    phase: StoreInstallPhase
    message?: string
  }
  /** 当前活跃设备类型（physical / null） */
  deviceMode: DeviceMode
  /** 发现的物理真机列表 */
  physicalDevices: PhysicalDeviceInfo[]

  // Actions
  setDeviceInfo: (info: AndroidState['deviceInfo']) => void
  setMirrorConnected: (connected: boolean) => void
  setScreenSize: (size: { width: number; height: number } | null) => void
  setStoreInstall: (state: { phase: StoreInstallPhase; message?: string }) => void
  setDeviceMode: (mode: DeviceMode) => void
  setPhysicalDevices: (devices: PhysicalDeviceInfo[]) => void
  reset: () => void
}

const initialState = {
  deviceInfo: null,
  mirrorConnected: false,
  screenSize: null,
  storeInstall: { phase: 'idle' as StoreInstallPhase },
  deviceMode: null as DeviceMode,
  physicalDevices: [],
}

export const useAndroidStore = create<AndroidState>((set) => ({
  ...initialState,

  setDeviceInfo: (info) => set({ deviceInfo: info }),
  setMirrorConnected: (connected) => set({ mirrorConnected: connected }),
  setScreenSize: (size) => set({ screenSize: size }),
  setStoreInstall: (storeInstall) => set({ storeInstall }),
  setDeviceMode: (mode) => set({ deviceMode: mode }),
  setPhysicalDevices: (physicalDevices) => set({ physicalDevices }),
  reset: () => set(initialState),
}))
