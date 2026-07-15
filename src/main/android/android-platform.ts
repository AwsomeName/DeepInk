import { app } from 'electron'
import { homedir } from 'os'
import { join } from 'path'

/**
 * Android ADB 跨平台路径工具
 *
 * 集中处理 macOS / Windows / Linux 之间的差异。
 */

/** 是否 Windows */
export function isWindows(): boolean {
  return process.platform === 'win32'
}

/** 给二进制名加上 Windows 的 .exe 后缀 */
export function withExe(name: string): string {
  return isWindows() ? `${name}.exe` : name
}

// ─── 目录布局 ───────────────────────────────────────

/** CCLink Studio 可选自带 platform-tools 根目录 */
export function getSdkRoot(): string {
  return join(app.getPath('userData'), 'android-sdk')
}

/** platform-tools 目录（含 adb） */
export function getPlatformToolsDir(): string {
  return join(getSdkRoot(), 'platform-tools')
}

/** adb 二进制路径（自管理 SDK 内） */
export function getAdbPath(): string {
  return join(getPlatformToolsDir(), withExe('adb'))
}

/**
 * 系统外部 Android SDK 的常见根目录候选
 *
 * 用于「优先复用用户已有 SDK」的发现逻辑。
 */
export function getExternalSdkRoots(): string[] {
  const roots: string[] = []
  if (process.env['ANDROID_HOME']) roots.push(process.env['ANDROID_HOME'])
  if (process.env['ANDROID_SDK_ROOT']) roots.push(process.env['ANDROID_SDK_ROOT'])

  switch (process.platform) {
    case 'darwin':
      roots.push(join(homedir(), 'Library', 'Android', 'sdk'))
      break
    case 'win32':
      if (process.env['LOCALAPPDATA']) {
        roots.push(join(process.env['LOCALAPPDATA'], 'Android', 'Sdk'))
      }
      break
    default:
      roots.push(join(homedir(), 'Android', 'Sdk'))
      break
  }
  return roots
}
