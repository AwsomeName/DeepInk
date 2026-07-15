import { existsSync } from 'node:fs'
import type { IPty, IPtyForkOptions } from 'node-pty'
import * as pty from 'node-pty'
import { REMOTE_ERROR_CODE, type RemoteError } from '../../shared/remote-error'
import type { TerminalBackend, TerminalExecutionEvent } from '../../shared/terminal'
import type {
  TerminalExecutionAdapter,
  TerminalExecutionEventListener,
  TerminalSize,
  TerminalStartInput,
  TerminalStartResult,
  TerminalWriteInput,
} from './terminal-execution-adapter'

interface PtySession {
  process: PtyProcess
  runtimeCwd?: string
}

interface PtyProcess {
  pid: number
  write(data: string): void
  resize(columns: number, rows: number): void
  kill(signal?: string): void
  onData(listener: (data: string) => void): { dispose(): void }
  onExit(listener: (event: { exitCode: number; signal?: number }) => void): { dispose(): void }
}

export interface PtySpawnInput {
  shell: string
  cwd?: string
  env: NodeJS.ProcessEnv
  columns: number
  rows: number
}

export interface PtyExecutionAdapterOptions {
  now?: () => number
  spawnPty?: (input: PtySpawnInput) => PtyProcess
}

export class TerminalPtyError extends Error {
  readonly remoteError: RemoteError

  constructor(remoteError: RemoteError) {
    super(remoteError.message)
    this.name = 'TerminalPtyError'
    this.remoteError = remoteError
  }
}

export class PtyExecutionAdapter implements TerminalExecutionAdapter {
  readonly backend: TerminalBackend = 'local-shell'

  private readonly sessions = new Map<string, PtySession>()
  private readonly listeners = new Set<TerminalExecutionEventListener>()
  private readonly now: () => number
  private readonly spawnPty: NonNullable<PtyExecutionAdapterOptions['spawnPty']>

  constructor(options: PtyExecutionAdapterOptions = {}) {
    this.now = options.now ?? Date.now
    this.spawnPty = options.spawnPty ?? defaultSpawnPty
  }

  async start(input: TerminalStartInput): Promise<TerminalStartResult> {
    if (input.runtime.location !== 'local') {
      throw this.createUnavailableError(
        input.sessionId,
        'terminal.startPty',
        '本地 PTY 只支持本机 Terminal；远程 PTY 需要远端执行通道接入',
      )
    }

    const existing = this.sessions.get(input.sessionId)
    if (existing) {
      return {
        sessionId: input.sessionId,
        status: 'running',
        processId: existing.process.pid,
      }
    }

    const cwd = normalizeCwd(input.runtime.cwd)
    const size = normalizeTerminalSize(input.size)
    const child = this.spawnPty({
      shell: input.runtime.shell || getDefaultShell(),
      cwd,
      env: {
        ...process.env,
        ...input.env,
        TERM: process.env.TERM || 'xterm-256color',
        COLORTERM: process.env.COLORTERM || 'truecolor',
      },
      columns: size.columns,
      rows: size.rows,
    })

    this.sessions.set(input.sessionId, { process: child, runtimeCwd: cwd })
    this.bindPtyProcess(input.sessionId, child)
    this.emit({
      kind: 'started',
      sessionId: input.sessionId,
      processId: child.pid,
      timestamp: this.now(),
    })

    return {
      sessionId: input.sessionId,
      status: 'running',
      processId: child.pid,
    }
  }

  async write(input: TerminalWriteInput): Promise<void> {
    const session = this.sessions.get(input.sessionId)
    if (!session) {
      throw this.createUnavailableError(
        input.sessionId,
        'terminal.writePty',
        'Terminal PTY session 不存在或已经退出',
        false,
      )
    }
    session.process.write(input.data)
  }

  async resize(sessionId: string, size: TerminalSize): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) return
    const normalized = normalizeTerminalSize(size)
    session.process.resize(normalized.columns, normalized.rows)
  }

  async terminate(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) return
    session.process.kill()
  }

  onEvent(listener: TerminalExecutionEventListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  destroy(): void {
    for (const sessionId of this.sessions.keys()) {
      void this.terminate(sessionId)
    }
    this.sessions.clear()
    this.listeners.clear()
  }

  private bindPtyProcess(sessionId: string, child: PtyProcess): void {
    child.onData((data) => {
      this.emit({
        kind: 'output',
        sessionId,
        data,
        stream: 'stdout',
        timestamp: this.now(),
      })
    })
    child.onExit((event) => {
      this.sessions.delete(sessionId)
      this.emit({
        kind: 'exit',
        sessionId,
        exitCode: event.exitCode,
        signal: event.signal ? String(event.signal) : undefined,
        timestamp: this.now(),
      })
    })
  }

  private createUnavailableError(
    sessionId: string,
    operation: string,
    message: string,
    retryable = true,
  ): TerminalPtyError {
    const remoteError: RemoteError = {
      layer: 'execution-backend',
      code: REMOTE_ERROR_CODE.EXECUTION_BACKEND_UNAVAILABLE,
      message,
      retryable,
      context: {
        backend: this.backend,
        operation,
        sessionId,
      },
    }

    this.emit({
      kind: 'error',
      sessionId,
      message,
      remoteError,
      timestamp: this.now(),
    })

    return new TerminalPtyError(remoteError)
  }

  private emit(event: TerminalExecutionEvent): void {
    for (const listener of this.listeners) listener(event)
  }
}

function defaultSpawnPty(input: PtySpawnInput): IPty {
  const options: IPtyForkOptions = {
    name: 'xterm-256color',
    cols: input.columns,
    rows: input.rows,
    cwd: input.cwd,
    env: input.env,
  }
  return pty.spawn(input.shell, [], options)
}

function getDefaultShell(): string {
  if (process.platform === 'win32') return process.env.COMSPEC || 'cmd.exe'
  return process.env.SHELL || '/bin/zsh'
}

function normalizeCwd(cwd: string | undefined): string | undefined {
  if (!cwd || !existsSync(cwd)) return undefined
  return cwd
}

function normalizeTerminalSize(size: TerminalSize | undefined): TerminalSize {
  return {
    columns: clampInteger(size?.columns, 2, 500, 80),
    rows: clampInteger(size?.rows, 2, 200, 24),
  }
}

function clampInteger(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.floor(value)))
}
