import { randomUUID } from 'crypto'
import type { RemoteDiagnosticEvent } from '../../shared/remote-protocol'
import type { RemoteError } from '../../shared/remote-error'
import type { RemoteWorkspaceRef } from '../../shared/workspace-ref'
import { workspaceRefKey } from '../../shared/workspace-ref'

export interface RemoteDiagnosticLogRecordInput {
  traceId?: string
  timestamp?: number
  operation: string
  ref: RemoteWorkspaceRef
  message: string
  remoteError?: RemoteError
}

export class RemoteDiagnosticLog {
  private readonly events: RemoteDiagnosticEvent[] = []

  constructor(private readonly maxEvents = 100) {}

  createTraceId(): string {
    return `remote-${randomUUID()}`
  }

  record(input: RemoteDiagnosticLogRecordInput): RemoteDiagnosticEvent {
    const event: RemoteDiagnosticEvent = {
      id: randomUUID(),
      traceId: input.traceId ?? this.createTraceId(),
      timestamp: input.timestamp ?? Date.now(),
      operation: input.operation,
      ref: input.ref,
      message: input.message,
      remoteError: input.remoteError ? sanitizeRemoteError(input.remoteError) : undefined,
    }

    this.events.push(event)
    if (this.events.length > this.maxEvents) {
      this.events.splice(0, this.events.length - this.maxEvents)
    }
    return event
  }

  recentForRef(ref: RemoteWorkspaceRef, limit = 8): RemoteDiagnosticEvent[] {
    const key = workspaceRefKey(ref)
    return this.events
      .filter((event) => workspaceRefKey(event.ref) === key)
      .slice(-limit)
      .reverse()
  }
}

function sanitizeRemoteError(error: RemoteError): RemoteError {
  return {
    layer: error.layer,
    code: error.code,
    message: error.message,
    retryable: error.retryable,
    context: error.context ? { ...error.context } : undefined,
  }
}
