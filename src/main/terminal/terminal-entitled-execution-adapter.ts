import type { Entitlement } from '../../shared/ipc/subscription'
import { REMOTE_ERROR_CODE, type RemoteError } from '../../shared/remote-error'
import type { TerminalBackend, TerminalExecutionEvent } from '../../shared/terminal'
import { TerminalLocalShellError } from './terminal-local-shell-adapter'
import type {
  TerminalExecutionAdapter,
  TerminalExecutionEventListener,
  TerminalSize,
  TerminalStartInput,
  TerminalStartResult,
  TerminalWriteInput,
} from './terminal-execution-adapter'

export interface TerminalAccessCheckResult {
  allowed: boolean
  reason?: string
}

export interface EntitledTerminalExecutionAdapterOptions {
  featureName: string
  entitlement: Entitlement
  checkAccess: () => Promise<TerminalAccessCheckResult>
  now?: () => number
}

export class EntitledTerminalExecutionAdapter implements TerminalExecutionAdapter {
  readonly backend: TerminalBackend

  private readonly remoteSessions = new Set<string>()
  private readonly listeners = new Set<TerminalExecutionEventListener>()
  private readonly now: () => number

  constructor(
    private readonly delegate: TerminalExecutionAdapter,
    private readonly options: EntitledTerminalExecutionAdapterOptions,
  ) {
    this.backend = delegate.backend
    this.now = options.now ?? Date.now
  }

  async start(input: TerminalStartInput): Promise<TerminalStartResult> {
    if (input.runtime.location === 'remote') {
      await this.requireAccess(input.sessionId, 'terminal.start')
      this.remoteSessions.add(input.sessionId)
    }
    return this.delegate.start(input)
  }

  async write(input: TerminalWriteInput): Promise<void> {
    if (this.remoteSessions.has(input.sessionId)) {
      await this.requireAccess(input.sessionId, 'terminal.write')
    }
    return this.delegate.write(input)
  }

  resize(sessionId: string, size: TerminalSize): Promise<void> {
    return this.delegate.resize(sessionId, size)
  }

  async terminate(sessionId: string): Promise<void> {
    this.remoteSessions.delete(sessionId)
    return this.delegate.terminate(sessionId)
  }

  onEvent(listener: TerminalExecutionEventListener): () => void {
    this.listeners.add(listener)
    const removeDelegateListener = this.delegate.onEvent(listener)
    return () => {
      this.listeners.delete(listener)
      removeDelegateListener()
    }
  }

  private async requireAccess(sessionId: string, operation: string): Promise<void> {
    const result = await this.options.checkAccess()
    if (result.allowed) return

    const message = result.reason || `${this.options.featureName}需要 ${this.options.entitlement} entitlement`
    const remoteError: RemoteError = {
      layer: 'account',
      code: REMOTE_ERROR_CODE.ENTITLEMENT_REQUIRED,
      message,
      retryable: false,
      context: {
        backend: this.backend,
        operation,
        sessionId,
        entitlement: this.options.entitlement,
      },
    }
    this.emit({
      kind: 'error',
      sessionId,
      message,
      remoteError,
      timestamp: this.now(),
    })
    throw new TerminalLocalShellError(remoteError)
  }

  private emit(event: TerminalExecutionEvent): void {
    for (const listener of this.listeners) listener(event)
  }
}
