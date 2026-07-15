import { useCallback, useEffect, useRef, useState } from 'react'
import type { BrowserHistoryEntry, BrowserInstanceSnapshot } from '@shared/ipc/browser'
import { IconFile, IconGlobe, IconHistory } from '../common/Icons'

interface BrowserHistoryMenuProps {
  onOpenUrl: (url: string) => void
  onRestoreSnapshot: (snapshot: BrowserInstanceSnapshot) => void | Promise<void>
}

export function BrowserHistoryMenu({ onOpenUrl, onRestoreSnapshot }: BrowserHistoryMenuProps): React.ReactElement {
  const [open, setOpen] = useState(false)
  const [history, setHistory] = useState<BrowserHistoryEntry[]>([])
  const [snapshots, setSnapshots] = useState<BrowserInstanceSnapshot[]>([])
  const wrapRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async (): Promise<void> => {
    const [historyList, snapshotList] = await Promise.all([
      window.cclinkStudio.browser.listHistory(20),
      window.cclinkStudio.browser.listSnapshots(),
    ])
    setHistory(historyList)
    setSnapshots(snapshotList)
  }, [])

  const toggle = useCallback((): void => {
    setOpen((next) => {
      if (!next) void load()
      return !next
    })
  }, [load])

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent): void => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const clearHistory = async (): Promise<void> => {
    await window.cclinkStudio.browser.clearHistory()
    setHistory([])
  }

  return (
    <div className="browser-history-menu" ref={wrapRef}>
      <button onClick={toggle} title="浏览历史">
        <IconHistory size={16} />
      </button>
      {open && (
        <div className="browser-history-popover">
          <div className="browser-history-section">
            <div className="browser-history-header">
              <span>浏览历史</span>
              {history.length > 0 && (
                <button onClick={() => void clearHistory()}>清空</button>
              )}
            </div>
            {history.length === 0 ? (
              <div className="browser-history-empty">暂无记录</div>
            ) : (
              history.map((item) => (
                <button
                  key={item.id}
                  className="browser-history-item"
                  onClick={() => {
                    onOpenUrl(item.url)
                    setOpen(false)
                  }}
                  title={item.url}
                >
                  <IconGlobe size={12} />
                  <span>{item.title || formatHistoryUrl(item.url)}</span>
                </button>
              ))
            )}
          </div>

          <div className="browser-history-section">
            <div className="browser-history-header">
              <span>最近关闭</span>
            </div>
            {snapshots.length === 0 ? (
              <div className="browser-history-empty">暂无页面</div>
            ) : (
              snapshots.slice(0, 10).map((snap) => (
                <button
                  key={snap.id}
                  className="browser-history-item"
                  onClick={() => {
                    void onRestoreSnapshot(snap)
                    setSnapshots((items) => items.filter((item) => item.id !== snap.id))
                    setOpen(false)
                  }}
                  title={snap.url}
                >
                  <IconFile size={12} />
                  <span>{snap.title || formatHistoryUrl(snap.url)}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function formatHistoryUrl(url: string): string {
  try {
    const parsed = new URL(url)
    return parsed.host + (parsed.pathname === '/' ? '' : parsed.pathname)
  } catch {
    return url
  }
}
