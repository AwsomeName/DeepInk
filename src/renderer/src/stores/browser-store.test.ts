import { describe, it, expect, beforeEach } from 'vitest'
import { useBrowserStore, type BrowserTabState } from './browser-store'

function browserTab(url = 'https://www.baidu.com'): BrowserTabState {
  return {
    url,
    urlInput: url,
    viewMode: 'desktop',
    zoomMode: 'fit',
    zoomFactor: 1,
    history: [url],
    historyIndex: 0,
    ready: false,
  }
}

beforeEach(() => {
  useBrowserStore.setState({
    // 重置为单种子浏览器 Tab
    tabs: { browser: browserTab() },
  })
})

describe('useBrowserStore', () => {
  describe('ensureTab', () => {
    it('已存在则返回现有状态，不覆盖', () => {
      const existing = useBrowserStore.getState().ensureTab('browser')
      expect(existing.url).toBe('https://www.baidu.com')
    })

    it('不存在则用默认值创建（指定 initialUrl）', () => {
      const tab = useBrowserStore.getState().ensureTab('tab-2', 'https://github.com')
      expect(tab.url).toBe('https://github.com')
      expect(tab.viewMode).toBe('desktop')
      expect(tab.ready).toBe(false)
      expect(useBrowserStore.getState().tabs['tab-2'].url).toBe('https://github.com')
    })
  })

  describe('setUrl', () => {
    it('同时更新 url 和 urlInput', () => {
      useBrowserStore.getState().setUrl('browser', 'https://google.com')
      const tab = useBrowserStore.getState().tabs['browser']
      expect(tab.url).toBe('https://google.com')
      expect(tab.urlInput).toBe('https://google.com')
    })

    it('同步导航栈', () => {
      useBrowserStore.getState().setUrl('browser', 'https://github.com', {
        history: ['https://a.com', 'https://github.com'],
        historyIndex: 1,
      })
      const tab = useBrowserStore.getState().tabs['browser']
      expect(tab.history).toEqual(['https://a.com', 'https://github.com'])
      expect(tab.historyIndex).toBe(1)
    })
  })

  describe('setUrlInput', () => {
    it('只更新 urlInput，不影响 url', () => {
      useBrowserStore.getState().setUrlInput('browser', 'https://google.com/search')
      const tab = useBrowserStore.getState().tabs['browser']
      expect(tab.urlInput).toBe('https://google.com/search')
      expect(tab.url).toBe('https://www.baidu.com')
    })
  })

  describe('setViewState', () => {
    it('同步指定 Tab 的视图状态', () => {
      useBrowserStore.getState().setViewState('browser', {
        viewMode: 'mobile',
        zoomMode: 'manual',
        zoomFactor: 0.75,
      })
      const tab = useBrowserStore.getState().tabs['browser']
      expect(tab.viewMode).toBe('mobile')
      expect(tab.zoomMode).toBe('manual')
      expect(tab.zoomFactor).toBe(0.75)
    })
  })

  describe('removeTab', () => {
    it('移除指定 Tab 状态', () => {
      useBrowserStore.getState().ensureTab('tab-2', 'https://github.com')
      useBrowserStore.getState().removeTab('tab-2')
      expect(useBrowserStore.getState().tabs['tab-2']).toBeUndefined()
    })
  })

  describe('setReady', () => {
    it('标记视图已创建', () => {
      useBrowserStore.getState().setReady('browser')
      expect(useBrowserStore.getState().tabs['browser'].ready).toBe(true)
    })
  })

  describe('hydrateFromWorkspaceState', () => {
    it('从工作台快照恢复多个浏览器实例和导航栈', () => {
      useBrowserStore.getState().hydrateFromWorkspaceState({
        tabs: {
          browser: browserTab('https://example.com'),
          'browser-2': {
            ...browserTab('https://cclink.studio'),
            viewMode: 'mobile',
            zoomMode: 'manual',
            zoomFactor: 0.8,
            history: ['https://a.test', 'https://cclink.studio'],
            historyIndex: 1,
            ready: true,
          },
        },
      })

      const state = useBrowserStore.getState()
      expect(Object.keys(state.tabs)).toEqual(['browser', 'browser-2'])
      expect(state.tabs['browser-2'].viewMode).toBe('mobile')
      expect(state.tabs['browser-2'].zoomMode).toBe('manual')
      expect(state.tabs['browser-2'].zoomFactor).toBe(0.8)
      expect(state.tabs['browser-2'].history).toEqual(['https://a.test', 'https://cclink.studio'])
      expect(state.tabs['browser-2'].historyIndex).toBe(1)
      expect(state.tabs['browser-2'].ready).toBe(false)
    })

    it('恢复时钳制越界 historyIndex', () => {
      useBrowserStore.getState().hydrateFromWorkspaceState({
        tabs: {
          browser: {
            ...browserTab('https://example.com'),
            history: ['https://a.test', 'https://b.test'],
            historyIndex: 99,
          },
        },
      })

      expect(useBrowserStore.getState().tabs.browser.historyIndex).toBe(1)
    })
  })
})
