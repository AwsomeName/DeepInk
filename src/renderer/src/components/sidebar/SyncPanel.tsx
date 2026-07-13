/**
 * SyncPanel — 侧栏同步面板
 *
 * 类似 VSCode 源代码管理面板：状态展示 + 一键同步。
 * 配置（连接/断开）仍在设置页。
 * Pro 功能门控：非 Pro 用户显示升级提示。
 */

import { useEffect } from 'react'
import { useSyncStore, useFsStore, useTabStore, useSubscriptionStore } from '../../stores'
import { IconCloud, IconSync, IconCloudCheck, IconSettings } from '../common/Icons'
import { SYNC_PHASE_LABEL } from '../../constants/sync-labels'
import type { SyncPhase } from '@shared/ipc/sync'

export function SyncPanel(): React.ReactElement {
  const config = useSyncStore((s) => s.config)
  const status = useSyncStore((s) => s.status)

  if (!config) {
    return <SyncPanelUnconnected />
  }

  // Pro 门控：非 Pro 用户显示升级提示（开发版放行）
  const tier = useSubscriptionStore((s) => s.tier)
  if (tier !== 'pro' && !import.meta.env.DEV) {
    return <SyncPanelProGate />
  }

  return <SyncPanelConnected config={config} status={status} />
}

/** 已连接状态 — Pro 用户正常使用 */
function SyncPanelConnected(props: {
  config: NonNullable<ReturnType<typeof useSyncStore.getState>['config']>
  status: ReturnType<typeof useSyncStore.getState>['status']
}): React.ReactElement {
  const { config, status } = props
  const triggerSync = useSyncStore((s) => s.triggerSync)
  const workspacePath = useFsStore((s) => s.workspacePath)

  const isSyncing = (['connecting', 'scanning-local', 'scanning-remote', 'comparing', 'syncing'] as SyncPhase[]).includes(status.phase)

  return (
    <div className="sync-panel">
      {/* 服务商信息 */}
      <div className="sync-panel-header">
        <IconCloud size={14} />
        <span className="sync-panel-provider">
          {config.provider === 'jianguoyun' ? '坚果云' : 'WebDAV'}
        </span>
      </div>
      <div className="sync-panel-info">
        {config.username}
      </div>

      {/* 同步状态 */}
      <div className={`sync-panel-status ${status.phase === 'error' ? 'error' : ''}`}>
        {isSyncing ? (
          <>
            <IconSync size={12} className="animate-spin" />
            {status.message || SYNC_PHASE_LABEL[status.phase]}
            {status.totalFiles > 0 && ` (${status.processedFiles}/${status.totalFiles})`}
          </>
        ) : status.phase === 'error' ? (
          <>⚠️ {status.error}</>
        ) : (
          <>
            <IconCloudCheck size={12} />
            {SYNC_PHASE_LABEL[status.phase]}
          </>
        )}
      </div>

      {/* 同步按钮 */}
      <button
        className="sync-panel-trigger"
        disabled={isSyncing || !workspacePath}
        onClick={() => workspacePath && triggerSync(workspacePath)}
        title={!workspacePath ? '请先打开工作空间' : '立即同步'}
      >
        <IconSync size={14} />
        {isSyncing ? SYNC_PHASE_LABEL[status.phase] : '立即同步'}
      </button>

      {/* 上次同步结果 */}
      {status.lastResult && status.phase === 'done' && (
        <div className="sync-panel-result">
          <div className="sync-panel-result-title">最近同步</div>
          <div className="sync-panel-result-detail">
            {status.lastResult.uploaded.length > 0 && <span>↑ {status.lastResult.uploaded.length}</span>}
            {status.lastResult.downloaded.length > 0 && <span>↓ {status.lastResult.downloaded.length}</span>}
            {status.lastResult.skipped.length > 0 && <span>· {status.lastResult.skipped.length}</span>}
            {status.lastResult.conflicts.length > 0 && <span className="sync-panel-conflict">⚡ {status.lastResult.conflicts.length}</span>}
          </div>
        </div>
      )}

      {/* 同步历史 */}
      <SyncHistoryList />
    </div>
  )
}

/** 未连接状态 — 显示引导 */
function SyncPanelUnconnected(): React.ReactElement {
  const openTab = useTabStore((s) => s.openTab)

  const openSyncSettings = () => {
    openTab({ type: 'settings', title: '设置', icon: '⚙️' })
  }

  return (
    <div className="sync-panel">
      <div className="sync-panel-header">
        <IconCloud size={14} />
        <span>云同步</span>
      </div>
      <div className="sync-panel-empty">
        <p>未连接云存储</p>
        <p className="sync-panel-hint">同步工作空间文件到坚果云、WebDAV 等</p>
        <button className="sync-panel-goto-settings" onClick={openSyncSettings}>
          <IconSettings size={14} />
          前往设置
        </button>
      </div>
    </div>
  )
}

/** Pro 功能门控 — 非 Pro 用户显示升级提示 */
function SyncPanelProGate(): React.ReactElement {
  const openTab = useTabStore((s) => s.openTab)

  const openPricing = () => {
    openTab({ type: 'settings', title: '订阅', icon: '💎' })
  }

  return (
    <div className="sync-panel">
      <div className="sync-panel-header">
        <IconCloud size={14} />
        <span>云同步</span>
        <span className="sync-panel-pro-badge">PRO</span>
      </div>
      <div className="sync-panel-empty">
        <p>☁️ 云同步为 Pro 功能</p>
        <p className="sync-panel-hint">升级 Pro 解锁 WebDAV 云同步</p>
        <button className="sync-panel-goto-settings" onClick={openPricing}>
          💎 升级 Pro
        </button>
      </div>
    </div>
  )
}

/** 同步历史列表（最近 10 条） */
function SyncHistoryList(): React.ReactElement | null {
  const history = useSyncStore((s) => s.history)
  const loadHistory = useSyncStore((s) => s.loadHistory)

  useEffect(() => {
    loadHistory()
  }, [])

  if (history.length === 0) return null

  const directionIcon: Record<string, string> = {
    upload: '↑',
    download: '↓',
    bidirectional: '↕',
  }

  const triggerLabel: Record<string, string> = {
    manual: '手动',
    scheduled: '定时',
    'auto-upload': '自动',
    startup: '启动',
  }

  return (
    <div className="sync-history">
      <div className="sync-history-title">同步历史</div>
      {history.slice(0, 10).map((entry) => (
        <div key={entry.id} className={`sync-history-item ${entry.success ? '' : 'has-error'}`}>
          <div className="sync-history-meta">
            <span className="sync-history-direction">{directionIcon[entry.direction] ?? '↕'}</span>
            <span className="sync-history-trigger">{triggerLabel[entry.trigger] ?? entry.trigger}</span>
            <span className="sync-history-time">{formatTime(entry.timestamp)}</span>
          </div>
          <div className="sync-history-summary">
            {entry.summary.uploaded > 0 && <span>↑{entry.summary.uploaded}</span>}
            {entry.summary.downloaded > 0 && <span>↓{entry.summary.downloaded}</span>}
            {entry.summary.conflicts > 0 && <span className="sync-panel-conflict">⚡{entry.summary.conflicts}</span>}
            {entry.summary.errors > 0 && <span className="sync-history-error">✗{entry.summary.errors}</span>}
            {entry.summary.uploaded === 0 && entry.summary.downloaded === 0 && entry.summary.conflicts === 0 && entry.summary.errors === 0 && (
              <span className="sync-history-noop">无变更</span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

/** 格式化 ISO 时间为简短本地时间 */
function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    const now = new Date()
    const isToday = d.toDateString() === now.toDateString()
    const time = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    if (isToday) return time
    return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')} ${time}`
  } catch {
    return iso
  }
}
