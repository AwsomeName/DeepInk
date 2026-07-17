import type { GitBackupErrorCode } from '../../shared/ipc/git-backup'

export class GitBackupError extends Error {
  readonly code: GitBackupErrorCode
  readonly details?: Record<string, unknown>

  constructor(
    code: GitBackupErrorCode,
    message: string,
    details?: Record<string, unknown>,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'GitBackupError'
    this.code = code
    this.details = details
  }
}

export function toGitBackupError(error: unknown): GitBackupError {
  if (error instanceof GitBackupError) return error
  return new GitBackupError(
    'UNKNOWN',
    error instanceof Error ? error.message : String(error),
    undefined,
    error instanceof Error ? { cause: error } : undefined,
  )
}
