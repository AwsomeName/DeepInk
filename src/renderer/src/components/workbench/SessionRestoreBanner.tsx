/**
 * 会话恢复横幅
 *
 * 应用启动时拉取浏览器实例快照（上次关闭未恢复的页面）。若存在，在工作区顶部显示
 * 「恢复上次会话(N)」横幅；点击为每个快照打开浏览器 Tab（带 url + 视图模式/缩放）。
 * 登录态由默认 session 持久化，重建后访问同站仍保持登录。
 */
import { useEffect, useState } from 'react'
import { useTabStore } from '../../stores'
import { IconHistory, IconClose } from '../common/Icons'

type BrowserInstanceSnapshot = Awaited<ReturnType<typeof window.cclinkStudio.browser.listSnapshots>>[number]

export function SessionRestoreBanner(): React.ReactElement | null {
  const [snapshots, setSnapshots] = useState<BrowserInstanceSnapshot[]>([])
  const [dismissed, setDismissed] = useState(false)
  const openTab = useTabStore((s) => s.openTab)

  // 启动时拉取一次快照
  useEffect(() => {
    void window.cclinkStudio.browser.listSnapshots().then((list) => {
      if (list.length > 0) setSnapshots(list)
    })
  }, [])

  if (dismissed || snapshots.length === 0) return null

  const restoreAll = async (): Promise<void> => {
    for (const snap of snapshots) {
      openTab({
        type: 'browser',
        title: snap.title ?? '恢复的页面',
        icon: '🌐',
        initialUrl: snap.url,
        restore: {
          viewMode: snap.viewMode ?? 'desktop',
          zoomMode: snap.zoomMode ?? 'fit',
          manualZoom: snap.manualZoom ?? 1,
          history: snap.history,
          historyIndex: snap.historyIndex,
        },
        forceNew: true,
      })
      // 重建后从快照列表移除（已恢复，不再重复提示）
      await window.cclinkStudio.browser.removeSnapshot(snap.id)
    }
    setSnapshots([])
  }

  const dismissAll = async (): Promise<void> => {
    await window.cclinkStudio.browser.clearSnapshots()
    setDismissed(true)
  }

  return (
    <div className="session-restore-banner">
      <IconHistory size={14} />
      <span>检测到 {snapshots.length} 个上次未恢复的页面</span>
      <button className="session-restore-btn" onClick={() => void restoreAll()}>
        恢复上次会话
      </button>
      <button className="session-restore-close" onClick={() => void dismissAll()} title="忽略并清除">
        <IconClose size={12} />
      </button>
    </div>
  )
}
