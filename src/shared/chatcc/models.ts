import type { RemoteError } from '../remote-error'

/** CCLink 远程服务器状态 */
export type ChatccServerStatus = 'online' | 'offline' | 'connecting'

/** CCLink 会话状态 */
export type ChatccSessionStatus = 'active' | 'idle' | 'archived'

/** CCLink 工具执行状态 */
export type ChatccToolState =
  | 'skeleton'
  | 'pending'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'denied'

/** CCLink 工具类型 */
export type ChatccToolType = 'read' | 'edit' | 'write' | 'bash' | 'unknown'

/** DeepInk 登录用户对应的 CCLink/TIM 身份 */
export interface ChatccIdentity {
  accountUserId: string
  imUserId: string
  clientImUserId: string
  imUserSig: string
  authToken: string
  sdkAppId: number
  deviceId: string
  deviceName: string
  expiresAt?: string | null
  updatedAt: number
}

/** 远程服务器，由 chatcc-agent 上报 */
export interface ChatccServer {
  id: string
  name: string
  hostname: string
  os: string
  status: ChatccServerStatus
  agentVersion: string
  claudeVersion: string
  lastSeen: number
  workspaces: ChatccWorkspace[]
}

/** 远程工作区 */
export interface ChatccWorkspace {
  id: string
  path: string
  name: string
  serverId: string
  sessionCount: number
}

/** 远程工作空间会话 */
export interface ChatccSession {
  id: string
  name: string
  workspacePath: string
  serverId: string
  status: ChatccSessionStatus
  createdAt: number
  updatedAt: number
  messageCount: number
  contextUsage: number
}

/** 文件引用 */
export interface ChatccFileRef {
  id: string
  path: string
  lineStart?: number
  lineEnd?: number
  type: 'code' | 'image' | 'document'
}

/** Diff 单行 */
export interface ChatccDiffLine {
  id: number
  type: 'added' | 'removed' | 'context'
  content: string
  lineNumber?: number
}

/** 工具调用信息 */
export interface ChatccToolInfo {
  id: string
  toolType: ChatccToolType
  toolState: ChatccToolState
  target: string
  preview?: string
  result?: string
  diffOld?: string
  diffNew?: string
  diffLines?: ChatccDiffLine[]
  requiresApproval: boolean
  output?: string
  summary?: string
  exitCode?: number
}

export type ChatccMessage =
  | ChatccUserMessage
  | ChatccAgentTextMessage
  | ChatccAgentToolMessage
  | ChatccSystemMessage

export interface ChatccUserMessage {
  type: 'user'
  id: string
  content: string
  timestamp: number
}

export interface ChatccAgentTextMessage {
  type: 'agentText'
  id: string
  content: string
  timestamp: number
  fileRefs: ChatccFileRef[]
}

export interface ChatccAgentToolMessage {
  type: 'agentTool'
  id: string
  timestamp: number
  tool: ChatccToolInfo
}

export interface ChatccSystemMessage {
  type: 'system'
  id: string
  content: string
  timestamp: number
  remoteError?: RemoteError
}

/** 远程文件树节点 */
export interface ChatccTreeNode {
  id: string
  name: string
  type: 'file' | 'directory'
  path: string
  modifiedByAgent: boolean
  lastModified?: number
  children?: ChatccTreeNode[]
}

/** 远程文件内容 */
export interface ChatccFileContent {
  path: string
  content: string
  totalLines: number
  agentModifiedLines: number[]
}
