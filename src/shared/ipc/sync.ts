export type {
  WebdavProvider,
  SyncConfig,
  SyncPhase,
  SyncStatus,
  SyncResult,
  SyncHistoryEntry,
} from '../sync-types'

import type {
  SyncConfig,
  SyncHistoryEntry,
  SyncResult,
  SyncStatus,
} from '../sync-types'

export interface SyncOperationResult {
  success: boolean
  error?: string
}

export interface TriggerSyncResult extends SyncOperationResult {
  result?: SyncResult
}

export interface SyncHistoryResult {
  success: boolean
  entries: SyncHistoryEntry[]
}

export interface SyncCompletePayload {
  result: SyncResult
  status: SyncStatus
}

export interface SyncApiContract {
  getStatus(): Promise<SyncStatus>
  getConfig(): Promise<SyncConfig | null>
  saveConfig(config: SyncConfig, password?: string): Promise<SyncOperationResult>
  deleteConfig(): Promise<SyncOperationResult>
  testConnection(config: SyncConfig, password: string): Promise<SyncOperationResult>
  triggerSync(workspacePath: string): Promise<TriggerSyncResult>
  startAutoSync(workspacePath: string): Promise<SyncOperationResult>
  stopAutoSync(): Promise<{ success: boolean }>
  getHistory(limit?: number): Promise<SyncHistoryResult>
  clearHistory(): Promise<{ success: boolean }>
  onStatusChanged(callback: (status: SyncStatus) => void): () => void
  onSyncComplete(callback: (data: SyncCompletePayload) => void): () => void
}
