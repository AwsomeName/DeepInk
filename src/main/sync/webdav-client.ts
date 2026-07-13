/**
 * WebdavClientWrapper — WebDAV 协议封装
 *
 * 基于 webdav npm 包，隔离所有 WebDAV 协议细节。
 * 使用异步工厂方法（因为 webdav v5 是 ESM-only）。
 * 针对坚果云做了特化处理（分页、限流、跳过 OPTIONS）。
 */

import type { SyncConfig, WebdavProvider, RemoteFileInfo } from './types'

// webdav 包的类型（运行时通过 dynamic import 加载）
type WebDAVClient = import('webdav').WebDAVClient
type FileStat = import('webdav').FileStat

export class WebdavClientWrapper {
  private client!: WebDAVClient
  private provider: WebdavProvider

  /** 最近请求的时间戳列表（用于限流） */
  private requestTimestamps: number[] = []

  private constructor(provider: WebdavProvider) {
    this.provider = provider
  }

  /**
   * 异步工厂方法（webdav v5 是 ESM-only，必须 dynamic import）
   */
  static async create(config: SyncConfig, password: string): Promise<WebdavClientWrapper> {
    const { createClient } = await import('webdav')
    const instance = new WebdavClientWrapper(config.provider)
    instance.client = createClient(config.serverUrl, {
      username: config.username,
      password: password,
    })
    return instance
  }

  // ─── 连接 ────────────────────────────────────────

  /** 测试连接（坚果云不做 OPTIONS，直接尝试 stat） */
  async testConnection(remotePath: string): Promise<{ success: boolean; error?: string }> {
    try {
      // 坚果云的 OPTIONS 返回 501，所以不能用 checkClient()
      // 先确保远程目录存在，不存在则创建
      const exists = await this.client.exists(remotePath)
      if (!exists) {
        await this.client.createDirectory(remotePath, { recursive: true })
      }
      return { success: true }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, error: message }
    }
  }

  // ─── 目录操作 ────────────────────────────────────

  /** 确保远程目录存在 */
  async ensureDir(remotePath: string): Promise<void> {
    await this.throttle()
    const exists = await this.client.exists(remotePath)
    if (!exists) {
      await this.client.createDirectory(remotePath, { recursive: true })
    }
  }

  /**
   * 递归列出远程目录下所有文件
   * 返回扁平化的 RemoteFileInfo 数组
   */
  async listFiles(remotePath: string): Promise<RemoteFileInfo[]> {
    await this.throttle()

    const result = await this.client.getDirectoryContents(remotePath, {
      deep: true,
      details: true,
    })

    // webdav 返回的 data 可能是数组或带分页的对象
    const items: FileStat[] = Array.isArray(result)
      ? result
      : (result as { data: FileStat[] }).data ?? []

    // 过滤只保留文件（非目录），并转换为 RemoteFileInfo
    const baseLen = remotePath.endsWith('/') ? remotePath.length : remotePath.length + 1
    return items
      .filter((item) => item.type === 'file')
      .map((item) => this.toRemoteFileInfo(item, baseLen))
      // 安全过滤：拒绝包含 .. 的路径（防止路径遍历）
      .filter((item) => !item.relativePath.includes('..'))
  }

  // ─── 文件操作 ────────────────────────────────────

  /** 上传文件 */
  async putFile(remotePath: string, content: string | Buffer): Promise<{ etag: string | null }> {
    await this.throttle()
    await this.client.putFileContents(remotePath, content, { overwrite: true })
    // 上传后获取 ETag
    try {
      const stat = await this.statFile(remotePath)
      return { etag: stat.etag }
    } catch {
      return { etag: null }
    }
  }

  /** 下载文件内容 */
  async getFile(remotePath: string): Promise<Buffer> {
    await this.throttle()
    const content = await this.client.getFileContents(remotePath)
    return Buffer.isBuffer(content) ? content : Buffer.from(content as string)
  }

  /** 删除远程文件 */
  async deleteFile(remotePath: string): Promise<void> {
    await this.throttle()
    await this.client.deleteFile(remotePath)
  }

  /** 获取文件元数据 */
  async statFile(remotePath: string): Promise<RemoteFileInfo> {
    await this.throttle()
    const stat = await this.client.stat(remotePath) as FileStat
    return this.toRemoteFileInfo(stat, 0)
  }

  // ─── 内部方法 ────────────────────────────────────

  /** 将 webdav FileStat 转换为 RemoteFileInfo */
  private toRemoteFileInfo(item: FileStat, basePathLen: number): RemoteFileInfo {
    const path = item.filename
    return {
      path,
      relativePath: basePathLen > 0 ? path.slice(basePathLen) : path,
      basename: item.basename || path.split('/').pop() || '',
      size: item.size ?? 0,
      lastModified: item.lastmod ? new Date(item.lastmod).getTime() : 0,
      etag: ((item as unknown as Record<string, unknown>).etag as string | null) ?? null,
      isDirectory: item.type === 'directory',
    }
  }

  /**
   * 客户端限流器
   * 坚果云：600 请求 / 30 分钟（免费版）
   * 通用：不限流
   */
  private async throttle(): Promise<void> {
    if (this.provider !== 'jianguoyun') return

    const now = Date.now()
    const windowMs = 30 * 60 * 1000 // 30 分钟
    const maxRequests = 580 // 留 20 的余量

    // 清理过期时间戳
    this.requestTimestamps = this.requestTimestamps.filter((t) => now - t < windowMs)

    if (this.requestTimestamps.length >= maxRequests) {
      // 计算需要等待的时间
      const oldestInWindow = this.requestTimestamps[0]
      const waitMs = oldestInWindow + windowMs - now + 1000 // 多等 1 秒
      console.warn(`[Sync] 坚果云限流：等待 ${Math.round(waitMs / 1000)} 秒...`)
      await new Promise((resolve) => setTimeout(resolve, waitMs))
    }

    this.requestTimestamps.push(Date.now())
  }
}
