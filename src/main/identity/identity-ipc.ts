import type { LocalIdentityService } from './local-identity-service'
import { identityIpc } from '../../shared/ipc/identity'
import {
  registerTrustedIpcContract,
  type TrustedRendererGuard,
} from '../ipc/trusted-renderer-guard'

export function registerIdentityIpc(
  localIdentityService: LocalIdentityService,
  trustedRendererGuard: TrustedRendererGuard,
): void {
  registerTrustedIpcContract(identityIpc.getLocalIdentity, trustedRendererGuard, () =>
    localIdentityService.ensureIdentity(),
  )
}
