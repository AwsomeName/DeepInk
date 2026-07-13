import { describe, it, expect } from 'vitest'
import { PLAYWRIGHT_ACTION_TYPES } from './playwright-actions'

describe('PLAYWRIGHT_ACTION_TYPES', () => {
  it('应该有 46 种操作类型', () => {
    expect(PLAYWRIGHT_ACTION_TYPES).toHaveLength(46)
  })

  it('包含所有关键操作', () => {
    const expected = [
      // 基础操作
      'navigate', 'click', 'fill', 'screenshot', 'extract',
      'select', 'check', 'uncheck', 'press', 'waitForSelector',
      'evaluate', 'goBack', 'goForward', 'reload', 'title', 'inputValue',
      // 高级交互
      'hover', 'scroll', 'uploadFile', 'waitForNavigation', 'pressKey', 'dragDrop',
      // 对话框处理
      'handleDialog', 'setAutoDialog',
      // Cookie 管理
      'getCookies', 'setCookie', 'clearCookies',
      // 网络拦截
      'interceptRequest', 'mockResponse', 'getNetworkLogs', 'clearIntercepts',
      // 多 Tab 管理
      'newTab', 'closeTab', 'listTabs', 'switchTab', 'getTabInfo',
      // 文件下载
      'waitForDownload', 'downloadInfo', 'saveDownload',
      // iframe / Frame
      'listFrames', 'frameExecute', 'frameContent',
      // 控制台日志
      'getConsoleLogs',
      // 弹窗处理
      'waitForPopup',
      // 坐标鼠标操作
      'mouseClick', 'mouseMove',
    ]
    for (const action of expected) {
      expect(PLAYWRIGHT_ACTION_TYPES).toContain(action)
    }
  })

  it('所有条目都是字符串', () => {
    for (const action of PLAYWRIGHT_ACTION_TYPES) {
      expect(typeof action).toBe('string')
    }
  })

  it('没有重复', () => {
    expect(new Set(PLAYWRIGHT_ACTION_TYPES).size).toBe(PLAYWRIGHT_ACTION_TYPES.length)
  })
})
