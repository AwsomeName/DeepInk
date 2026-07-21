import { createNoopOfficialIntegration, type OfficialIntegration } from './official-integration'

/**
 * Single assembly seam for the official build.
 *
 * OSS builds must stay inert and return the no-op implementation. The official
 * build workspace may replace or alias only this loader during assembly; core
 * runtime startup should not import official account, message, quota, release,
 * or runtime packages directly.
 */
export async function loadOfficialIntegration(): Promise<OfficialIntegration> {
  return createNoopOfficialIntegration()
}

export function createOfficialIntegrationFallback(): OfficialIntegration {
  return createNoopOfficialIntegration()
}
