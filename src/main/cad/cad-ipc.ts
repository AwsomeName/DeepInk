import { ipcMain } from 'electron'
import type { CadConvertRequest } from '../../shared/ipc/cad'
import type { CadConversionService } from './cad-conversion-service'

export function registerCadIpc(cadConversionService: CadConversionService): void {
  ipcMain.handle('cad:getBackendStatus', () => cadConversionService.getBackendStatus())
  ipcMain.handle('cad:getModelSupport', (_event, inputPath: string) =>
    cadConversionService.getModelSupport(inputPath),
  )
  ipcMain.handle('cad:inspectModel', (_event, inputPath: string) =>
    cadConversionService.inspectModel(inputPath),
  )
  ipcMain.handle('cad:getCacheStatus', () => cadConversionService.getCacheStatus())
  ipcMain.handle('cad:clearCache', () => cadConversionService.clearCache())
  ipcMain.handle('cad:convertModel', (_event, request: CadConvertRequest) =>
    cadConversionService.convertModel(request),
  )
}
