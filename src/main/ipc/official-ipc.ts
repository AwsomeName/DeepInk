import { ipcMain } from 'electron'
import type { OfficialIntegration } from '../official/official-integration'

export function registerOfficialIpc(officialIntegration: OfficialIntegration): void {
  ipcMain.handle('official:getStatus', () => officialIntegration.getStatus())
}
