/**
 * 云同步类型定义
 *
 * 所有同步相关接口，无 Electron 依赖。
 * 主进程和类型声明文件共享这些类型。
 */

// ─── Provider ──────────────────────────────────────

/** WebDAV 服务提供者类型 */
export type WebdavProvider = 'jianguoyun' | 'generic'

/** 同步连接配置 */
export interface SyncConfig {
  /** 配置唯一 ID（crypto.randomUUID()） */
  id: string
  /** 用户可见标签，如 "我的坚果云" */
  label: string
  /** 提供者（影响分页、OPTIONS、限流行为） */
  provider: WebdavProvider
  /** 服务器基础 URL，如 "https://dav.jianguoyun.com/dav/" */
  serverUrl: string
  /** 用户名 */
  username: string
  /** 远程目录路径，如 "/DeepInk/" */
  remotePath: string
  /** 是否启用 */
  enabled: boolean
  /** 选择性同步：要同步的一级子目录名列表（空数组 = 同步整个工作区） */
  includePaths: string[]
  /** 自动同步间隔（分钟），0 = 禁用 */
  autoSyncInterval: number
  /** 文件保存后自动上传 */
  autoUploadOnSave: boolean
  /** 启动时自动拉取 */
  syncOnStartup: boolean
}

// ─── Sync State ────────────────────────────────────

/** 同步阶段 */
export type SyncPhase =
  | 'idle'
  | 'connecting'
  | 'scanning-local'
  | 'scanning-remote'
  | 'comparing'
  | 'syncing'
  | 'done'
  | 'error'

/** 同步状态（推送到渲染进程） */
export interface SyncStatus {
  /** 当前阶段 */
  phase: SyncPhase
  /** 阶段描述信息 */
  message: string
  /** 总文件数 */
  totalFiles: number
  /** 已处理文件数 */
  processedFiles: number
  /** 上次同步结果（phase === 'done' 时） */
  lastResult: SyncResult | null
  /** 错误信息（phase === 'error' 时） */
  error: string | null
}

/** 同步操作结果 */
export interface SyncResult {
  /** 上传的文件（本地 → 远程） */
  uploaded: string[]
  /** 下载的文件（远程 → 本地） */
  downloaded: string[]
  /** 冲突文件（两份都保留） */
  conflicts: string[]
  /** 删除的文件 */
  deleted: string[]
  /** 跳过的文件（已同步） */
  skipped: string[]
  /** 错误列表 */
  errors: Array<{ path: string; error: string }>
}

/** 文件同步快照（三路对比的"基准"） */
export interface SyncSnapshot {
  /** 相对路径（相对工作区根目录） */
  relativePath: string
  /** 文件内容 SHA-256 哈希 */
  contentHash: string
  /** 本地最后修改时间（ms） */
  localMtime: number
  /** 远程最后修改时间（ms） */
  remoteMtime: number
  /** 远程文件大小（字节） */
  remoteSize: number
  /** 远程 ETag */
  remoteEtag: string | null
  /** 同步完成时间（ISO string） */
  syncedAt: string
}

/** 持久化的同步状态 */
export interface SyncState {
  /** 当前配置 ID */
  configId: string
  /** 本地工作区路径 */
  workspacePath: string
  /** 远程路径 */
  remotePath: string
  /** 相对路径 → 快照 */
  snapshots: Record<string, SyncSnapshot>
  /** 上次完整同步时间（ISO string） */
  lastSyncAt: string | null
}

/** 持久化的配置（不含密码） */
export interface SyncConfigStore {
  /** 当前活跃配置（Phase 1 仅支持单个） */
  config: SyncConfig | null
  /** 同步状态 */
  state: SyncState | null
}

// ─── Run Options ───────────────────────────────────

/** runSync 可选参数 */
export interface RunSyncOptions {
  /** 同步方向（默认双向） */
  direction?: 'upload' | 'download' | 'bidirectional'
  /** 触发方式（用于历史记录） */
  trigger?: 'manual' | 'scheduled' | 'auto-upload' | 'startup'
}

// ─── Sync History ──────────────────────────────────

/** 同步历史记录条目 */
export interface SyncHistoryEntry {
  /** 记录 ID */
  id: string
  /** 同步时间（ISO string） */
  timestamp: string
  /** 同步方向 */
  direction: 'upload' | 'download' | 'bidirectional'
  /** 触发方式 */
  trigger: 'manual' | 'scheduled' | 'auto-upload' | 'startup'
  /** 结果摘要 */
  summary: {
    uploaded: number
    downloaded: number
    conflicts: number
    deleted: number
    errors: number
  }
  /** 是否成功（无错误） */
  success: boolean
  /** 错误信息（如果有） */
  errorMessage?: string
}

// ─── Internal Types ────────────────────────────────

/** 文件同步状态标记 */
export type FileSyncAction =
  | 'upload'          // 本地 → 远程
  | 'download'        // 远程 → 本地
  | 'conflict'        // 冲突，保留两份
  | 'delete-local'    // 删除本地（远程已删除）
  | 'delete-remote'   // 删除远程（本地已删除）— Phase 1 跳过
  | 'skip'            // 已同步，跳过

/** 待执行的操作 */
export interface SyncAction {
  /** 相对路径 */
  relativePath: string
  /** 操作类型 */
  action: FileSyncAction
}

/** 本地文件信息 */
export interface LocalFileInfo {
  /** 相对路径 */
  relativePath: string
  /** 绝对路径 */
  absolutePath: string
  /** 文件大小 */
  size: number
  /** 最后修改时间（ms） */
  mtime: number
  /** 内容 SHA-256 哈希 */
  contentHash: string
}

/** 远程文件信息 */
export interface RemoteFileInfo {
  /** 完整远程路径 */
  path: string
  /** 相对路径（相对 remotePath） */
  relativePath: string
  /** 文件名 */
  basename: string
  /** 文件大小 */
  size: number
  /** 最后修改时间（ms） */
  lastModified: number
  /** ETag */
  etag: string | null
  /** 是否为目录 */
  isDirectory: boolean
}
