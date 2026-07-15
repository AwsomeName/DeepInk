import { describe, expect, it } from 'vitest'
import type { ChatccProtocolMessage } from '../../shared/chatcc/protocol'
import { CclinkRealtimeBridge } from './cclink-realtime-bridge'
import { CclinkRequestRouter, type CclinkTransport, type CclinkTransportEvent } from './cclink-request-router'

class FakeTransport implements CclinkTransport {
  listener: ((event: CclinkTransportEvent) => void) | null = null
  sent: Array<{ serverId: string; message: ChatccProtocolMessage }> = []

  async sendMessage(serverId: string, message: ChatccProtocolMessage): Promise<void> {
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

class FakeProtocolRouter {
  handled: CclinkTransportEvent[] = []

  async handleMessage(serverId: string, message: ChatccProtocolMessage): Promise<boolean> {
    this.handled.push({ serverId, message })
    return true
  }
}

describe('CclinkRealtimeBridge', () => {
  it('feeds incoming messages to request and protocol routers', async () => {
    const transport = new FakeTransport()
    const requestRouter = new CclinkRequestRouter(transport, 15_000, { subscribeToTransport: false })
    const protocolRouter = new FakeProtocolRouter()
    new CclinkRealtimeBridge(transport, requestRouter, protocolRouter as never)

    const promise = requestRouter.request('agent-1', {
      cc_type: 'file_tree_request',
      v: 2,
      min_v: 2,
      path: '/workspace',
    }, {
      expectedTypes: ['file_tree_response'],
    })
    const requestId = transport.sent[0].message.request_id
    const response: ChatccProtocolMessage = {
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
    }

    transport.emit({ serverId: 'agent-1', message: response })

    await expect(promise).resolves.toMatchObject({ cc_type: 'file_tree_response' })
    expect(protocolRouter.handled[0]).toMatchObject({ serverId: 'agent-1', message: response })
  })
})
