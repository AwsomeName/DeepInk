import type {
  TerminalAuditEvent,
  TerminalAuditEventKind,
  TerminalCommandActor,
  TerminalCommandConfirmationRequest,
  TerminalExecutionEvent,
  TerminalClosePolicy,
  TerminalPermissionPolicy,
  TerminalPermissionRisk,
  TerminalRuntimeRef,
  TerminalStatus,
} from '../terminal'

export interface TerminalAuditListFilter {
  terminalSessionId?: string
  workspaceKey?: string | null
  limit?: number
}

export interface TerminalOperationResult {
  success: boolean
  error?: string
}

export type TerminalLifecycleAuditKind = Extract<
  TerminalAuditEventKind,
  'created' | 'closed' | 'terminated'
>

export interface TerminalLifecycleAuditInput {
  terminalSessionId: string
  workspaceKey?: string | null
  kind: TerminalLifecycleAuditKind
  message?: string
  runtime?: TerminalRuntimeRef
  permissionPolicy?: TerminalPermissionPolicy
  closePolicy?: TerminalClosePolicy
}

export interface TerminalSessionSnapshot {
  sessionId: string
  runtime: TerminalRuntimeRef
  status: TerminalStatus
  createdAt: number
  updatedAt: number
  processId?: string | number
  exitCode?: number
  signal?: string
  exitedAt?: number
  errorMessage?: string
  lastCommand?: string
  workspaceKey?: string | null
  permissionPolicy?: TerminalPermissionPolicy
  closePolicy?: TerminalClosePolicy
  attachable?: boolean
  outputBuffer?: TerminalSessionOutputLine[]
  commandHistory?: TerminalSessionCommandRecord[]
}

export type TerminalSessionOutputKind = 'stdout' | 'stderr' | 'system' | 'error' | 'input'

export interface TerminalSessionOutputLine {
  id: string
  kind: TerminalSessionOutputKind
  text: string
  timestamp: number
}

export interface TerminalSessionCommandRecord {
  id: string
  command: string
  actor: TerminalCommandActor
  timestamp: number
}

export interface TerminalSubmitCommandInput {
  terminalSessionId: string
  command: string
  actor: TerminalCommandActor
  permissionPolicy: TerminalPermissionPolicy
  workspaceKey?: string | null
}

export interface TerminalPtySize {
  columns: number
  rows: number
}

export interface TerminalPtyStartInput {
  terminalSessionId: string
  runtime: TerminalRuntimeRef
  size?: TerminalPtySize
}

export interface TerminalPtyWriteInput {
  terminalSessionId: string
  data: string
}

export interface TerminalPtyResizeInput {
  terminalSessionId: string
  size: TerminalPtySize
}

export interface TerminalPtyStartResult extends TerminalOperationResult {
  processId?: string | number
}

export interface TerminalSubmitCommandAcceptedResult {
  success: true
  status: 'accepted'
  risk: TerminalPermissionRisk
  execution: 'started' | 'not-started'
  message: string
}

export interface TerminalSubmitCommandRejectedResult {
  success: false
  status: 'denied' | 'rejected'
  risk?: TerminalPermissionRisk
  error: string
}

export type TerminalSubmitCommandResult =
  | TerminalSubmitCommandAcceptedResult
  | TerminalSubmitCommandRejectedResult

export interface TerminalApiContract {
  onRequestCommandConfirmation(
    callback: (request: TerminalCommandConfirmationRequest) => void,
  ): () => void
  onExecutionEvent(callback: (event: TerminalExecutionEvent) => void): () => void
  resolveCommandConfirmation(id: string, approved: boolean): Promise<{ success: boolean }>
  recordLifecycleEvent(input: TerminalLifecycleAuditInput): Promise<TerminalOperationResult>
  submitCommand(input: TerminalSubmitCommandInput): Promise<TerminalSubmitCommandResult>
  startPty(input: TerminalPtyStartInput): Promise<TerminalPtyStartResult>
  writePty(input: TerminalPtyWriteInput): Promise<TerminalOperationResult>
  resizePty(input: TerminalPtyResizeInput): Promise<TerminalOperationResult>
  terminatePty(terminalSessionId: string): Promise<TerminalOperationResult>
  listSessions(): Promise<TerminalSessionSnapshot[]>
  listAuditEvents(filter?: TerminalAuditListFilter): Promise<TerminalAuditEvent[]>
  clearAuditSession(terminalSessionId: string): Promise<TerminalOperationResult>
  clearAuditEvents(): Promise<TerminalOperationResult>
}
