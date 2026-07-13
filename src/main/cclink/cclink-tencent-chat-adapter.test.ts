import { describe, expect, it } from 'vitest'
import { CclinkTencentChatAdapter } from './cclink-tencent-chat-adapter'

type EventHandler = (event: { data?: unknown }) => void

class FakeTencentChatInstance {
  handlers = new Map<string, EventHandler>()
  loginOptions: { userID: string; userSig: string } | null = null
  sentMessages: unknown[] = []
  customMessageOptions: unknown[] = []
  logoutCalled = false
  destroyed = false

  setLogLevel(): void {}

  on(eventName: string, handler: EventHandler): void {
    this.handlers.set(eventName, handler)
  }

  off(eventName: string): void {
    this.handlers.delete(eventName)
  }

  async login(options: { userID: string; userSig: string }): Promise<void> {
    this.loginOptions = options
  }

  async logout(): Promise<void> {
    this.logoutCalled = true
  }

  async destroy(): Promise<void> {
    this.destroyed = true
  }

  createCustomMessage(options: unknown): unknown {
    this.customMessageOptions.push(options)
    return { kind: 'custom-message', options }
  }

  async sendMessage(message: unknown): Promise<void> {
    this.sentMessages.push(message)
  }

  emit(eventName: string, data: unknown): void {
    this.handlers.get(eventName)?.({ data })
  }
}

function createFakeSdk(instance: FakeTencentChatInstance) {
  return {
    create: () => instance,
    EVENT: {
      SDK_READY: 'SDK_READY',
      SDK_NOT_READY: 'SDK_NOT_READY',
      MESSAGE_RECEIVED: 'MESSAGE_RECEIVED',
    },
    TYPES: {
      CONV_C2C: 'C2C',
    },
  }
}

describe('CclinkTencentChatAdapter', () => {
  it('logs in through Tencent Cloud Chat SDK', async () => {
    const instance = new FakeTencentChatInstance()
    const adapter = new CclinkTencentChatAdapter({ sdk: createFakeSdk(instance) })

    await adapter.login({ sdkAppId: 123, userId: 'client-1', userSig: 'sig-1' })

    expect(instance.loginOptions).toEqual({ userID: 'client-1', userSig: 'sig-1' })
    expect(instance.handlers.has('MESSAGE_RECEIVED')).toBe(true)
  })

  it('sends C2C custom messages', async () => {
    const instance = new FakeTencentChatInstance()
    const adapter = new CclinkTencentChatAdapter({ sdk: createFakeSdk(instance) })

    await adapter.login({ sdkAppId: 123, userId: 'client-1', userSig: 'sig-1' })
    await adapter.sendCustomMessage('agent-peer', '{"cc_type":"ping"}')

    expect(instance.customMessageOptions[0]).toMatchObject({
      to: 'agent-peer',
      conversationType: 'C2C',
      payload: {
        data: '{"cc_type":"ping"}',
        description: 'DeepInk CCLink',
        extension: 'deepink/cclink',
      },
    })
    expect(instance.sentMessages[0]).toMatchObject({ kind: 'custom-message' })
  })

  it('emits received custom message payloads', async () => {
    const instance = new FakeTencentChatInstance()
    const adapter = new CclinkTencentChatAdapter({ sdk: createFakeSdk(instance) })
    const received: Array<{ from: string; payload: string }> = []
    adapter.onCustomMessage((message) => received.push(message))

    await adapter.login({ sdkAppId: 123, userId: 'client-1', userSig: 'sig-1' })
    instance.emit('MESSAGE_RECEIVED', [
      { from: 'agent-peer', payload: { data: '{"cc_type":"server_meta"}' } },
      { from: 'agent-peer', payload: {} },
    ])

    expect(received).toEqual([{ from: 'agent-peer', payload: '{"cc_type":"server_meta"}' }])
  })
})
