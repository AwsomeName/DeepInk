import { app } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

/**
 * 发现 Electron 自动分配的 CDP 调试端口
 *
 * 通过 --remote-debugging-port=0 启动后，Chromium 会将实际端口
 * 写入 userData 目录下的 DevToolsActivePort 文件
 */
export async function discoverCdpPort(
  maxRetries = 50,
  intervalMs = 200,
): Promise<number> {
  const userDataPath = app.getPath('userData')
  const devToolsPortFile = join(userDataPath, 'DevToolsActivePort')

  for (let i = 0; i < maxRetries; i++) {
    if (existsSync(devToolsPortFile)) {
      try {
        const content = readFileSync(devToolsPortFile, 'utf8')
        const port = parseInt(content.split('\n')[0], 10)
        if (port > 0 && port < 65536) {
          return port
        }
      } catch {
        // 文件可能正在写入中，重试
      }
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  throw new Error('CDP 端口发现失败：DevToolsActivePort 文件未找到或无效')
}
