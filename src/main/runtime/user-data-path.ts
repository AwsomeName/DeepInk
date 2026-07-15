import type { App } from 'electron'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const FIXED_USER_DATA_DIR_NAME = 'CCLink Studio'

export interface UserDataPathDiagnostics {
  fixedUserDataPath: string
}

let lastUserDataPathDiagnostics: UserDataPathDiagnostics | null = null

export function getUserDataPathDiagnostics(): UserDataPathDiagnostics | null {
  return lastUserDataPathDiagnostics
}

/**
 * 固定本机数据目录，避免 dev/package/appName 差异造成状态分裂。
 *
 * 必须在任何服务读取 app.getPath('userData') 前调用。
 */
export function configureFixedUserDataPath(app: App): string {
  const fixedUserDataPath = join(app.getPath('appData'), FIXED_USER_DATA_DIR_NAME)
  mkdirSync(fixedUserDataPath, { recursive: true })
  lastUserDataPathDiagnostics = { fixedUserDataPath }

  app.setName(FIXED_USER_DATA_DIR_NAME)
  app.setPath('userData', fixedUserDataPath)
  return fixedUserDataPath
}
