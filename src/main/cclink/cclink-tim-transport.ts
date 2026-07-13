import type { ChatccIdentity } from '../../shared/chatcc'
import type { ChatccProtocolMessage } from '../../shared/chatcc/protocol'
import { isChatccMessage } from '../../shared/chatcc/protocol'
import type { CclinkTransport, CclinkTransportEvent } from './cclink-request-router'

export type CclinkTimTransportStatus = 'idle' | 'connecting' | 'online' | 'offline'

export interface CclinkTimLoginOptions {
  sdkAppId: number
  userId: string
  userSig: string
}

export interface CclinkTimCustomMessage {
  from: string
  payload: string
}

export interface CclinkTimSdkAdapter {
  login(options: CclinkTimLoginOptions): Promise<void>
  logout(): Promise<void>
  sendCustomMessage(peerId: string, payload: string): Promise<void>
  onCustomMessage(listener: (message: CclinkTimCustomMessage) => void): () => void
}

export interface CclinkTimTransportOptions {
  resolvePeerId?: (serverId: string) => string
}

export class CclinkTimTransport implements CclinkTransport {
  private readonly listeners = new Set<(event: CclinkTransportEvent) => void>()
  private readonly serverIdToPeerId = new Map<string, string>()
  private readonly peerIdToServerId = new Map<string, string>()
  private readonly unsubscribe: () => void
  private status: CclinkTimTransportStatus = 'idle'

  constructor(
    private readonly adapter: CclinkTimSdkAdapter,
    private readonly options: CclinkTimTransportOptions = {},
  ) {
    this.unsubscribe = adapter.onCustomMessage((message) => this.handleCustomMessage(message))
  }

  getStatus(): CclinkTimTransportStatus {
    return this.status
  }

  async login(identity: ChatccIdentity): Promise<void> {
    this.status = 'connecting'
    try {
      await this.adapter.login({
        sdkAppId: identity.sdkAppId,
        userId: identity.clientImUserId,
        userSig: identity.imUserSig,
      })
      this.status = 'online'
    } catch (error) {
      this.status = 'offline'
      throw error
    }
  }

  async logout(): Promise<void> {
    await this.adapter.logout()
    this.status = 'offline'
    this.serverIdToPeerId.clear()
    this.peerIdToServerId.clear()
  }

  async sendMessage(serverId: string, message: ChatccProtocolMessage): Promise<void> {
    if (this.status !== 'online') {
      throw new Error('CCLink TIM transport 未登录')
    }

    const peerId = this.resolvePeerId(serverId)
    await this.adapter.sendCustomMessage(peerId, JSON.stringify(message))
  }

  onMessage(listener: (event: CclinkTransportEvent) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  destroy(): void {
    this.unsubscribe()
    this.listeners.clear()
  }

  private handleCustomMessage(message: CclinkTimCustomMessage): void {
    const parsed = this.parsePayload(message.payload)
    if (!parsed) return

    const serverId = this.resolveServerId(message.from, parsed)
    for (const listener of this.listeners) {
      listener({ serverId, message: parsed })
    }
  }

  private parsePayload(payload: string): ChatccProtocolMessage | null {
    try {
      const parsed = JSON.parse(payload) as unknown
      if (!isChatccMessage(parsed)) return null
      return parsed as ChatccProtocolMessage
    } catch {
      return null
    }
  }

  private resolvePeerId(serverId: string): string {
    return this.serverIdToPeerId.get(serverId) ?? this.options.resolvePeerId?.(serverId) ?? serverId
  }

  private resolveServerId(peerId: string, message: ChatccProtocolMessage): string {
    if (message.cc_type === 'server_meta') {
      this.serverIdToPeerId.set(message.agent_id, peerId)
      this.peerIdToServerId.set(peerId, message.agent_id)
      return message.agent_id
    }
    return this.peerIdToServerId.get(peerId) ?? peerId
  }
}
