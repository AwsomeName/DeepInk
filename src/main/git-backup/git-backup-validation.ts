import { basename } from 'node:path'
import { GitBackupError } from './git-backup-error'

export type ParsedRepositoryInput =
  | { kind: 'github-name'; name: string }
  | { kind: 'remote-url'; url: string; label: string }

const PROJECT_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/
const SCP_REMOTE_PATTERN = /^(?:[A-Za-z0-9._-]+@)?[A-Za-z0-9.-]+:[^\s\u0000-\u001f]+$/

function isScpRemote(value: string): boolean {
  return !value.includes('://') && SCP_REMOTE_PATTERN.test(value)
}

export function normalizeGitHubUsername(value: string): string {
  const username = value.trim()
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(username)) {
    throw new GitBackupError('INVALID_INPUT', '请输入有效的 GitHub 账号')
  }
  return username
}

export function parseRepositoryInput(value: string): ParsedRepositoryInput {
  const input = value.trim()
  if (!input || input.length > 2048 || /[\u0000-\u001f\u007f]/.test(input)) {
    throw new GitBackupError('INVALID_INPUT', '请输入有效的远程仓库地址或项目名')
  }

  if (isScpRemote(input)) {
    return { kind: 'remote-url', url: input, label: remoteLabel(input) }
  }

  try {
    const parsed = new URL(input)
    if (!['https:', 'ssh:'].includes(parsed.protocol)) {
      throw new GitBackupError('INVALID_INPUT', '远程仓库只支持 HTTPS 或 SSH 地址')
    }
    if (!parsed.hostname || parsed.username || parsed.password) {
      throw new GitBackupError('INVALID_INPUT', '远程仓库地址不能包含内嵌账号或密码')
    }
    return { kind: 'remote-url', url: input, label: remoteLabel(input) }
  } catch (error: unknown) {
    if (error instanceof GitBackupError) throw error
  }

  if (!PROJECT_NAME_PATTERN.test(input) || input === '.' || input === '..') {
    throw new GitBackupError('INVALID_INPUT', '项目名只能包含字母、数字、点、下划线和连字符')
  }
  return { kind: 'github-name', name: input }
}

export function remoteLabel(remoteUrl: string): string {
  const withoutGit = remoteUrl.replace(/\.git$/i, '')
  if (isScpRemote(withoutGit)) return withoutGit.replace(':', '/')
  try {
    const parsed = new URL(withoutGit)
    return `${parsed.host}${parsed.pathname}`.replace(/^\/+|\/+$/g, '')
  } catch {
    return basename(withoutGit)
  }
}

const SENSITIVE_FILE_PATTERNS = [
  /(^|\/)\.env(?:\.|$)/i,
  /(^|\/)(?:id_rsa|id_dsa|id_ecdsa|id_ed25519)(?:\.|$)/i,
  /\.(?:pem|p12|pfx|key)$/i,
  /(^|\/)(?:credentials|secrets?)\.(?:json|ya?ml|toml)$/i,
]

export function findSensitiveFiles(paths: string[]): string[] {
  return paths
    .map((path) => path.replace(/\\/g, '/'))
    .filter((path) => SENSITIVE_FILE_PATTERNS.some((pattern) => pattern.test(path)))
    .slice(0, 20)
}
