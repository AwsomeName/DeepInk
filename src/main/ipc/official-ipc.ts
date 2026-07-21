import type { OfficialIntegration } from '../official/official-integration'
import { registerTrustedIpcHandler, type TrustedRendererGuard } from './trusted-renderer-guard'

export function registerOfficialIpc(
  officialIntegration: OfficialIntegration,
  trustedRendererGuard: TrustedRendererGuard,
): void {
  registerTrustedIpcHandler('official:getStatus', trustedRendererGuard, () =>
    officialIntegration.getStatus(),
  )
}
