import type { CclinkRealtimeStatus } from '../../shared/ipc/cclink'
import type { CclinkIdentityService } from './cclink-identity-service'
import { CclinkProtocolRouter } from './cclink-protocol-router'
import { CclinkRealtimeBridge } from './cclink-realtime-bridge'
import { CclinkRequestRouter } from './cclink-request-router'
import { CclinkTencentChatAdapter } from './cclink-tencent-chat-adapter'
import { CclinkTimTransport, type CclinkTimSdkAdapter } from './cclink-tim-transport'

export type CclinkTimAdapterFactory = () => CclinkTimSdkAdapter

export class CclinkRealtimeService {
  private status: CclinkRealtimeStatus = { state: 'idle' }
  private transport: CclinkTimTransport | null = null
  private bridge: CclinkRealtimeBridge | null = null
  private connecting: Promise<CclinkRealtimeStatus> | null = null

  constructor(
    private readonly identityService: CclinkIdentityService,
    private readonly requestRouter: CclinkRequestRouter,
    private readonly protocolRouter: CclinkProtocolRouter,
    private readonly createAdapter: CclinkTimAdapterFactory = () => new CclinkTencentChatAdapter(),
  ) {}

  getStatus(): CclinkRealtimeStatus {
    return { ...this.status }
  }

  async connect(): Promise<CclinkRealtimeStatus> {
    if (this.status.state === 'online') return this.getStatus()
    if (this.connecting) return this.connecting

    this.connecting = this.connectInternal().finally(() => {
      this.connecting = null
    })
    return this.connecting
  }

  async disconnect(): Promise<CclinkRealtimeStatus> {
    await this.cleanup()
    this.status = { state: 'offline' }
    return this.getStatus()
  }

  async destroy(): Promise<void> {
    await this.cleanup()
    this.status = { state: 'offline' }
  }

  private async connectInternal(): Promise<CclinkRealtimeStatus> {
    this.status = { state: 'connecting' }
    await this.cleanup()

    const adapter = this.createAdapter()
    const transport = new CclinkTimTransport(adapter)
    const bridge = new CclinkRealtimeBridge(transport, this.requestRouter, this.protocolRouter)

    try {
      const identity = await this.identityService.ensureIdentity()
      await transport.login(identity)
      this.requestRouter.attachTransport(transport, { subscribeToTransport: false })
      this.transport = transport
      this.bridge = bridge
      this.status = { state: 'online' }
      return this.getStatus()
    } catch (error) {
      bridge.destroy()
      transport.destroy()
      this.requestRouter.detachTransport()
      this.status = {
        state: 'error',
        error: error instanceof Error ? error.message : String(error),
      }
      return this.getStatus()
    }
  }

  private async cleanup(): Promise<void> {
    this.requestRouter.detachTransport()
    this.bridge?.destroy()
    this.bridge = null
    if (this.transport) {
      await this.transport.logout().catch(() => undefined)
      this.transport.destroy()
      this.transport = null
    }
  }
}
