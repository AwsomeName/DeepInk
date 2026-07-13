/**
 * 同步状态管理 Store
 *
 * 管理 WebDAV 云同步的配置、状态和用户交互。
 * IPC 事件监听在 loadConfig 中注册，不依赖组件生命周期。
 */

import { create } from 'zustand'
import type { SyncConfig, SyncStatus, SyncResult, SyncHistoryEntry } from '@shared/ipc/sync'

/** 设置表单数据 */
export interface SyncFormData {
  label: string
  provider: 'jianguoyun' | 'generic'
  serverUrl: string
  username: string
  password: string
  remotePath: string
  /** 选择性同步：要同步的一级子目录名列表 */
  includePaths: string[]
  /** 自动同步间隔（分钟），0 = 禁用 */
  autoSyncInterval: number
  /** 文件保存后自动上传 */
  autoUploadOnSave: boolean
  /** 启动时自动拉取 */
  syncOnStartup: boolean
}

interface SyncState {
  /** 当前同步配置 */
  config: SyncConfig | null
  /** 同步状态 */
  status: SyncStatus
  /** 是否正在加载配置 */
  loading: boolean
  /** 设置表单数据 */
  formData: SyncFormData
  /** 连接测试结果 */
  testResult: { success: boolean; error?: string } | null
  /** 是否正在测试连接 */
  testing: boolean
  /** 同步历史记录 */
  history: SyncHistoryEntry[]

  // --- Actions ---
  /** 加载配置 + 注册 IPC 事件监听（应用启动时调用一次） */
  loadConfig: () => Promise<void>
  /** 更新表单数据 */
  setFormData: (data: Partial<SyncFormData>) => void
  /** 保存配置 */
  saveConfig: () => Promise<boolean>
  /** 删除配置（断开连接） */
  deleteConfig: () => Promise<void>
  /** 测试连接 */
  testConnection: () => Promise<void>
  /** 触发同步 */
  triggerSync: (workspacePath: string) => Promise<void>
  /** 启动自动同步 */
  startAutoSync: (workspacePath: string) => Promise<void>
  /** 停止自动同步 */
  stopAutoSync: () => Promise<void>
  /** 加载同步历史 */
  loadHistory: () => Promise<void>
  /** 清空同步历史 */
  clearHistory: () => Promise<void>
}

const defaultStatus: SyncStatus = {
  phase: 'idle',
  message: '',
  totalFiles: 0,
  processedFiles: 0,
  lastResult: null,
  error: null,
}

const defaultFormData: SyncFormData = {
  label: '',
  provider: 'jianguoyun',
  serverUrl: 'https://dav.jianguoyun.com/dav/',
  username: '',
  password: '',
  remotePath: '/DeepInk/',
  includePaths: [],
  autoSyncInterval: 0,
  autoUploadOnSave: false,
  syncOnStartup: false,
}

/** 标记是否已注册 IPC 监听（防止重复注册） */
let listenersRegistered = false

export const useSyncStore = create<SyncState>((set, get) => ({
  config: null,
  status: defaultStatus,
  loading: true,
  formData: { ...defaultFormData },
  testResult: null,
  testing: false,
  history: [],

  loadConfig: async () => {
    try {
      const config = await window.deepink.sync.getConfig()
      set({
        config,
        loading: false,
        // 从已保存的配置同步表单字段
        formData: config
          ? {
              ...get().formData,
              includePaths: config.includePaths ?? [],
              autoSyncInterval: config.autoSyncInterval ?? 0,
              autoUploadOnSave: config.autoUploadOnSave ?? false,
              syncOnStartup: config.syncOnStartup ?? false,
              // 允许已连接视图编辑这些字段
              remotePath: config.remotePath,
              serverUrl: config.serverUrl,
            }
          : get().formData,
      })
      void get().loadHistory()
    } catch {
      set({ loading: false })
    }

    // 注册 IPC 事件监听（仅一次）
    if (!listenersRegistered) {
      listenersRegistered = true
      window.deepink.sync.onStatusChanged((status: SyncStatus) => {
        set({ status })
      })
      window.deepink.sync.onSyncComplete((data: { result: SyncResult; status: SyncStatus }) => {
        set({ status: data.status })
        // 同步完成后刷新历史
        get().loadHistory()
      })
    }
  },

  setFormData: (data) => {
    set((state) => {
      const newFormData = { ...state.formData, ...data }
      // 切换 provider 时自动填充 URL
      if (data.provider === 'jianguoyun') {
        newFormData.serverUrl = 'https://dav.jianguoyun.com/dav/'
        newFormData.remotePath = '/DeepInk/'
      }
      return { formData: newFormData }
    })
  },

  saveConfig: async () => {
    const { formData } = get()
    const config: SyncConfig = {
      id: get().config?.id ?? crypto.randomUUID(),
      label: formData.label || (formData.provider === 'jianguoyun' ? '坚果云' : 'WebDAV'),
      provider: formData.provider,
      serverUrl: formData.serverUrl,
      username: formData.username,
      remotePath: formData.remotePath,
      enabled: true,
      includePaths: formData.includePaths,
      autoSyncInterval: formData.autoSyncInterval,
      autoUploadOnSave: formData.autoUploadOnSave,
      syncOnStartup: formData.syncOnStartup,
    }
    // 已连接时 password 可能为空（用户未重新输入），此时不传密码避免覆盖存储中的真实凭据
    const password = formData.password || undefined
    const result = await window.deepink.sync.saveConfig(config, password as string)
    if (result.success) {
      set({ config, testResult: null })
      return true
    }
    set({ testResult: result })
    return false
  },

  deleteConfig: async () => {
    await window.deepink.sync.stopAutoSync()
    await window.deepink.sync.deleteConfig()
    set({
      config: null,
      status: defaultStatus,
      formData: { ...defaultFormData },
      testResult: null,
    })
  },

  testConnection: async () => {
    const { formData } = get()
    set({ testing: true, testResult: null })

    const config: SyncConfig = {
      id: 'test',
      label: '',
      provider: formData.provider,
      serverUrl: formData.serverUrl,
      username: formData.username,
      remotePath: formData.remotePath,
      enabled: true,
      includePaths: formData.includePaths,
      autoSyncInterval: formData.autoSyncInterval,
      autoUploadOnSave: formData.autoUploadOnSave,
      syncOnStartup: formData.syncOnStartup,
    }

    const result = await window.deepink.sync.testConnection(config, formData.password)
    set({ testing: false, testResult: result })
  },

  triggerSync: async (workspacePath: string) => {
    if (!workspacePath) {
      set({ status: { ...get().status, phase: 'error', error: '未打开工作空间' } })
      return
    }
    const result = await window.deepink.sync.triggerSync(workspacePath)
    if (!result.success) {
      set({ status: { ...get().status, phase: 'error', error: result.error ?? '同步失败' } })
    } else if (result.result) {
      // 用 IPC 返回值直接更新状态（不依赖异步事件）
      set({ status: { ...get().status, phase: 'done', lastResult: result.result } })
    }
  },

  startAutoSync: async (workspacePath: string) => {
    await window.deepink.sync.startAutoSync(workspacePath)
  },

  stopAutoSync: async () => {
    await window.deepink.sync.stopAutoSync()
  },

  loadHistory: async () => {
    try {
      const result = await window.deepink.sync.getHistory(50)
      if (result.success) {
        set({ history: result.entries })
      }
    } catch {
      // 历史加载失败不影响主流程
    }
  },

  clearHistory: async () => {
    await window.deepink.sync.clearHistory()
    set({ history: [] })
  },
}))
