import type { OfficialIntegration } from '../official/official-integration'
import { officialIpc } from '../../shared/ipc/official'
import { registerTrustedIpcContract, type TrustedRendererGuard } from './trusted-renderer-guard'

export function registerOfficialIpc(
  officialIntegration: OfficialIntegration,
  trustedRendererGuard: TrustedRendererGuard,
): void {
  registerTrustedIpcContract(officialIpc.getStatus, trustedRendererGuard, () =>
    officialIntegration.getStatus(),
  )
}
