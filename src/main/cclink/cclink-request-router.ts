import { randomUUID } from 'node:crypto'
import type { ChatccMessageType, ChatccProtocolMessage } from '../../shared/chatcc/protocol'
import { isChatccProtocolCompatible } from '../../shared/chatcc/protocol'
import { REMOTE_ERROR_CODE, type RemoteError } from '../../shared/remote-error'

export interface CclinkTransportEvent {
  serverId: string
  message: ChatccProtocolMessage
}

export interface CclinkTransport {
  sendMessage(serverId: string, message: ChatccProtocolMessage): Promise<void>
  onMessage(listener: (event: CclinkTransportEvent) => void): () => void
}

export interface CclinkRequestOptions {
  expectedTypes: ChatccMessageType[]
  timeoutMs?: number
}

export interface CclinkRequestClient {
  request(
    serverId: string,
    message: ChatccProtocolMessage,
    options: CclinkRequestOptions,
  ): Promise<ChatccProtocolMessage>
}

export interface CclinkRequestRouterOptions {
  subscribeToTransport?: boolean
}

interface PendingRequest {
  serverId: string
  expectedTypes: Set<ChatccMessageType>
  timer: NodeJS.Timeout
  resolve: (message: ChatccProtocolMessage) => void
  reject: (error: Error) => void
}

const DEFAULT_REQUEST_TIMEOUT_MS = 15_000

export class CclinkRequestLayerError extends Error {
  constructor(
    message: string,
    readonly remoteError: RemoteError,
  ) {
    super(message)
    this.name = 'CclinkRequestLayerError'
  }
}

export class CclinkTransportUnavailableError extends CclinkRequestLayerError {
  constructor(message = 'CCLink transport 尚未连接') {
    super(message, {
      layer: 'transport',
      code: REMOTE_ERROR_CODE.TRANSPORT_UNAVAILABLE,
      message,
      retryable: true,
    })
    this.name = 'CclinkTransportUnavailableError'
  }
}

export class CclinkTransportSendError extends CclinkRequestLayerError {
  constructor(message = 'CCLink transport 发送失败') {
    super(message, {
      layer: 'transport',
      code: REMOTE_ERROR_CODE.TRANSPORT_SEND_FAILED,
      message,
      retryable: true,
    })
    this.name = 'CclinkTransportSendError'
  }
}

export class CclinkRequestTimeoutError extends CclinkRequestLayerError {
  constructor(message = '等待 CCLink 响应超时') {
    super(message, {
      layer: 'transport',
      code: REMOTE_ERROR_CODE.REQUEST_TIMEOUT,
      message,
      retryable: true,
    })
    this.name = 'CclinkRequestTimeoutError'
  }
}

export class CclinkProtocolResponseError extends Error {
  constructor(
    message: string,
    readonly errorType?: string,
  ) {
    super(message)
    this.name = 'CclinkProtocolResponseError'
  }
}

export class CclinkProtocolVersionError extends CclinkRequestLayerError {
  constructor(message = 'CCLink 协议版本不兼容') {
    super(message, {
      layer: 'remote-agent',
      code: REMOTE_ERROR_CODE.PROTOCOL_INCOMPATIBLE,
      message,
      retryable: false,
    })
    this.name = 'CclinkProtocolVersionError'
  }
}

export class CclinkUnexpectedResponseError extends CclinkRequestLayerError {
  constructor(message: string) {
    super(message, {
      layer: 'remote-agent',
      code: REMOTE_ERROR_CODE.UNEXPECTED_RESPONSE,
      message,
      retryable: true,
    })
    this.name = 'CclinkUnexpectedResponseError'
  }
}

export class CclinkRequestRouter implements CclinkRequestClient {
  private readonly pending = new Map<string, PendingRequest>()
  private unsubscribe?: () => void

  constructor(
    private transport?: CclinkTransport,
    private readonly defaultTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    options: CclinkRequestRouterOptions = {},
  ) {
    if (transport && options.subscribeToTransport !== false) {
      this.attachTransport(transport)
    }
  }

  attachTransport(transport: CclinkTransport, options: CclinkRequestRouterOptions = {}): void {
    this.unsubscribe?.()
    this.transport = transport
    this.unsubscribe = options.subscribeToTransport === false
      ? undefined
      : transport.onMessage((event) => this.handleMessage(event))
  }

  detachTransport(): void {
    this.unsubscribe?.()
    this.unsubscribe = undefined
    this.transport = undefined
    for (const requestId of this.pending.keys()) {
      this.rejectPending(requestId, new CclinkTransportUnavailableError())
    }
  }

  async request(
    serverId: string,
    message: ChatccProtocolMessage,
    options: CclinkRequestOptions,
  ): Promise<ChatccProtocolMessage> {
    if (!this.transport) {
      throw new CclinkTransportUnavailableError()
    }

    const requestId = message.request_id || randomUUID()
    const outbound = { ...message, request_id: requestId } as ChatccProtocolMessage
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs

    return new Promise<ChatccProtocolMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId)
        reject(new CclinkRequestTimeoutError())
      }, timeoutMs)

      this.pending.set(requestId, {
        serverId,
        expectedTypes: new Set(options.expectedTypes),
        timer,
        resolve,
        reject,
      })

      void this.transport!.sendMessage(serverId, outbound).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        this.rejectPending(requestId, new CclinkTransportSendError(message))
      })
    })
  }

  handleMessage(event: CclinkTransportEvent): void {
    const requestId = event.message.request_id
    if (!requestId) return

    const pending = this.pending.get(requestId)
    if (!pending || pending.serverId !== event.serverId) return

    if (!isChatccProtocolCompatible(event.message)) {
      this.rejectPending(requestId, new CclinkProtocolVersionError())
      return
    }

    if (event.message.cc_type === 'error') {
      this.rejectPending(requestId, new CclinkProtocolResponseError(event.message.message, event.message.error_type))
      return
    }

    if (!pending.expectedTypes.has(event.message.cc_type)) {
      this.rejectPending(requestId, new CclinkUnexpectedResponseError(`收到非预期 CCLink 响应：${event.message.cc_type}`))
      return
    }

    clearTimeout(pending.timer)
    this.pending.delete(requestId)
    pending.resolve(event.message)
  }

  destroy(): void {
    this.detachTransport()
  }

  private rejectPending(requestId: string, error: Error): void {
    const pending = this.pending.get(requestId)
    if (!pending) return
    clearTimeout(pending.timer)
    this.pending.delete(requestId)
    pending.reject(error)
  }
}
