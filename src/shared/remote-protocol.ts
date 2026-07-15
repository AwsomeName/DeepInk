import type { ChatccFileContent, ChatccMessage, ChatccTreeNode } from './chatcc'
import type { RemoteError } from './remote-error'
import type { RemoteWorkspaceRef, RemoteWorkspaceTransport } from './workspace-ref'

export type RemoteProviderId = RemoteWorkspaceTransport

export type RemoteConnectionState = 'online' | 'offline' | 'connecting' | 'unknown'

export interface RemoteCapabilitySet {
  file: {
    tree: boolean
    read: boolean
    write: boolean
    create: boolean
    rename: boolean
    delete: boolean
    search: boolean
    watch: boolean
  }
  shell: {
    command: boolean
    pty: boolean
    cwd: boolean
  }
  agent: {
    codex: boolean
    claudeCode: boolean
    deepinkAgent: boolean
    custom: boolean
  }
  session: {
    list: boolean
    resume: boolean
    stream: boolean
    archive: boolean
  }
}

export type RemoteProtocolCompatibilityStatus = 'compatible' | 'upgrade-required' | 'unknown'

export interface RemoteProtocolCompatibility {
  minSupported: string
  currentExpected: string
  agentReported?: string
  status: RemoteProtocolCompatibilityStatus
  message: string
}

export interface RemoteStatus {
  ref: RemoteWorkspaceRef
  transport: RemoteWorkspaceTransport
  state: RemoteConnectionState
  endpointName?: string
  endpointHost?: string
  agentVersion?: string
  protocolVersion?: string
  compatibility?: RemoteProtocolCompatibility
  lastSeen?: number
  workspacePath: string
  capabilities: RemoteCapabilitySet
  remoteError?: RemoteError
}

export type RemoteDiagnosticCheckStatus = 'pass' | 'warn' | 'fail' | 'unknown'

export interface RemoteDiagnosticCheck {
  id: string
  label: string
  status: RemoteDiagnosticCheckStatus
  message: string
  remoteError?: RemoteError
}

export interface RemoteDiagnosticEvent {
  id: string
  traceId: string
  timestamp: number
  operation: string
  ref: RemoteWorkspaceRef
  message: string
  remoteError?: RemoteError
}

export interface RemoteDiagnosticReport {
  ref: RemoteWorkspaceRef
  traceId: string
  generatedAt: number
  status: RemoteStatus
  checks: RemoteDiagnosticCheck[]
  recentErrors: RemoteDiagnosticEvent[]
}

export interface RemoteFileTreeRequest {
  ref: RemoteWorkspaceRef
  path?: string
  depth?: number
}

export interface RemoteFileReadRequest {
  ref: RemoteWorkspaceRef
  path: string
  startLine?: number
  endLine?: number
}

export interface RemoteFileWriteRequest {
  ref: RemoteWorkspaceRef
  path: string
  content: string
  encoding?: string
}

export interface RemoteFileCreateRequest {
  ref: RemoteWorkspaceRef
  path: string
  type: 'file' | 'directory'
  content?: string
}

export interface RemoteFileRenameRequest {
  ref: RemoteWorkspaceRef
  oldPath: string
  newPath: string
}

export interface RemoteFileDeleteRequest {
  ref: RemoteWorkspaceRef
  path: string
  recursive?: boolean
}

export interface RemoteAgentMessageRequest {
  ref: RemoteWorkspaceRef
  sessionId: string
  content: string
}

export interface RemoteFileTreeResult {
  success: boolean
  tree?: ChatccTreeNode
  error?: string
  unavailable?: boolean
  remoteError?: RemoteError
}

export interface RemoteFileReadResult {
  success: boolean
  file?: ChatccFileContent
  error?: string
  unavailable?: boolean
  remoteError?: RemoteError
}

export interface RemoteFileMutationResult {
  success: boolean
  path?: string
  error?: string
  unavailable?: boolean
  remoteError?: RemoteError
}

export interface RemoteAgentMessageResult {
  success: boolean
  messages?: ChatccMessage[]
  error?: string
  unavailable?: boolean
  remoteError?: RemoteError
}

export interface RemoteProvider {
  transport: RemoteWorkspaceTransport
  getStatus(ref: RemoteWorkspaceRef): Promise<RemoteStatus>
  getCapabilities(ref: RemoteWorkspaceRef): Promise<RemoteCapabilitySet>
  listFileTree?(request: RemoteFileTreeRequest): Promise<RemoteFileTreeResult>
  readFile?(request: RemoteFileReadRequest): Promise<RemoteFileReadResult>
  writeFile?(request: RemoteFileWriteRequest): Promise<RemoteFileMutationResult>
  createFile?(request: RemoteFileCreateRequest): Promise<RemoteFileMutationResult>
  renameFile?(request: RemoteFileRenameRequest): Promise<RemoteFileMutationResult>
  deleteFile?(request: RemoteFileDeleteRequest): Promise<RemoteFileMutationResult>
  sendAgentMessage?(request: RemoteAgentMessageRequest): Promise<RemoteAgentMessageResult>
}

export function emptyRemoteCapabilities(): RemoteCapabilitySet {
  return {
    file: {
      tree: false,
      read: false,
      write: false,
      create: false,
      rename: false,
      delete: false,
      search: false,
      watch: false,
    },
    shell: {
      command: false,
      pty: false,
      cwd: false,
    },
    agent: {
      codex: false,
      claudeCode: false,
      deepinkAgent: false,
      custom: false,
    },
    session: {
      list: false,
      resume: false,
      stream: false,
      archive: false,
    },
  }
}
