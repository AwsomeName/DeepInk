import { useEffect } from 'react'
import { useBrowserStore } from '../../stores/browser-store'

/** 将主进程浏览器事件分发到 per-tab browser store。 */
export function useBrowserEvents(): void {
  useEffect(() => {
    const offUrlChanged = window.deepink.browser.onUrlChanged((payload) => {
      useBrowserStore.getState().setUrl(payload.tabId, payload.url, payload)
    })
    const offViewStateChanged = window.deepink.browser.onViewStateChanged((state) => {
      if (state?.tabId) {
        useBrowserStore.getState().setViewState(state.tabId, state)
      }
    })
    return () => {
      offUrlChanged()
      offViewStateChanged()
    }
  }, [])
}
