export type {
  BackendType,
  PermissionMode,
  ZoomMode,
  DeviceMode,
  Provider,
  ApiFormat,
  ProviderPreset,
  AppSettings,
} from '../settings-constants'

export {
  PROVIDER_PRESETS,
  DEFAULT_SETTINGS,
  getPresetBaseUrl,
} from '../settings-constants'

import type { AppSettings } from '../settings-constants'

export interface SettingsOperationResult {
  success: boolean
  error?: string
  settings?: AppSettings
}

export interface SettingsApiContract {
  getAll(): Promise<AppSettings>
  set(updates: Partial<AppSettings>): Promise<SettingsOperationResult>
  reset(): Promise<SettingsOperationResult>
  resetKey(key: string): Promise<SettingsOperationResult>
}
