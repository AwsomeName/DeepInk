export interface UpdateCheckResult {
  hasUpdate: boolean
  /** 当前版本 */
  current: string
  /** 远端最新版本 */
  latest?: string
  /** 完整 dmg 下载地址 */
  downloadUrl?: string
}

export interface UpdateDownloadResult {
  success: boolean
  path?: string
  error?: string
}

export interface UpdateApiContract {
  check: () => Promise<UpdateCheckResult | null>
  download: () => Promise<UpdateDownloadResult>
  onUpdateAvailable: (callback: (info: { latest?: string }) => void) => () => void
}
