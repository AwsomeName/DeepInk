import { ipcMain } from 'electron'
import type { MeshyService } from './meshy-service'
import type {
  MeshyCreatePreviewOptions,
  MeshyCreateRefineOptions,
  MeshyGenerateAndSaveOptions,
  MeshySaveAssetOptions,
} from './types'

function ok<T>(data: T): { success: true; data: T } {
  return { success: true, data }
}

function fail(err: unknown): { success: false; error: string } {
  return { success: false, error: err instanceof Error ? err.message : String(err) }
}

export function registerMeshyIpc(meshyService: MeshyService): void {
  ipcMain.handle('meshy:createPreview', async (_event, options: MeshyCreatePreviewOptions) => {
    try {
      return ok(await meshyService.createPreview(options))
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle('meshy:createRefine', async (_event, options: MeshyCreateRefineOptions) => {
    try {
      return ok(await meshyService.createRefine(options))
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle('meshy:getTask', async (_event, taskId: string) => {
    try {
      return ok(await meshyService.getTask(taskId))
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle('meshy:saveAsset', async (_event, options: MeshySaveAssetOptions) => {
    try {
      return ok(await meshyService.saveAsset(options))
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle('meshy:generateAndSave', async (_event, options: MeshyGenerateAndSaveOptions) => {
    try {
      return ok(await meshyService.generateAndSave(options))
    } catch (err) {
      return fail(err)
    }
  })

  console.log('[MeshyIPC] Meshy IPC 已注册')
}
