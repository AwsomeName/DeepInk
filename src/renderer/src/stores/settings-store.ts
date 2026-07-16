/**
 * SettingsStore — 应用设置 Zustand store
 *
 * 通过 IPC 与主进程 SettingsService 通信，管理应用设置的读取和写入。
 */

import { create } from 'zustand'
import type { AppSettings } from '@shared/ipc/settings'
import { DEFAULT_SETTINGS } from '@shared/ipc/settings'

type AppSettingKey = Extract<keyof AppSettings, string>

interface SettingsState {
  /** 当前设置 */
  settings: AppSettings
  /** 是否正在加载 */
  loading: boolean
  /** 最近一次操作错误 */
  error: string | null

  /** 从主进程加载设置 */
  loadSettings: () => Promise<void>
  /** 更新部分设置 */
  updateSettings: (partial: Partial<AppSettings>) => Promise<boolean>
  /** 恢复默认设置 */
  resetSettings: () => Promise<void>
  /** 重置单个设置到默认值 */
  resetSetting: (key: AppSettingKey) => Promise<boolean>
  /** 清除错误 */
  clearError: () => void
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: { ...DEFAULT_SETTINGS },
  loading: true,
  error: null,

  loadSettings: async () => {
    try {
      const settings = await window.cclinkStudio.settings.getAll()
      set({ settings, loading: false, error: null })
    } catch (err) {
      console.error('[SettingsStore] 加载设置失败:', err)
      set({ loading: false, error: String(err) })
    }
  },

  updateSettings: async (partial) => {
    try {
      const result = await window.cclinkStudio.settings.set(partial)
      if (result.success && result.settings) {
        set({ settings: result.settings, error: null })
        return true
      }
      set({ error: result.error ?? '未知错误' })
      return false
    } catch (err) {
      console.error('[SettingsStore] 更新设置失败:', err)
      set({ error: String(err) })
      return false
    }
  },

  resetSettings: async () => {
    try {
      const result = await window.cclinkStudio.settings.reset()
      if (result.success && result.settings) {
        set({ settings: result.settings, error: null })
        return
      }
      set({ error: result.error ?? '未知错误' })
    } catch (err) {
      console.error('[SettingsStore] 重置设置失败:', err)
      set({ error: String(err) })
    }
  },

  resetSetting: async (key) => {
    try {
      const result = await window.cclinkStudio.settings.resetKey(key)
      if (result.success && result.settings) {
        set({ settings: result.settings, error: null })
        return true
      }
      set({ error: result.error ?? '未知错误' })
      return false
    } catch (err) {
      console.error('[SettingsStore] 单项重置失败:', err)
      set({ error: String(err) })
      return false
    }
  },

  clearError: () => set({ error: null }),
}))
