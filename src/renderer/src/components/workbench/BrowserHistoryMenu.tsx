import { useCallback, useEffect, useRef, useState } from 'react'
import type { BrowserHistoryEntry } from '@shared/ipc/browser'
import { IconGlobe, IconHistory } from '../common/Icons'

interface BrowserHistoryMenuProps {
  onOpenUrl: (url: string) => void
}

export function BrowserHistoryMenu({ onOpenUrl }: BrowserHistoryMenuProps): React.ReactElement {
  const [open, setOpen] = useState(false)
  const [history, setHistory] = useState<BrowserHistoryEntry[]>([])
  const wrapRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async (): Promise<void> => {
    const historyList = await window.cclinkStudio.browser.listHistory(20)
    setHistory(historyList)
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
              {history.length > 0 && <button onClick={() => void clearHistory()}>清空</button>}
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
