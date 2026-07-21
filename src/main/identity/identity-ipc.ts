import type { LocalIdentityService } from './local-identity-service'
import { registerTrustedIpcHandler, type TrustedRendererGuard } from '../ipc/trusted-renderer-guard'

export function registerIdentityIpc(
  localIdentityService: LocalIdentityService,
  trustedRendererGuard: TrustedRendererGuard,
): void {
  registerTrustedIpcHandler('identity:getLocalIdentity', trustedRendererGuard, () =>
    localIdentityService.ensureIdentity(),
  )
}
