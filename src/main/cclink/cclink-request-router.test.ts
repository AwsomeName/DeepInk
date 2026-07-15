import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChatccProtocolMessage } from '../../shared/chatcc/protocol'
import {
  CclinkProtocolVersionError,
  CclinkProtocolResponseError,
  CclinkRequestRouter,
  CclinkRequestTimeoutError,
  CclinkTransportSendError,
  CclinkUnexpectedResponseError,
  type CclinkTransport,
  type CclinkTransportEvent,
} from './cclink-request-router'

class FakeTransport implements CclinkTransport {
  sent: Array<{ serverId: string; message: ChatccProtocolMessage }> = []
  listener: ((event: CclinkTransportEvent) => void) | null = null
  sendError: Error | null = null

  async sendMessage(serverId: string, message: ChatccProtocolMessage): Promise<void> {
    if (this.sendError) throw this.sendError
    this.sent.push({ serverId, message })
  }

  onMessage(listener: (event: CclinkTransportEvent) => void): () => void {
    this.listener = listener
    return () => {
      this.listener = null
    }
  }

  emit(event: CclinkTransportEvent): void {
    this.listener?.(event)
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('CclinkRequestRouter', () => {
  it('matches response by server and request id', async () => {
    const transport = new FakeTransport()
    const router = new CclinkRequestRouter(transport)

    const promise = router.request('server-a', {
      cc_type: 'file_tree_request',
      v: 2,
      min_v: 2,
      path: '/workspace',
    }, {
      expectedTypes: ['file_tree_response'],
    })

    const requestId = transport.sent[0]?.message.request_id
    expect(requestId).toBeTruthy()

    transport.emit({
      serverId: 'server-b',
      message: {
        cc_type: 'file_tree_response',
        v: 2,
        min_v: 2,
        request_id: requestId,
        tree: {
          id: 'wrong',
          name: 'wrong',
          type: 'directory',
          path: '/wrong',
          modifiedByAgent: false,
        },
      },
    })

    transport.emit({
      serverId: 'server-a',
      message: {
        cc_type: 'file_tree_response',
        v: 2,
        min_v: 2,
        request_id: requestId,
        tree: {
          id: 'root',
          name: 'workspace',
          type: 'directory',
          path: '/workspace',
          modifiedByAgent: false,
        },
      },
    })

    await expect(promise).resolves.toMatchObject({
      cc_type: 'file_tree_response',
      tree: { path: '/workspace' },
    })
  })

  it('rejects when response times out', async () => {
    vi.useFakeTimers()
    const transport = new FakeTransport()
    const router = new CclinkRequestRouter(transport, 100)

    const promise = router.request('server-a', {
      cc_type: 'file_read_request',
      v: 2,
      min_v: 2,
      path: '/workspace/README.md',
    }, {
      expectedTypes: ['file_read_response'],
    })

    const assertion = expect(promise).rejects.toBeInstanceOf(CclinkRequestTimeoutError)
    await vi.advanceTimersByTimeAsync(101)
    await assertion
    await expect(promise).rejects.toMatchObject({
      remoteError: {
        layer: 'transport',
        code: 'REMOTE_REQUEST_TIMEOUT',
        retryable: true,
      },
    })
  })

  it('rejects transport send failures with structured error', async () => {
    const transport = new FakeTransport()
    transport.sendError = new Error('TIM send failed')
    const router = new CclinkRequestRouter(transport)

    const promise = router.request('server-a', {
      cc_type: 'file_read_request',
      v: 2,
      min_v: 2,
      path: '/workspace/README.md',
    }, {
      expectedTypes: ['file_read_response'],
    })

    await expect(promise).rejects.toBeInstanceOf(CclinkTransportSendError)
    await expect(promise).rejects.toMatchObject({
      remoteError: {
        layer: 'transport',
        code: 'REMOTE_TRANSPORT_SEND_FAILED',
      },
    })
  })

  it('rejects protocol error responses', async () => {
    const transport = new FakeTransport()
    const router = new CclinkRequestRouter(transport)

    const promise = router.request('server-a', {
      cc_type: 'file_read_request',
      v: 2,
      min_v: 2,
      path: '/workspace/README.md',
    }, {
      expectedTypes: ['file_read_response'],
    })

    transport.emit({
      serverId: 'server-a',
      message: {
        cc_type: 'error',
        v: 2,
        min_v: 2,
        request_id: transport.sent[0]?.message.request_id,
        message: '远程文件不存在',
      },
    })

    await expect(promise).rejects.toBeInstanceOf(CclinkProtocolResponseError)
    await expect(promise).rejects.toMatchObject({
      message: '远程文件不存在',
    })
  })

  it('rejects incompatible protocol responses with structured error', async () => {
    const transport = new FakeTransport()
    const router = new CclinkRequestRouter(transport)

    const promise = router.request('server-a', {
      cc_type: 'file_read_request',
      v: 2,
      min_v: 2,
      path: '/workspace/README.md',
    }, {
      expectedTypes: ['file_read_response'],
    })

    transport.emit({
      serverId: 'server-a',
      message: {
        cc_type: 'file_read_response',
        v: 1,
        min_v: 2,
        request_id: transport.sent[0]?.message.request_id,
        path: '/workspace/README.md',
        content: '# Hello',
        total_lines: 1,
      },
    })

    await expect(promise).rejects.toBeInstanceOf(CclinkProtocolVersionError)
    await expect(promise).rejects.toMatchObject({
      remoteError: {
        layer: 'remote-agent',
        code: 'REMOTE_PROTOCOL_INCOMPATIBLE',
        retryable: false,
      },
    })
  })

  it('rejects unexpected response types with structured error', async () => {
    const transport = new FakeTransport()
    const router = new CclinkRequestRouter(transport)

    const promise = router.request('server-a', {
      cc_type: 'file_read_request',
      v: 2,
      min_v: 2,
      path: '/workspace/README.md',
    }, {
      expectedTypes: ['file_read_response'],
    })

    transport.emit({
      serverId: 'server-a',
      message: {
        cc_type: 'file_tree_response',
        v: 2,
        min_v: 2,
        request_id: transport.sent[0]?.message.request_id,
        tree: {
          id: 'root',
          name: 'workspace',
          type: 'directory',
          path: '/workspace',
          modifiedByAgent: false,
        },
      },
    })

    await expect(promise).rejects.toBeInstanceOf(CclinkUnexpectedResponseError)
    await expect(promise).rejects.toMatchObject({
      remoteError: {
        layer: 'remote-agent',
        code: 'REMOTE_UNEXPECTED_RESPONSE',
      },
    })
  })
})
