import { useEffect, type RefObject } from 'react'

/** 将 React 内容区域尺寸同步给主进程 WebContentsView。 */
export function useWorkbenchBounds(contentRef: RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    const el = contentRef.current
    if (!el) return

    const reportBounds = (): void => {
      const rect = el.getBoundingClientRect()
      window.cclinkStudio.reportWorkbenchBounds({
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      })
    }

    const observer = new ResizeObserver(reportBounds)
    observer.observe(el)
    requestAnimationFrame(reportBounds)

    return () => observer.disconnect()
  }, [contentRef])
}
