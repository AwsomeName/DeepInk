import type { BrowserWindow } from 'electron'
import type { OfficialBuildProfile, OfficialIntegrationStatus } from '../../shared/ipc/official'
import type { SettingsService } from '../settings/settings-service'
import type { WorkspaceStateService } from '../workspace/workspace-state-service'
import type { TrustedIpcRegistrar } from '../ipc/trusted-renderer-guard'

export interface OfficialMainContext {
  readonly isDev: boolean
  readonly mainWindow: BrowserWindow
  readonly settingsService: SettingsService
  readonly workspaceStateService: WorkspaceStateService
}

export interface OfficialIpcContext extends OfficialMainContext {
  /** Official channels must use this trusted-main-frame registrar. */
  readonly ipc: TrustedIpcRegistrar
}

export interface OfficialIntegration {
  readonly id: string
  readonly buildProfile: OfficialBuildProfile
  getStatus(): OfficialIntegrationStatus
  registerMainServices?(context: OfficialMainContext): void | Promise<void>
  registerIpc?(context: OfficialIpcContext): void | Promise<void>
}

export const NOOP_OFFICIAL_INTEGRATION_STATUS: OfficialIntegrationStatus = {
  id: 'oss-noop',
  buildProfile: 'oss',
  available: false,
  reason: 'official-integration-not-installed',
  features: {
    account: false,
    deviceRegistry: false,
    messageNetwork: false,
    entitlement: false,
    quota: false,
    officialRuntime: false,
    releaseProvider: false,
  },
}

export class NoopOfficialIntegration implements OfficialIntegration {
  readonly id = NOOP_OFFICIAL_INTEGRATION_STATUS.id
  readonly buildProfile = NOOP_OFFICIAL_INTEGRATION_STATUS.buildProfile

  getStatus(): OfficialIntegrationStatus {
    return NOOP_OFFICIAL_INTEGRATION_STATUS
  }
}

export function createNoopOfficialIntegration(): OfficialIntegration {
  return new NoopOfficialIntegration()
}
