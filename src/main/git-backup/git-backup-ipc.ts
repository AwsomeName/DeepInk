import { ipcMain } from 'electron'
import type {
  GitBackupRunInput,
  GitBackupSaveAccountInput,
  GitBackupTestAccountInput,
} from '../../shared/ipc/git-backup'
import type { GitBackupService } from './git-backup-service'

export function registerGitBackupIpc(service: GitBackupService): void {
  ipcMain.handle('gitBackup:getAccountStatus', () => service.getAccountStatus())
  ipcMain.handle('gitBackup:saveAccount', (_event, input: GitBackupSaveAccountInput) =>
    service.saveAccount(input),
  )
  ipcMain.handle('gitBackup:clearAccount', () => service.clearAccount())
  ipcMain.handle('gitBackup:testAccount', (_event, input?: GitBackupTestAccountInput) =>
    service.testAccount(input),
  )
  ipcMain.handle('gitBackup:getProjectStatus', (_event, workspacePath: string) =>
    service.getProjectStatus(workspacePath),
  )
  ipcMain.handle('gitBackup:backup', (_event, input: GitBackupRunInput) => service.backup(input))
}
