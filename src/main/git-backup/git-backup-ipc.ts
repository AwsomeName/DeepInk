import type { IpcMainInvokeEvent } from 'electron'
import type {
  GitBackupRunInput,
  GitBackupSaveAccountInput,
  GitBackupTestAccountInput,
} from '../../shared/ipc/git-backup'
import type { GitBackupService } from './git-backup-service'
import { registerTrustedIpcHandler, type TrustedRendererGuard } from '../ipc/trusted-renderer-guard'
import {
  gitBackupRunSchema,
  gitBackupSaveAccountSchema,
  gitBackupTestAccountSchema,
  gitBackupWorkspacePathSchema,
} from '../ipc/workbench-ipc-schema'

export function registerGitBackupIpc(
  service: GitBackupService,
  trustedRendererGuard: TrustedRendererGuard,
): void {
  const handle = <Args extends unknown[], Result>(
    channel: string,
    handler: (event: IpcMainInvokeEvent, ...args: Args) => Result,
  ): void => registerTrustedIpcHandler(channel, trustedRendererGuard, handler)

  handle('gitBackup:getAccountStatus', () => service.getAccountStatus())
  handle('gitBackup:saveAccount', (_event, input: GitBackupSaveAccountInput) =>
    service.saveAccount(gitBackupSaveAccountSchema.parse(input)),
  )
  handle('gitBackup:clearAccount', () => service.clearAccount())
  handle('gitBackup:testAccount', (_event, input?: GitBackupTestAccountInput) =>
    service.testAccount(gitBackupTestAccountSchema.parse(input)),
  )
  handle('gitBackup:getProjectStatus', (_event, workspacePath: string) =>
    service.getProjectStatus(gitBackupWorkspacePathSchema.parse(workspacePath)),
  )
  handle('gitBackup:backup', (_event, input: GitBackupRunInput) =>
    service.backup(gitBackupRunSchema.parse(input)),
  )
}
