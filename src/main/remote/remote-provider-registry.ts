import type { RemoteProvider } from '../../shared/remote-protocol'
import type { RemoteWorkspaceRef, RemoteWorkspaceTransport } from '../../shared/workspace-ref'

export class RemoteProviderRegistry {
  private readonly providers = new Map<RemoteWorkspaceTransport, RemoteProvider>()

  register(provider: RemoteProvider): void {
    this.providers.set(provider.transport, provider)
  }

  get(ref: RemoteWorkspaceRef): RemoteProvider {
    const provider = this.providers.get(ref.transport)
    if (!provider) {
      throw new Error(`远程连接方式暂不可用：${ref.transport}`)
    }
    return provider
  }
}
