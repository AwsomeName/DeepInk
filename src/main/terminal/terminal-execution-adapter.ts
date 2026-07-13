import type {
  TerminalBackend,
  TerminalCommandActor,
  TerminalRuntimeRef,
  TerminalStatus,
} from '../../shared/terminal'
import type { RemoteError } from '../../shared/remote-error'

export interface TerminalSize {
  columns: number
  rows: number
}

export interface TerminalStartInput {
  sessionId: string
  runtime: TerminalRuntimeRef
  size?: TerminalSize
  env?: Record<string, string>
}

export interface TerminalWriteInput {
  sessionId: string
  data: string
  actor: TerminalCommandActor
}

export interface TerminalStartResult {
  sessionId: string
  status: Extract<TerminalStatus, 'running' | 'blocked'>
  processId?: string | number
}

export type TerminalExecutionEvent =
  | {
      kind: 'started'
      sessionId: string
      processId?: string | number
      timestamp: number
    }
  | {
      kind: 'output'
      sessionId: string
      data: string
      stream: 'stdout' | 'stderr'
      timestamp: number
    }
  | {
      kind: 'blocked'
      sessionId: string
      command: string
      reason: string
      actor: TerminalCommandActor
      timestamp: number
    }
  | {
      kind: 'exit'
      sessionId: string
      exitCode?: number
      signal?: string
      timestamp: number
    }
  | {
      kind: 'error'
      sessionId: string
      message: string
      remoteError?: RemoteError
      timestamp: number
    }

export type TerminalExecutionEventListener = (event: TerminalExecutionEvent) => void

export interface TerminalExecutionAdapter {
  readonly backend: TerminalBackend
  start(input: TerminalStartInput): Promise<TerminalStartResult>
  write(input: TerminalWriteInput): Promise<void>
  resize(sessionId: string, size: TerminalSize): Promise<void>
  terminate(sessionId: string): Promise<void>
  onEvent(listener: TerminalExecutionEventListener): () => void
}
