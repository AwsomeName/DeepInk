import { create } from 'zustand'
import type { ChatccIdentity, ChatccMessage, ChatccServer, ChatccSession } from '@shared/chatcc'
import type { CclinkLegacyImportPreflight, CclinkRealtimeStatus, CclinkRemoteError } from '@shared/ipc/cclink'

const CCLINK_ARCHIVE_STORAGE_KEY = 'deepink-cclink-archived-sessions'

function describeCclinkError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  const cleaned = raw
    .replace(/^Error invoking remote method 'cclink:[^']+': Error:\s*/u, '')
    .replace(/^Error:\s*/u, '')
  if (cleaned.includes('旧 CCLink 云函数同步服务器失败') && cleaned.includes('USER_NOT_FOUND')) {
    return '当前身份不是旧 CCLink 历史账号：它可能是 DeepInk 新建身份。请先点“移除”，再用“导入旧 CCLink 账号”发送验证码并导入。'
  }
  return cleaned
}

function loadArchivedSessionIds(): Record<string, number> {
  try {
    if (typeof localStorage === 'undefined') return {}
    const parsed = JSON.parse(localStorage.getItem(CCLINK_ARCHIVE_STORAGE_KEY) ?? '{}')
    if (!parsed || typeof parsed !== 'object') return {}
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, number] => {
        const [sessionId, archivedAt] = entry
        return typeof sessionId === 'string' && typeof archivedAt === 'number'
      }),
    )
  } catch {
    return {}
  }
}

function saveArchivedSessionIds(value: Record<string, number>): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(CCLINK_ARCHIVE_STORAGE_KEY, JSON.stringify(value))
  } catch {
    // localStorage 可能不可用，忽略本地视图归档失败。
  }
}

interface CclinkState {
  identity: ChatccIdentity | null
  servers: ChatccServer[]
  sessions: ChatccSession[]
  archivedSessionIds: Record<string, number>
  messages: Record<string, ChatccMessage[]>
  realtimeStatus: CclinkRealtimeStatus
  legacyPreflight: CclinkLegacyImportPreflight | null
  loading: boolean
  identityLoading: boolean
  preflightLoading: boolean
  realtimeLoading: boolean
  error: string | null
  remoteError: CclinkRemoteError | null

  load: () => Promise<void>
  preflightLegacyImport: () => Promise<CclinkLegacyImportPreflight | null>
  ensureIdentity: () => Promise<void>
  sendLegacySmsCode: () => Promise<void>
  importLegacyIdentity: (smsCode: string) => Promise<void>
  clearIdentity: () => Promise<void>
  syncPairedAgents: () => Promise<void>
  loadRealtimeStatus: () => Promise<void>
  connectRealtime: () => Promise<void>
  disconnectRealtime: () => Promise<void>
  loadMessages: (sessionId: string) => Promise<void>
  sendLocalMessage: (sessionId: string, content: string) => Promise<void>
  archiveSession: (sessionId: string) => void
  restoreArchivedSession: (sessionId: string) => void
  seedDemoData: () => Promise<void>
  clearLocalData: () => Promise<void>
}

export const useCclinkStore = create<CclinkState>((set, get) => ({
  identity: null,
  servers: [],
  sessions: [],
  archivedSessionIds: loadArchivedSessionIds(),
  messages: {},
  realtimeStatus: { state: 'idle' },
  legacyPreflight: null,
  loading: false,
  identityLoading: false,
  preflightLoading: false,
  realtimeLoading: false,
  error: null,
  remoteError: null,

  load: async () => {
    set({ loading: true, error: null, remoteError: null })
    try {
      const [state, identity, realtimeStatus] = await Promise.all([
        window.deepink.cclink.getState(),
        window.deepink.cclink.getIdentity(),
        window.deepink.cclink.getRealtimeStatus(),
      ])
      set({
        identity,
        servers: state.servers,
        sessions: state.sessions,
        messages: state.messages,
        realtimeStatus,
        loading: false,
      })
    } catch (err) {
      set({ error: describeCclinkError(err), remoteError: null, loading: false })
    }
  },

  preflightLegacyImport: async () => {
    set({ preflightLoading: true, error: null, remoteError: null })
    try {
      const legacyPreflight = await window.deepink.cclink.preflightLegacyImport()
      set({ legacyPreflight, preflightLoading: false })
      return legacyPreflight
    } catch (err) {
      set({ error: describeCclinkError(err), remoteError: null, legacyPreflight: null, preflightLoading: false })
      return null
    }
  },

  ensureIdentity: async () => {
    set({ identityLoading: true, error: null, remoteError: null })
    try {
      const identity = await window.deepink.cclink.ensureIdentity()
      set({ identity, identityLoading: false })
      await get().syncPairedAgents()
    } catch (err) {
      set({ error: describeCclinkError(err), remoteError: null, identityLoading: false })
    }
  },

  sendLegacySmsCode: async () => {
    set({ identityLoading: true, error: null, remoteError: null })
    try {
      await window.deepink.cclink.sendLegacySmsCode()
      set({ identityLoading: false })
    } catch (err) {
      set({ error: describeCclinkError(err), remoteError: null, identityLoading: false })
    }
  },

  importLegacyIdentity: async (smsCode) => {
    set({ identityLoading: true, error: null, remoteError: null })
    try {
      const identity = await window.deepink.cclink.importLegacyIdentity(smsCode)
      set({ identity, identityLoading: false })
      await get().syncPairedAgents()
    } catch (err) {
      set({ error: describeCclinkError(err), remoteError: null, identityLoading: false })
    }
  },

  clearIdentity: async () => {
    await window.deepink.cclink.clearIdentity()
    set({ identity: null, error: null, remoteError: null, legacyPreflight: null })
  },

  syncPairedAgents: async () => {
    set({ loading: true, error: null, remoteError: null })
    try {
      const servers = await window.deepink.cclink.syncPairedAgents()
      set({ servers, loading: false })
    } catch (err) {
      set({ error: describeCclinkError(err), remoteError: null, loading: false })
    }
  },

  loadRealtimeStatus: async () => {
    try {
      const realtimeStatus = await window.deepink.cclink.getRealtimeStatus()
      set({ realtimeStatus })
    } catch (err) {
      set({ error: describeCclinkError(err), remoteError: null })
    }
  },

  connectRealtime: async () => {
    set({ realtimeLoading: true, error: null, remoteError: null })
    try {
      const realtimeStatus = await window.deepink.cclink.connectRealtime()
      set({ realtimeStatus, realtimeLoading: false })
      await get().load()
    } catch (err) {
      set({ error: describeCclinkError(err), remoteError: null, realtimeLoading: false })
    }
  },

  disconnectRealtime: async () => {
    set({ realtimeLoading: true, error: null, remoteError: null })
    try {
      const realtimeStatus = await window.deepink.cclink.disconnectRealtime()
      set({ realtimeStatus, realtimeLoading: false })
    } catch (err) {
      set({ error: describeCclinkError(err), remoteError: null, realtimeLoading: false })
    }
  },

  loadMessages: async (sessionId) => {
    try {
      const messages = await window.deepink.cclink.listMessages(sessionId)
      set({
        messages: {
          ...get().messages,
          [sessionId]: messages,
        },
      })
    } catch (err) {
      set({ error: describeCclinkError(err), remoteError: null })
      throw err
    }
  },

  sendLocalMessage: async (sessionId, content) => {
    try {
      const result = await window.deepink.cclink.sendLocalMessage(sessionId, content)
      if (!result.success) {
        const message = result.error || '远程会话发送失败'
        set({ error: message, remoteError: result.remoteError ?? null })
        throw new Error(message)
      }
      const messages = result.messages ?? []
      set({
        messages: {
          ...get().messages,
          [sessionId]: messages,
        },
        error: null,
        remoteError: null,
      })
      await get().load()
    } catch (err) {
      if (!get().remoteError) {
        set({ error: describeCclinkError(err), remoteError: null })
      }
      throw err
    }
  },

  archiveSession: (sessionId) => {
    set((state) => {
      const archivedSessionIds = {
        ...state.archivedSessionIds,
        [sessionId]: Date.now(),
      }
      saveArchivedSessionIds(archivedSessionIds)
      return { archivedSessionIds }
    })
  },

  restoreArchivedSession: (sessionId) => {
    set((state) => {
      const { [sessionId]: _removed, ...archivedSessionIds } = state.archivedSessionIds
      saveArchivedSessionIds(archivedSessionIds)
      return { archivedSessionIds }
    })
  },

  seedDemoData: async () => {
    await window.deepink.cclink.seedDemoData()
    await get().load()
  },

  clearLocalData: async () => {
    await window.deepink.cclink.clearLocalData()
    saveArchivedSessionIds({})
    set({ servers: [], sessions: [], archivedSessionIds: {}, messages: {}, error: null, remoteError: null })
  },
}))
