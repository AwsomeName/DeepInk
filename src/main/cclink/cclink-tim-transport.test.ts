import { describe, expect, it } from 'vitest'
import type { ChatccIdentity } from '../../shared/chatcc'
import { CclinkTimTransport, type CclinkTimCustomMessage, type CclinkTimLoginOptions, type CclinkTimSdkAdapter } from './cclink-tim-transport'

class FakeTimAdapter implements CclinkTimSdkAdapter {
  loginOptions: CclinkTimLoginOptions | null = null
  sent: Array<{ peerId: string; payload: string }> = []
  listener: ((message: CclinkTimCustomMessage) => void) | null = null
  loggedOut = false

  async login(options: CclinkTimLoginOptions): Promise<void> {
    this.loginOptions = options
  }

  async logout(): Promise<void> {
    this.loggedOut = true
  }

  async sendCustomMessage(peerId: string, payload: string): Promise<void> {
    this.sent.push({ peerId, payload })
  }

  onCustomMessage(listener: (message: CclinkTimCustomMessage) => void): () => void {
    this.listener = listener
    return () => {
      this.listener = null
    }
  }

  emit(message: CclinkTimCustomMessage): void {
    this.listener?.(message)
  }
}

const identity: ChatccIdentity = {
  accountUserId: 'user-1',
  imUserId: 'im-user-1',
  clientImUserId: 'client-1',
  imUserSig: 'sig-1',
  authToken: 'token-1',
  sdkAppId: 123,
  deviceId: 'device-1',
  deviceName: 'MacBook',
  expiresAt: null,
  updatedAt: 1,
}

describe('CclinkTimTransport', () => {
  it('logs in with CCLink identity client IM credentials', async () => {
    const adapter = new FakeTimAdapter()
    const transport = new CclinkTimTransport(adapter)

    await transport.login(identity)

    expect(transport.getStatus()).toBe('online')
    expect(adapter.loginOptions).toEqual({
      sdkAppId: 123,
      userId: 'client-1',
      userSig: 'sig-1',
    })
  })

  it('maps server_meta agent id to TIM peer id for later sends', async () => {
    const adapter = new FakeTimAdapter()
    const transport = new CclinkTimTransport(adapter)
    const received: string[] = []
    transport.onMessage((event) => received.push(event.serverId))

    adapter.emit({
      from: 'tim-peer-1',
      payload: JSON.stringify({
        cc_type: 'server_meta',
        v: 1,
        min_v: 1,
        agent_id: 'agent-1',
        hostname: 'Mac mini',
        os: 'Darwin',
        agent_version: '0.8.0',
      }),
    })
    await transport.login(identity)
    await transport.sendMessage('agent-1', {
      cc_type: 'file_tree_request',
      v: 1,
      min_v: 1,
      path: '/workspace',
    })

    expect(received).toEqual(['agent-1'])
    expect(adapter.sent[0]).toMatchObject({ peerId: 'tim-peer-1' })
    expect(JSON.parse(adapter.sent[0].payload)).toMatchObject({ cc_type: 'file_tree_request' })
  })

  it('ignores non-CCLink custom messages', () => {
    const adapter = new FakeTimAdapter()
    const transport = new CclinkTimTransport(adapter)
    const received: string[] = []
    transport.onMessage((event) => received.push(event.message.cc_type))

    adapter.emit({ from: 'tim-peer-1', payload: 'not json' })
    adapter.emit({ from: 'tim-peer-1', payload: JSON.stringify({ hello: 'world' }) })

    expect(received).toEqual([])
  })
})
