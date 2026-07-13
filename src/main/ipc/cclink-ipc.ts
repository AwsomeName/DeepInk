import { ipcMain } from 'electron'
import type { CclinkStore } from '../cclink/cclink-store'
import type { CclinkIdentityService } from '../cclink/cclink-identity-service'
import type { CclinkFileService } from '../cclink/cclink-file-service'
import type { CclinkRealtimeService } from '../cclink/cclink-realtime-service'
import type { CclinkFileReadRequest, CclinkFileTreeRequest } from '../../shared/ipc/cclink'

export function registerCclinkIpc(
  cclinkStore: CclinkStore,
  identityService?: CclinkIdentityService,
  fileService?: CclinkFileService,
  realtimeService?: CclinkRealtimeService,
): void {
  ipcMain.handle('cclink:getState', () => cclinkStore.getState())

  ipcMain.handle('cclink:getIdentity', () => {
    return identityService?.getCachedIdentity() ?? null
  })

  ipcMain.handle('cclink:preflightLegacyImport', () => {
    if (!identityService) throw new Error('CCLink identity service 未初始化')
    return identityService.preflightLegacyImport()
  })

  ipcMain.handle('cclink:ensureIdentity', () => {
    if (!identityService) throw new Error('CCLink identity service 未初始化')
    return identityService.ensureIdentity()
  })

  ipcMain.handle('cclink:sendLegacySmsCode', () => {
    if (!identityService) throw new Error('CCLink identity service 未初始化')
    return identityService.sendLegacySmsCode()
  })

  ipcMain.handle('cclink:importLegacyIdentity', (_event, smsCode: string) => {
    if (!identityService) throw new Error('CCLink identity service 未初始化')
    return identityService.importLegacyIdentity(smsCode)
  })

  ipcMain.handle('cclink:clearIdentity', () => {
    return identityService?.clearIdentity()
  })

  ipcMain.handle('cclink:listServers', () => cclinkStore.listServers())

  ipcMain.handle('cclink:removeServer', (_event, serverId: string) => {
    return cclinkStore.removeServer(serverId)
  })

  ipcMain.handle('cclink:listSessions', (_event, serverId?: string) => {
    return cclinkStore.listSessions(serverId)
  })

  ipcMain.handle('cclink:syncPairedAgents', async () => {
    if (!identityService) throw new Error('CCLink identity service 未初始化')
    const servers = await identityService.listPairedAgents()
    for (const server of servers) {
      await cclinkStore.upsertServer(server)
    }
    return cclinkStore.listServers()
  })

  ipcMain.handle('cclink:removeSession', (_event, sessionId: string) => {
    return cclinkStore.removeSession(sessionId)
  })

  ipcMain.handle('cclink:listMessages', (_event, sessionId: string) => {
    return cclinkStore.listMessages(sessionId)
  })

  ipcMain.handle('cclink:sendLocalMessage', (_event, sessionId: string, content: string) => {
    return cclinkStore.sendLocalMessage(sessionId, content)
  })

  ipcMain.handle('cclink:listFileTree', (_event, request: CclinkFileTreeRequest) => {
    if (!fileService) return { success: false, unavailable: true, error: 'CCLink 文件服务未初始化' }
    return fileService.listFileTree(request)
  })

  ipcMain.handle('cclink:readFile', (_event, request: CclinkFileReadRequest) => {
    if (!fileService) return { success: false, unavailable: true, error: 'CCLink 文件服务未初始化' }
    return fileService.readFile(request)
  })

  ipcMain.handle('cclink:getRealtimeStatus', () => {
    return realtimeService?.getStatus() ?? { state: 'idle' }
  })

  ipcMain.handle('cclink:connectRealtime', () => {
    if (!realtimeService) return { state: 'error', error: 'CCLink 实时连接服务未初始化' }
    return realtimeService.connect()
  })

  ipcMain.handle('cclink:disconnectRealtime', () => {
    if (!realtimeService) return { state: 'offline' }
    return realtimeService.disconnect()
  })

  ipcMain.handle('cclink:clearLocalData', () => cclinkStore.clear())

  ipcMain.handle('cclink:seedDemoData', () => cclinkStore.seedDemoData())
}
