import type { CclinkProtocolRouter } from './cclink-protocol-router'
import type { CclinkRequestRouter, CclinkTransport, CclinkTransportEvent } from './cclink-request-router'

export class CclinkRealtimeBridge {
  private readonly unsubscribe: () => void

  constructor(
    transport: CclinkTransport,
    private readonly requestRouter: CclinkRequestRouter,
    private readonly protocolRouter: CclinkProtocolRouter,
  ) {
    this.unsubscribe = transport.onMessage((event) => {
      void this.handleMessage(event)
    })
  }

  destroy(): void {
    this.unsubscribe()
  }

  private async handleMessage(event: CclinkTransportEvent): Promise<void> {
    this.requestRouter.handleMessage(event)
    try {
      await this.protocolRouter.handleMessage(event.serverId, event.message)
    } catch (error) {
      console.warn('[CCLink] 协议消息处理失败:', error instanceof Error ? error.message : String(error))
    }
  }
}
