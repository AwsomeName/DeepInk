import { ipcMain } from 'electron'
import type { HardwareService } from './hardware-service'

export function registerHardwareIpc(hardwareService: HardwareService): void {
  ipcMain.handle('hardware:scanWorkspace', (_event, workspacePath: string) =>
    hardwareService.scanWorkspace(workspacePath),
  )

  ipcMain.handle('hardware:inspectProductionPackage', (_event, workspacePath: string) =>
    hardwareService.inspectProductionPackage(workspacePath),
  )

  ipcMain.handle(
    'hardware:readGerberLayerPreview',
    (_event, workspacePath: string, packagePath: string, entry: string) =>
      hardwareService.readGerberLayerPreview(workspacePath, packagePath, entry),
  )

  ipcMain.handle(
    'hardware:readGerberLayerGeometry',
    (_event, workspacePath: string, packagePath: string, entry: string) =>
      hardwareService.readGerberLayerGeometry(workspacePath, packagePath, entry),
  )

  ipcMain.handle('hardware:writeProductionReportMarkdown', (_event, workspacePath: string) =>
    hardwareService.writeProductionReportMarkdown(workspacePath),
  )
}
