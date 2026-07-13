import { describe, expect, it } from 'vitest'
import type { ChatccIdentity, ChatccMessage, ChatccServer, ChatccSession } from '../../shared/chatcc'
import type { CclinkIdentityService } from './cclink-identity-service'
import { CclinkProtocolRouter } from './cclink-protocol-router'
import { CclinkRealtimeService } from './cclink-realtime-service'
import { CclinkRequestRouter } from './cclink-request-router'
import type { CclinkTimCustomMessage, CclinkTimLoginOptions, CclinkTimSdkAdapter } from './cclink-tim-transport'

class FakeStore {
  servers: ChatccServer[] = []
  sessions: ChatccSession[] = []
  messages: Record<string, ChatccMessage[]> = {}

  async upsertServer(server: ChatccServer): Promise<void> {
    this.servers = [server]
  }

  async upsertSession(session: ChatccSession): Promise<void> {
    this.sessions = [session]
  }

  async appendMessage(sessionId: string, message: ChatccMessage): Promise<void> {
    this.messages[sessionId] = [...(this.messages[sessionId] ?? []), message]
  }
}

class FakeAdapter implements CclinkTimSdkAdapter {
  loginOptions: CclinkTimLoginOptions | null = null
  sent: Array<{ peerId: string; payload: string }> = []
  listener: ((message: CclinkTimCustomMessage) => void) | null = null

  constructor(private readonly failLogin = false) {}

  async login(options: CclinkTimLoginOptions): Promise<void> {
    if (this.failLogin) throw new Error('login failed')
    this.loginOptions = options
  }

  async logout(): Promise<void> {}

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

function identityService(): CclinkIdentityService {
  return {
    ensureIdentity: async () => identity,
  } as unknown as CclinkIdentityService
}

describe('CclinkRealtimeService', () => {
  it('connects adapter and attaches request router transport', async () => {
    const adapter = new FakeAdapter()
    const requestRouter = new CclinkRequestRouter()
    const protocolRouter = new CclinkProtocolRouter(new FakeStore() as never)
    const service = new CclinkRealtimeService(identityService(), requestRouter, protocolRouter, () => adapter)

    const status = await service.connect()
    await requestRouter.request('agent-1', {
      cc_type: 'file_tree_request',
      v: 1,
      min_v: 1,
      path: '/workspace',
    }, {
      expectedTypes: ['file_tree_response'],
      timeoutMs: 10,
    }).catch(() => undefined)

    expect(status).toEqual({ state: 'online' })
    expect(adapter.loginOptions).toEqual({ sdkAppId: 123, userId: 'client-1', userSig: 'sig-1' })
    expect(adapter.sent[0]).toMatchObject({ peerId: 'agent-1' })
  })

  it('returns error status when adapter login fails', async () => {
    const requestRouter = new CclinkRequestRouter()
    const protocolRouter = new CclinkProtocolRouter(new FakeStore() as never)
    const service = new CclinkRealtimeService(
      identityService(),
      requestRouter,
      protocolRouter,
      () => new FakeAdapter(true),
    )

    const status = await service.connect()

    expect(status).toEqual({ state: 'error', error: 'login failed' })
  })
})
