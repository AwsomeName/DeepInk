/**
 * SyncService — 核心同步引擎
 *
 * 三路对比同步（Three-way Comparison）：
 *   上次同步快照（Base）vs 本地当前（Local）vs 远程当前（Remote）
 *
 * 关键原则：
 *   - 仅在全部文件成功处理后更新 snapshot
 *   - 冲突时保留两份，绝不静默丢数据
 *   - 支持手动触发 + 定时自动同步 + 文件变更自动上传
 */

import { createHash } from 'crypto'
import { readFile, writeFile, stat, mkdir, readdir, rm } from 'fs/promises'
import { existsSync, watch } from 'fs'
import { join, relative, dirname, extname, posix } from 'path'
import { app, BrowserWindow } from 'electron'
import type {
  SyncConfig,
  SyncState,
  SyncSnapshot,
  SyncResult,
  SyncStatus,
  SyncAction,
  SyncConfigStore,
  LocalFileInfo,
  RemoteFileInfo,
  RunSyncOptions,
  SyncHistoryEntry,
} from './types'
import { WebdavClientWrapper } from './webdav-client'
import { SyncCredentialStore } from './sync-credential-store'
import { SyncHistoryStore } from './sync-history'

export class SyncService {
  /** 同步配置（持久化） */
  private configStore: SyncConfigStore = { config: null, state: null }

  /** 当前同步状态 */
  private status: SyncStatus = {
    phase: 'idle',
    message: '',
    totalFiles: 0,
    processedFiles: 0,
    lastResult: null,
    error: null,
  }

  /** 是否正在同步 */
  private syncing = false

  /** 持久化文件路径 */
  private readonly storeFilePath: string

  // ─── 自动同步相关 ──────────────────────────────────

  /** 定时同步定时器 */
  private autoSyncTimer: ReturnType<typeof setInterval> | null = null

  /** 文件监听器 */
  private fileWatcher: { close: () => void } | null = null

  /** 文件变更 debounce 定时器 */
  private debounceTimer: ReturnType<typeof setTimeout> | null = null

  /** 凭据存储（通过 injectDependencies 注入） */
  private credentialStore: SyncCredentialStore | null = null

  /** 主窗口引用（通过 injectDependencies 注入） */
  private mainWindow: BrowserWindow | null = null

  /** 当前工作区路径（自动同步用） */
  private currentWorkspacePath: string = ''

  /** 同步历史存储 */
  private historyStore: SyncHistoryStore

  constructor() {
    this.storeFilePath = join(app.getPath('userData'), 'sync-store.json')
    this.historyStore = new SyncHistoryStore()
  }

  // ─── 生命周期 ────────────────────────────────────

  /** 从磁盘加载配置和状态 */
  async loadState(): Promise<void> {
    if (existsSync(this.storeFilePath)) {
      try {
        const raw = await readFile(this.storeFilePath, 'utf-8')
        this.configStore = JSON.parse(raw)

        // 向后兼容：补充新增的 SyncConfig 字段默认值
        if (this.configStore.config) {
          const cfg = this.configStore.config as any
          if (cfg.autoSyncInterval === undefined) cfg.autoSyncInterval = 0
          if (cfg.autoUploadOnSave === undefined) cfg.autoUploadOnSave = false
          if (cfg.syncOnStartup === undefined) cfg.syncOnStartup = false
        }
      } catch (err) {
        console.error('[Sync] 加载同步状态失败:', err)
        this.configStore = { config: null, state: null }
      }
    }

    // 加载同步历史
    await this.historyStore.load()
  }

  /** 保存配置和状态到磁盘 */
  async saveState(): Promise<void> {
    try {
      await writeFile(this.storeFilePath, JSON.stringify(this.configStore, null, 2), 'utf-8')
    } catch (err) {
      console.error('[Sync] 保存同步状态失败:', err)
    }
  }

  /** 注入依赖（在 IPC 注册时调用） */
  injectDependencies(
    credentialStore: SyncCredentialStore,
    mainWindow: BrowserWindow,
  ): void {
    this.credentialStore = credentialStore
    this.mainWindow = mainWindow
  }

  /** 启动自动同步（定时 + 文件监听 + 启动拉取） */
  startAutoSync(workspacePath: string): void {
    const config = this.getConfig()
    if (!config) return

    this.currentWorkspacePath = workspacePath || this.currentWorkspacePath
    if (!this.currentWorkspacePath) {
      console.warn('[Sync] startAutoSync: 无工作区路径')
      return
    }

    // 先停止已有的自动同步
    this.stopAutoSync()

    // 1. 定时同步
    if (config.autoSyncInterval > 0) {
      const intervalMs = config.autoSyncInterval * 60 * 1000
      console.log(`[Sync] 启动定时同步，间隔 ${config.autoSyncInterval} 分钟`)
      this.autoSyncTimer = setInterval(() => {
        this.runAutoSync('bidirectional', 'scheduled')
      }, intervalMs)
    }

    // 2. 文件监听自动上传
    if (config.autoUploadOnSave) {
      this.startFileWatcher()
    }

    // 3. 启动时拉取
    if (config.syncOnStartup) {
      console.log('[Sync] 启动时自动拉取')
      this.runAutoSync('download', 'startup')
    }

    console.log('[Sync] 自动同步已启动')
  }

  /** 停止所有自动同步 */
  stopAutoSync(): void {
    if (this.autoSyncTimer) {
      clearInterval(this.autoSyncTimer)
      this.autoSyncTimer = null
    }

    if (this.fileWatcher) {
      this.fileWatcher.close()
      this.fileWatcher = null
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }

    console.log('[Sync] 自动同步已停止')
  }

  /** 销毁（窗口关闭时调用） */
  destroy(): void {
    this.stopAutoSync()
    console.log('[Sync] SyncService 已销毁')
  }

  // ─── 配置管理 ────────────────────────────────────

  /** 获取当前配置 */
  getConfig(): SyncConfig | null {
    return this.configStore.config
  }

  /** 保存配置 */
  async saveConfig(config: SyncConfig): Promise<void> {
    this.configStore.config = config
    await this.saveState()
  }

  /** 删除配置 */
  async deleteConfig(): Promise<void> {
    this.configStore.config = null
    this.configStore.state = null
    await this.saveState()
  }

  // ─── 状态查询 ────────────────────────────────────

  /** 获取当前同步状态 */
  getStatus(): SyncStatus {
    return { ...this.status }
  }

  // ─── 同步历史 ────────────────────────────────────

  /** 获取同步历史 */
  getHistory(limit?: number): SyncHistoryEntry[] {
    return this.historyStore.getEntries(limit)
  }

  /** 清空同步历史 */
  clearHistory(): void {
    this.historyStore.clear()
  }

  // ─── 连接测试 ────────────────────────────────────

  /** 测试 WebDAV 连接 */
  async testConnection(config: SyncConfig, password: string): Promise<{ success: boolean; error?: string }> {
    try {
      const client = await WebdavClientWrapper.create(config, password)
      return await client.testConnection(config.remotePath)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, error: message }
    }
  }

  // ─── 同步操作 ────────────────────────────────────

  /** 执行完整同步 */
  async runSync(
    config: SyncConfig,
    password: string,
    workspacePath: string,
    onStatusChange: (status: SyncStatus) => void,
    options?: RunSyncOptions,
  ): Promise<SyncResult> {
    const direction = options?.direction ?? 'bidirectional'
    const trigger = options?.trigger ?? 'manual'

    // 并发守卫
    if (this.syncing) {
      const result: SyncResult = {
        uploaded: [], downloaded: [], conflicts: [],
        deleted: [], skipped: [], errors: [{ path: '', error: '同步正在进行中' }],
      }
      return result
    }

    this.syncing = true
    const emptyResult: SyncResult = {
      uploaded: [], downloaded: [], conflicts: [],
      deleted: [], skipped: [], errors: [],
    }

    try {
      // ── Step 0: 连接 ──
      this.updateStatus('connecting', '正在连接服务器...', 0, 0, onStatusChange)
      const client = await WebdavClientWrapper.create(config, password)
      await client.ensureDir(config.remotePath)

      // ── Step 1: 扫描本地 ──
      this.updateStatus('scanning-local', '正在扫描本地文件...', 0, 0, onStatusChange)
      const snapshots = this.configStore.state?.snapshots ?? {}
      const includePaths = config.includePaths ?? []
      const localFiles = await this.scanLocal(workspacePath, snapshots, includePaths)

      // ── Step 2: 扫描远程 ──
      this.updateStatus('scanning-remote', '正在扫描远程文件...', 0, 0, onStatusChange)
      const remoteFiles = await this.scanRemote(client, config.remotePath, includePaths)

      // ── Step 3: 三路对比 ──
      this.updateStatus('comparing', '正在比较文件差异...', 0, 0, onStatusChange)
      const allActions = this.compare(localFiles, remoteFiles, snapshots)

      // 根据方向过滤操作
      const actions = this.filterActionsByDirection(allActions, direction)

      // ── Step 4: 执行操作 ──
      this.updateStatus('syncing', '正在同步文件...', actions.length, 0, onStatusChange)
      const { result, updatedRemote } = await this.executeActions(
        actions, client, workspacePath, config.remotePath,
        localFiles, remoteFiles, onStatusChange,
      )

      // ── Step 5: 更新快照（使用执行后的远程元数据） ──
      const newSnapshots = await this.buildNewSnapshots(localFiles, updatedRemote, result, workspacePath)
      // 保留失败文件的旧快照（避免丢失基准）
      const oldSnapshots = this.configStore.state?.snapshots ?? {}
      for (const errItem of result.errors) {
        if (oldSnapshots[errItem.path] && !newSnapshots[errItem.path]) {
          newSnapshots[errItem.path] = oldSnapshots[errItem.path]
        }
      }
      this.configStore.state = {
        configId: config.id,
        workspacePath,
        remotePath: config.remotePath,
        snapshots: newSnapshots,
        lastSyncAt: new Date().toISOString(),
      }
      this.configStore.config = config
      await this.saveState()

      this.updateStatus('done', '同步完成', actions.length, actions.length, onStatusChange, result)

      // 记录同步历史
      this.historyStore.addEntry(direction, trigger, result)
      await this.historyStore.save()

      return result

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[Sync] 同步失败:', message)
      this.updateStatus('error', `同步失败: ${message}`, 0, 0, onStatusChange)

      // 记录失败的历史
      const failResult: SyncResult = {
        ...emptyResult,
        errors: [{ path: '', error: message }],
      }
      this.historyStore.addEntry(direction, trigger, failResult)
      await this.historyStore.save()

      return failResult
    } finally {
      this.syncing = false
    }
  }

  // ─── 内部：自动同步 ──────────────────────────────

  /** 执行一次自动同步（内部使用） */
  private async runAutoSync(
    direction: 'upload' | 'download' | 'bidirectional' = 'bidirectional',
    trigger: 'scheduled' | 'auto-upload' | 'startup' = 'scheduled',
  ): Promise<void> {
    if (this.syncing) return

    const config = this.getConfig()
    if (!config || !this.credentialStore || !this.mainWindow) return

    const password = await this.credentialStore.getPassword(config.id)
    if (!password) {
      console.warn('[Sync] 自动同步：凭据丢失')
      return
    }

    const workspacePath = this.currentWorkspacePath
    if (!workspacePath) return

    const onStatusChange = (status: SyncStatus) => {
      try {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('sync:statusChanged', status)
        }
      } catch {
        // 窗口可能已关闭
      }
    }

    console.log(`[Sync] 自动同步触发 (${trigger}, ${direction})`)
    const result = await this.runSync(config, password, workspacePath, onStatusChange, {
      direction,
      trigger,
    })

    // 推送完成事件
    try {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('sync:syncComplete', {
          result,
          status: this.getStatus(),
        })
      }
    } catch {
      // 窗口可能已关闭
    }
  }

  /** 启动文件监听器 */
  private startFileWatcher(): void {
    if (this.fileWatcher) {
      this.fileWatcher.close()
    }

    const workspacePath = this.currentWorkspacePath
    if (!workspacePath || !existsSync(workspacePath)) return

    console.log(`[Sync] 启动文件监听: ${workspacePath}`)

    try {
      const watcher = watch(workspacePath, { recursive: true }, (_event, filename) => {
        if (!filename) return
        // 跳过隐藏文件、冲突文件、同步状态文件
        if (filename.startsWith('.')) return
        if (filename.includes('.remote.')) return

        // Debounce：500ms 内多次变更只触发一次同步
        if (this.debounceTimer) clearTimeout(this.debounceTimer)
        this.debounceTimer = setTimeout(() => {
          console.log(`[Sync] 文件变更: ${filename}，触发自动上传`)
          this.runAutoSync('upload', 'auto-upload')
        }, 500)
      })

      this.fileWatcher = watcher
    } catch (err) {
      console.error('[Sync] 文件监听启动失败:', err)
    }
  }

  /** 根据方向过滤同步操作 */
  private filterActionsByDirection(actions: SyncAction[], direction: 'upload' | 'download' | 'bidirectional'): SyncAction[] {
    if (direction === 'bidirectional') return actions

    return actions.map((action) => {
      switch (direction) {
        case 'upload':
          // 只执行上传相关操作，其他标记为 skip
          if (action.action === 'upload' || action.action === 'delete-remote') {
            return action
          }
          return { ...action, action: 'skip' as const }

        case 'download':
          // 只执行下载操作，其他标记为 skip
          if (action.action === 'download') {
            return action
          }
          return { ...action, action: 'skip' as const }

        default:
          return action
      }
    })
  }

  // ─── 内部：扫描 ──────────────────────────────────

  /**
   * 扫描本地工作区，返回 Map<relativePath, LocalFileInfo>
   * 增量优化：mtime 未变的文件直接复用 snapshot 中的 hash，跳过 readFile
   */
  private async scanLocal(
    workspacePath: string,
    snapshots: Record<string, SyncSnapshot>,
    includePaths: string[] = [],
  ): Promise<Map<string, LocalFileInfo>> {
    const files = new Map<string, LocalFileInfo>()

    if (!existsSync(workspacePath)) return files

    const filePaths = await this.walkDir(workspacePath, includePaths)
    let cached = 0

    for (const absolutePath of filePaths) {
      try {
        const rel = relative(workspacePath, absolutePath)
        const fileStat = await stat(absolutePath)

        // 增量扫描：mtime 没变 → 复用缓存的 hash
        const existing = snapshots[rel]
        let contentHash: string

        if (existing && existing.localMtime === fileStat.mtimeMs) {
          contentHash = existing.contentHash
          cached++
        } else {
          const content = await readFile(absolutePath)
          contentHash = this.hashContent(content)
        }

        files.set(rel, {
          relativePath: rel,
          absolutePath,
          size: fileStat.size,
          mtime: fileStat.mtimeMs,
          contentHash,
        })
      } catch (err) {
        console.warn(`[Sync] 跳过文件 ${absolutePath}:`, err)
      }
    }

    console.log(`[Sync] 本地扫描: ${files.size} 个文件, ${cached} 个命中缓存`)
    return files
  }

  /**
   * 扫描远程目录，返回 Map<relativePath, RemoteFileInfo>
   * @param includePaths 选择性同步：只保留这些一级子目录下的文件（空 = 全部）
   */
  private async scanRemote(
    client: WebdavClientWrapper,
    remotePath: string,
    includePaths: string[] = [],
  ): Promise<Map<string, RemoteFileInfo>> {
    const files = new Map<string, RemoteFileInfo>()

    const items = await client.listFiles(remotePath)
    for (const item of items) {
      if (!item.relativePath) continue

      // 选择性同步：只保留 includePaths 内的文件
      if (includePaths.length > 0) {
        const topDir = item.relativePath.split('/')[0]
        if (!includePaths.includes(topDir)) continue
      }

      files.set(item.relativePath, item)
    }

    return files
  }

  // ─── 内部：三路对比 ──────────────────────────────

  /**
   * 三路对比：本地 vs 远程 vs 快照
   * 返回待执行的操作列表
   */
  private compare(
    local: Map<string, LocalFileInfo>,
    remote: Map<string, RemoteFileInfo>,
    snapshots: Record<string, SyncSnapshot>,
  ): SyncAction[] {
    const actions: SyncAction[] = []

    // 收集所有路径
    const allPaths = new Set<string>()
    for (const path of local.keys()) allPaths.add(path)
    for (const path of remote.keys()) allPaths.add(path)
    for (const path of Object.keys(snapshots)) allPaths.add(path)

    for (const relPath of allPaths) {
      const inLocal = local.has(relPath)
      const inRemote = remote.has(relPath)
      const snapshot = snapshots[relPath] ?? null

      if (inLocal && inRemote) {
        // 两边都有
        const localFile = local.get(relPath)!
        const remoteFile = remote.get(relPath)!

        if (snapshot) {
          // 有基准快照 → 精确判断谁改了
          const localChanged = localFile.contentHash !== snapshot.contentHash
          // 远程变更：ETag 变了，或者大小变了（ETag 可能为 null）
          const remoteChanged = snapshot.remoteEtag !== null
            ? remoteFile.etag !== snapshot.remoteEtag
            : (remoteFile.size !== snapshot.remoteSize || remoteFile.lastModified !== snapshot.remoteMtime)

          if (localChanged && remoteChanged) {
            actions.push({ relativePath: relPath, action: 'conflict' })
          } else if (localChanged) {
            actions.push({ relativePath: relPath, action: 'upload' })
          } else if (remoteChanged) {
            actions.push({ relativePath: relPath, action: 'download' })
          } else {
            actions.push({ relativePath: relPath, action: 'skip' })
          }
        } else {
          // 没有快照（首次同步或新文件）
          const sameSize = localFile.size === remoteFile.size
          if (sameSize) {
            actions.push({ relativePath: relPath, action: 'skip' })
          } else {
            actions.push({ relativePath: relPath, action: 'conflict' })
          }
        }
      } else if (inLocal && !inRemote) {
        // 仅本地有
        if (snapshot) {
          // 远程被删除了 → 保守跳过（保留本地）
          actions.push({ relativePath: relPath, action: 'skip' })
        } else {
          // 新文件 → 上传
          actions.push({ relativePath: relPath, action: 'upload' })
        }
      } else if (!inLocal && inRemote) {
        // 仅远程有
        if (snapshot) {
          // 本地被删除了 → 同步删除远程
          actions.push({ relativePath: relPath, action: 'delete-remote' })
        } else {
          // 新文件 → 下载
          actions.push({ relativePath: relPath, action: 'download' })
        }
      } else {
        // 两边都没有 → 跳过
        actions.push({ relativePath: relPath, action: 'skip' })
      }
    }

    return actions
  }

  // ─── 内部：执行操作 ──────────────────────────────

  /** 执行同步操作列表，返回结果 + 更新后的远程文件信息 */
  private async executeActions(
    actions: SyncAction[],
    client: WebdavClientWrapper,
    workspacePath: string,
    remotePath: string,
    localFiles: Map<string, LocalFileInfo>,
    remoteFiles: Map<string, RemoteFileInfo>,
    onStatusChange: (status: SyncStatus) => void,
  ): Promise<{ result: SyncResult; updatedRemote: Map<string, RemoteFileInfo> }> {
    const result: SyncResult = {
      uploaded: [], downloaded: [], conflicts: [],
      deleted: [], skipped: [], errors: [],
    }

    // 过滤掉 skip
    const todo = actions.filter((a) => a.action !== 'skip')
    result.skipped = actions.filter((a) => a.action === 'skip').map((a) => a.relativePath)

    let processed = 0
    // 跟踪上传/删除后的远程元数据变化
    const updatedRemote = new Map(remoteFiles)

    for (const { relativePath, action } of todo) {
      try {
        const remoteFilePath = posix.join(remotePath, relativePath)

        switch (action) {
          case 'upload': {
            const localFile = localFiles.get(relativePath)
            if (!localFile) break
            const content = await readFile(localFile.absolutePath)
            // 确保远程子目录存在
            const remoteDir = posix.dirname(remoteFilePath)
            await client.ensureDir(remoteDir)
            await client.putFile(remoteFilePath, content)
            // 上传后获取新的远程元数据（ETag 等）
            try {
              const newStat = await client.statFile(remoteFilePath)
              updatedRemote.set(relativePath, newStat)
            } catch {
              // stat 失败不影响上传结果
            }
            result.uploaded.push(relativePath)
            break
          }

          case 'download': {
            const content = await client.getFile(remoteFilePath)
            const localFilePath = join(workspacePath, relativePath)
            // 确保本地子目录存在
            await mkdir(dirname(localFilePath), { recursive: true })
            await writeFile(localFilePath, content)
            result.downloaded.push(relativePath)
            break
          }

          case 'conflict': {
            // 保留两份：本地不动，远程版本下载为 .remote.{ext}
            const remoteContent = await client.getFile(remoteFilePath)
            const localFilePath = join(workspacePath, relativePath)
            const ext = extname(relativePath)
            const base = relativePath.slice(0, -ext.length || undefined)
            const conflictPath = join(workspacePath, `${base}.remote${ext}`)
            await mkdir(dirname(conflictPath), { recursive: true })
            await writeFile(conflictPath, remoteContent)
            result.conflicts.push(relativePath)
            break
          }

          case 'delete-remote': {
            await client.deleteFile(remoteFilePath)
            updatedRemote.delete(relativePath)
            result.deleted.push(relativePath)
            break
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(`[Sync] 操作失败 ${relativePath}:`, message)
        result.errors.push({ path: relativePath, error: message })
      }

      processed++
      this.updateStatus(
        'syncing',
        `正在同步 (${processed}/${todo.length})...`,
        todo.length,
        processed,
        onStatusChange,
      )
    }

    return { result, updatedRemote }
  }

  // ─── 内部：快照构建 ──────────────────────────────

  /** 同步成功后构建新的快照集合 */
  private async buildNewSnapshots(
    localFiles: Map<string, LocalFileInfo>,
    remoteFiles: Map<string, RemoteFileInfo>,
    result: SyncResult,
    workspacePath: string,
  ): Promise<Record<string, SyncSnapshot>> {
    const snapshots: Record<string, SyncSnapshot> = {}
    const now = new Date().toISOString()

    // 下载的文件：本地内容已经变了，需要重新读取本地 hash/mtime
    const downloadedSet = new Set(result.downloaded)

    // 对所有同步成功的文件记录快照
    const syncedPaths = new Set([
      ...result.uploaded,
      ...result.downloaded,
      ...result.skipped,
    ])

    for (const relPath of syncedPaths) {
      const localFile = localFiles.get(relPath)
      const remoteFile = remoteFiles.get(relPath)

      if (localFile || remoteFile) {
        // 下载的文件需要重新读本地 hash（内容已变）
        let contentHash = localFile?.contentHash ?? ''
        let localMtime = localFile?.mtime ?? 0

        if (downloadedSet.has(relPath)) {
          try {
            const absPath = join(workspacePath, relPath)
            const content = await readFile(absPath)
            const fileStat = await stat(absPath)
            contentHash = this.hashContent(content)
            localMtime = fileStat.mtimeMs
          } catch {
            // 读取失败则用远程信息兜底
            contentHash = remoteFile ? this.hashRemoteContent(remoteFile) : ''
            localMtime = 0
          }
        }

        snapshots[relPath] = {
          relativePath: relPath,
          contentHash,
          localMtime,
          remoteMtime: remoteFile?.lastModified ?? 0,
          remoteSize: remoteFile?.size ?? 0,
          remoteEtag: remoteFile?.etag ?? null,
          syncedAt: now,
        }
      }
    }

    // 冲突文件也记录快照（保留本地状态，远程版本存为 .remote.xxx）
    for (const relPath of result.conflicts) {
      const localFile = localFiles.get(relPath)
      const remoteFile = remoteFiles.get(relPath)
      if (localFile || remoteFile) {
        snapshots[relPath] = {
          relativePath: relPath,
          contentHash: localFile?.contentHash ?? '',
          localMtime: localFile?.mtime ?? 0,
          remoteMtime: remoteFile?.lastModified ?? 0,
          remoteSize: remoteFile?.size ?? 0,
          remoteEtag: remoteFile?.etag ?? null,
          syncedAt: now,
        }
      }
    }

    return snapshots
  }

  // ─── 工具方法 ────────────────────────────────────

  /** 计算 SHA-256 哈希 */
  private hashContent(content: string | Buffer): string {
    return createHash('sha256').update(content).digest('hex')
  }

  /** 用远程文件信息生成模拟哈希（无实际内容时用大小+时间戳） */
  private hashRemoteContent(remote: RemoteFileInfo): string {
    return createHash('sha256')
      .update(`${remote.size}:${remote.lastModified}:${remote.path}`)
      .digest('hex')
  }

  /** 需要跳过的目录名 */
  private static readonly SKIP_DIRS = new Set([
    'node_modules', '.git', '.svn', '.hg',
    'dist', 'build', 'out', '.next', '.nuxt',
    '__pycache__', '.venv', 'venv',
  ])

  /** 需要跳过的文件名 */
  private static readonly SKIP_FILES = new Set([
    'Thumbs.db', 'desktop.ini',
  ])

  /**
   * 递归遍历目录，返回所有文件路径
   * @param dirPath 目录绝对路径
   * @param includePaths 选择性同步：只扫描这些一级子目录（空 = 全部）
   * @param depth 当前递归深度（内部使用）
   */
  private async walkDir(
    dirPath: string,
    includePaths: string[] = [],
    depth: number = 0,
  ): Promise<string[]> {
    const results: string[] = []

    if (!existsSync(dirPath)) return results

    const entries = await readdir(dirPath, { withFileTypes: true })

    for (const entry of entries) {
      // 跳过隐藏文件/目录
      if (entry.name.startsWith('.')) continue
      // 跳过已知的大目录
      if (entry.isDirectory() && SyncService.SKIP_DIRS.has(entry.name)) continue
      // 跳过系统垃圾文件
      if (entry.isFile() && SyncService.SKIP_FILES.has(entry.name)) continue

      // 选择性同步：在顶层只处理选中的目录（根目录文件也跳过，与远程过滤一致）
      if (depth === 0 && includePaths.length > 0) {
        if (!includePaths.includes(entry.name)) continue
      }

      const fullPath = join(dirPath, entry.name)

      if (entry.isDirectory()) {
        const subFiles = await this.walkDir(fullPath, includePaths, depth + 1)
        results.push(...subFiles)
      } else if (entry.isFile()) {
        results.push(fullPath)
      }
    }

    return results
  }

  /** 更新状态并通知渲染进程 */
  private updateStatus(
    phase: SyncStatus['phase'],
    message: string,
    totalFiles: number,
    processedFiles: number,
    onStatusChange: (status: SyncStatus) => void,
    lastResult?: SyncResult,
  ): void {
    this.status = {
      phase,
      message,
      totalFiles,
      processedFiles,
      lastResult: lastResult ?? this.status.lastResult,
      error: phase === 'error' ? message : null,
    }
    onStatusChange(this.status)
  }
}
