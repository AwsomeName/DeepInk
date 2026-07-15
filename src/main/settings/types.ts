/**
 * AppSettings — 主进程设置类型
 *
 * 类型、常量、工具函数统一从 src/shared/settings-constants 导入，
 * 此文件仅做 re-export，保持现有 import 路径兼容。
 */

export type {
  BackendType,
  PermissionMode,
  ZoomMode,
  DeviceMode,
  Provider,
  ApiFormat,
  AgentEngine,
  AppSettings,
  ProviderPreset,
} from '../../shared/settings-constants'

export {
  PROVIDER_PRESETS,
  DEFAULT_SETTINGS,
  getPresetBaseUrl,
} from '../../shared/settings-constants'
