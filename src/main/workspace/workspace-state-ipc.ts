import { ipcMain } from 'electron'
import type { WorkspaceStateSection } from '../../shared/ipc/workspace-state'
import { WorkspaceStateService } from './workspace-state-service'

export function registerWorkspaceStateIpc(workspaceStateService: WorkspaceStateService): void {
  ipcMain.handle('workspaceState:get', (_event, workspaceKey?: string | null) => {
    return workspaceStateService.getSnapshot(workspaceKey)
  })

  ipcMain.handle(
    'workspaceState:setSection',
    async (_event, workspaceKey: string | null | undefined, section: WorkspaceStateSection, value: unknown) => {
      try {
        const snapshot = await workspaceStateService.setSection(workspaceKey, section, value)
        return { success: true, snapshot }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, error: message }
      }
    },
  )

  ipcMain.handle('workspaceState:clear', async (_event, workspaceKey?: string | null) => {
    try {
      await workspaceStateService.clear(workspaceKey)
      return { success: true }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, error: message }
    }
  })
}
