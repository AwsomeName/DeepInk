import type { ChatccFileContent, ChatccMessage, ChatccServer, ChatccSession, ChatccTreeNode } from '../chatcc'
import type { RemoteError as CclinkRemoteError, RemoteErrorLayer as CclinkRemoteErrorLayer } from '../remote-error'

export type { CclinkRemoteError, CclinkRemoteErrorLayer }

export interface CclinkApiState {
  servers: ChatccServer[]
  sessions: ChatccSession[]
  messages: Record<string, ChatccMessage[]>
  updatedAt: number
}

export interface CclinkFileTreeRequest {
  serverId: string
  workspaceId: string
  path?: string
  depth?: number
}

export interface CclinkFileReadRequest {
  serverId: string
  workspaceId: string
  path: string
  startLine?: number
  endLine?: number
}

export interface CclinkFileTreeResult {
  success: boolean
  tree?: ChatccTreeNode
  error?: string
  unavailable?: boolean
  remoteError?: CclinkRemoteError
}

export interface CclinkFileReadResult {
  success: boolean
  file?: ChatccFileContent
  error?: string
  unavailable?: boolean
  remoteError?: CclinkRemoteError
}

export interface CclinkConversationMessageResult {
  success: boolean
  messages?: ChatccMessage[]
  error?: string
  remoteError?: CclinkRemoteError
}

export interface CclinkRealtimeStatus {
  state: 'idle' | 'connecting' | 'online' | 'offline' | 'error'
  error?: string
}

export interface CclinkAccountSnapshot {
  id: string
  phone: string | null
  loginMethod: string
  nickname?: string
}

export interface CclinkIdentitySnapshot {
  accountUserId: string
  imUserId: string
  clientImUserId: string
  sdkAppId: number
  deviceId: string
  deviceName: string
  expiresAt?: string | null
  updatedAt: number
  ready: boolean
}

export interface CclinkLegacyImportPreflight {
  ok: boolean
  code:
    | 'READY'
    | 'AUTH_SERVICE_UNAVAILABLE'
    | 'NOT_LOGGED_IN'
    | 'CLOUD_USER_UNAVAILABLE'
    | 'DEEPINK_PHONE_REQUIRED'
  message: string
  nextAction: 'sendLegacySmsCode' | 'loginWithPhone' | 'retry' | 'waitForCloudDeploy'
  cloudVersion?: {
    version?: string
    buildTime?: string
    capabilities?: Record<string, boolean>
    env?: Record<string, unknown>
  }
  cachedUser: CclinkAccountSnapshot | null
  cloudUser: CclinkAccountSnapshot | null
  localIdentity: CclinkIdentitySnapshot | null
  checks: {
    authVersionOk: boolean
    hasAccessToken: boolean
    cloudUserOk: boolean
    cloudUserHasPhone: boolean
    cacheMatchesCloud: boolean
    hasLocalIdentity: boolean
  }
}

export interface CclinkApiContract {
  getState: () => Promise<CclinkApiState>
  getIdentity: () => Promise<CclinkIdentitySnapshot | null>
  preflightLegacyImport: () => Promise<CclinkLegacyImportPreflight>
  ensureIdentity: () => Promise<CclinkIdentitySnapshot>
  sendLegacySmsCode: () => Promise<void>
  importLegacyIdentity: (smsCode: string) => Promise<CclinkIdentitySnapshot>
  clearIdentity: () => Promise<void>
  listServers: () => Promise<ChatccServer[]>
  removeServer: (serverId: string) => Promise<void>
  listSessions: (serverId?: string) => Promise<ChatccSession[]>
  removeSession: (sessionId: string) => Promise<void>
  syncPairedAgents: () => Promise<ChatccServer[]>
  listMessages: (sessionId: string) => Promise<ChatccMessage[]>
  sendLocalMessage: (sessionId: string, content: string) => Promise<CclinkConversationMessageResult>
  listFileTree: (request: CclinkFileTreeRequest) => Promise<CclinkFileTreeResult>
  readFile: (request: CclinkFileReadRequest) => Promise<CclinkFileReadResult>
  getRealtimeStatus: () => Promise<CclinkRealtimeStatus>
  connectRealtime: () => Promise<CclinkRealtimeStatus>
  disconnectRealtime: () => Promise<CclinkRealtimeStatus>
  clearLocalData: () => Promise<void>
  /** 开发期样例数据，真实 TIM 接入后可隐藏到 dev-only 命令。 */
  seedDemoData: () => Promise<void>
}
