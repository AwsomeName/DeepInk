import type { CclinkTimCustomMessage, CclinkTimLoginOptions, CclinkTimSdkAdapter } from './cclink-tim-transport'

type TencentChatEvent = {
  data?: unknown
}

type TencentChatMessage = {
  from?: string
  type?: string
  payload?: {
    data?: string
    description?: string
    extension?: string
  }
}

type TencentChatModule = {
  default?: TencentChatStatic
} & TencentChatStatic

type TencentChatStatic = {
  create(options: { SDKAppID: number }): TencentChatInstance
  EVENT: {
    SDK_READY: string
    SDK_NOT_READY: string
    MESSAGE_RECEIVED: string
  }
  TYPES: {
    CONV_C2C: string
  }
}

type TencentChatInstance = {
  setLogLevel?(level: number): void
  on(eventName: string, handler: (event: TencentChatEvent) => void): void
  off(eventName: string, handler: (event: TencentChatEvent) => void): void
  login(options: { userID: string; userSig: string }): Promise<unknown>
  logout(): Promise<unknown>
  destroy?(): Promise<unknown> | void
  createCustomMessage(options: {
    to: string
    conversationType: string
    payload: {
      data: string
      description?: string
      extension?: string
    }
  }): unknown
  sendMessage(message: unknown): Promise<unknown>
}

interface LoadTencentChatOptions {
  moduleName?: string
  sdk?: TencentChatStatic
}

export class CclinkTencentChatAdapter implements CclinkTimSdkAdapter {
  private TencentCloudChat: TencentChatStatic | null = null
  private chat: TencentChatInstance | null = null
  private readonly listeners = new Set<(message: CclinkTimCustomMessage) => void>()
  private readonly onMessageReceived = (event: TencentChatEvent): void => {
    for (const message of this.extractCustomMessages(event)) {
      for (const listener of this.listeners) {
        listener(message)
      }
    }
  }

  constructor(private readonly options: LoadTencentChatOptions = {}) {}

  async login(options: CclinkTimLoginOptions): Promise<void> {
    const TencentCloudChat = await this.loadSdk()
    this.chat = TencentCloudChat.create({ SDKAppID: options.sdkAppId })
    this.chat.setLogLevel?.(1)
    this.chat.on(TencentCloudChat.EVENT.MESSAGE_RECEIVED, this.onMessageReceived)
    await this.chat.login({
      userID: options.userId,
      userSig: options.userSig,
    })
  }

  async logout(): Promise<void> {
    if (!this.chat || !this.TencentCloudChat) return
    this.chat.off(this.TencentCloudChat.EVENT.MESSAGE_RECEIVED, this.onMessageReceived)
    await this.chat.logout()
    await this.chat.destroy?.()
    this.chat = null
  }

  async sendCustomMessage(peerId: string, payload: string): Promise<void> {
    if (!this.chat || !this.TencentCloudChat) {
      throw new Error('Tencent Cloud Chat SDK 尚未登录')
    }

    const message = this.chat.createCustomMessage({
      to: peerId,
      conversationType: this.TencentCloudChat.TYPES.CONV_C2C,
      payload: {
        data: payload,
        description: 'DeepInk CCLink',
        extension: 'deepink/cclink',
      },
    })
    await this.chat.sendMessage(message)
  }

  onCustomMessage(listener: (message: CclinkTimCustomMessage) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private async loadSdk(): Promise<TencentChatStatic> {
    if (this.TencentCloudChat) return this.TencentCloudChat
    if (this.options.sdk) {
      this.TencentCloudChat = this.options.sdk
      return this.options.sdk
    }

    const moduleName = this.options.moduleName ?? '@tencentcloud/chat'
    const loaded = await import(moduleName) as TencentChatModule
    const TencentCloudChat = loaded.default ?? loaded
    if (!TencentCloudChat?.create || !TencentCloudChat.EVENT || !TencentCloudChat.TYPES) {
      throw new Error('无法加载 Tencent Cloud Chat SDK：模块导出不符合预期')
    }
    this.TencentCloudChat = TencentCloudChat
    return TencentCloudChat
  }

  private extractCustomMessages(event: TencentChatEvent): CclinkTimCustomMessage[] {
    const messages = Array.isArray(event.data) ? event.data : []
    return messages
      .map((message) => this.toCustomMessage(message as TencentChatMessage))
      .filter((message): message is CclinkTimCustomMessage => Boolean(message))
  }

  private toCustomMessage(message: TencentChatMessage): CclinkTimCustomMessage | null {
    if (!message.from || !message.payload?.data) return null
    return {
      from: message.from,
      payload: message.payload.data,
    }
  }
}
