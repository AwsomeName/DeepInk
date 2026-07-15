import { constants } from 'node:fs'
import { access } from 'node:fs/promises'
import { homedir } from 'node:os'
import { delimiter } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface ClaudeCodeStatus {
  installed: boolean
  path: string | null
  source: 'configured' | 'known-path' | 'shell-path' | 'spawn-path' | 'not-found'
  error?: string
}

const KNOWN_CLAUDE_PATHS = [
  '/opt/homebrew/bin/claude',
  '/usr/local/bin/claude',
  `${homedir()}/.local/bin/claude`,
  `${homedir()}/.npm-global/bin/claude`,
]

function expandHome(path: string): string {
  if (path === '~') return homedir()
  if (path.startsWith('~/')) return `${homedir()}${path.slice(1)}`
  return path
}

async function canExecute(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

async function findWithShell(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('/bin/zsh', ['-lc', 'command -v claude'], {
      timeout: 5000,
      env: {
        ...process.env,
        PATH: [
          '/opt/homebrew/bin',
          '/usr/local/bin',
          `${homedir()}/.local/bin`,
          `${homedir()}/.npm-global/bin`,
          process.env.PATH ?? '',
        ].join(delimiter),
      },
    })
    return stdout.trim() || null
  } catch {
    return null
  }
}

export async function detectClaudeCode(configuredPath?: string): Promise<ClaudeCodeStatus> {
  const configured = configuredPath?.trim()
  if (configured) {
    const path = expandHome(configured)
    if (await canExecute(path)) {
      return { installed: true, path, source: 'configured' }
    }
    return {
      installed: false,
      path,
      source: 'configured',
      error: `配置的 Claude Code 路径不可用: ${path}`,
    }
  }

  for (const candidate of KNOWN_CLAUDE_PATHS) {
    if (await canExecute(candidate)) {
      return { installed: true, path: candidate, source: 'known-path' }
    }
  }

  const shellPath = await findWithShell()
  if (shellPath) {
    return { installed: true, path: shellPath, source: 'shell-path' }
  }

  return {
    installed: false,
    path: null,
    source: 'not-found',
    error: '未找到 Claude Code CLI。请安装 Claude Code，或在设置页手动填写 claude 路径。',
  }
}
