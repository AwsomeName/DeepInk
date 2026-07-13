/**
 * 云同步共享类型。
 *
 * 过渡期供 renderer/main/preload 共用；后续可并入 src/shared/ipc/sync.ts。
 */

export type WebdavProvider = 'jianguoyun' | 'generic'

export interface SyncConfig {
  id: string
  label: string
  provider: WebdavProvider
  serverUrl: string
  username: string
  remotePath: string
  enabled: boolean
  includePaths: string[]
  autoSyncInterval: number
  autoUploadOnSave: boolean
  syncOnStartup: boolean
}

export type SyncPhase =
  | 'idle'
  | 'connecting'
  | 'scanning-local'
  | 'scanning-remote'
  | 'comparing'
  | 'syncing'
  | 'done'
  | 'error'

export interface SyncStatus {
  phase: SyncPhase
  message: string
  totalFiles: number
  processedFiles: number
  lastResult: SyncResult | null
  error: string | null
}

export interface SyncResult {
  uploaded: string[]
  downloaded: string[]
  conflicts: string[]
  deleted: string[]
  skipped: string[]
  errors: Array<{ path: string; error: string }>
}

export interface SyncHistoryEntry {
  id: string
  timestamp: string
  direction: 'upload' | 'download' | 'bidirectional'
  trigger: 'manual' | 'scheduled' | 'auto-upload' | 'startup'
  summary: {
    uploaded: number
    downloaded: number
    conflicts: number
    deleted: number
    errors: number
  }
  success: boolean
  errorMessage?: string
}
