import { ipcMain, shell } from 'electron'
import { FileService } from './file-service'
import { SettingsService } from '../settings/settings-service'
import { homedir } from 'os'

/**
 * 注册文件系统相关的 IPC 处理器
 */
export function registerFsIpc(fs: FileService, settingsService: SettingsService): void {
  // 获取用户 Home 目录路径
  ipcMain.handle('fs:getHomePath', () => {
    return homedir()
  })

  // 读取目录内容（根据设置决定是否显示隐藏文件）
  ipcMain.handle('fs:readDir', async (_event, dirPath: string) => {
    return fs.readDir(dirPath, { showHiddenFiles: settingsService.getAll().showHiddenFiles })
  })

  // 读取文件内容
  ipcMain.handle('fs:readFile', async (_event, filePath: string) => {
    return fs.readFile(filePath)
  })

  // 写入文件
  ipcMain.handle('fs:writeFile', async (_event, filePath: string, content: string) => {
    await fs.writeFile(filePath, content)
  })

  // 获取文件/目录元数据
  ipcMain.handle('fs:stat', async (_event, filePath: string) => {
    return fs.stat(filePath)
  })

  // 创建目录
  ipcMain.handle('fs:mkdir', async (_event, dirPath: string) => {
    await fs.mkdir(dirPath)
  })

  // 重命名
  ipcMain.handle('fs:rename', async (_event, oldPath: string, newPath: string) => {
    await fs.rename(oldPath, newPath)
  })

  // 删除文件
  ipcMain.handle('fs:delete', async (_event, filePath: string) => {
    await fs.delete(filePath)
  })

  // 用系统文件管理器打开路径
  ipcMain.handle('fs:openPath', async (_event, path: string) => {
    const error = await shell.openPath(path)
    if (error) throw new Error(error)
  })
}
