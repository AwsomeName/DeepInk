import { beforeEach, describe, expect, it, vi } from 'vitest'

const electronMocks = vi.hoisted(() => {
  const window = {
    loadURL: vi.fn(),
    loadFile: vi.fn(),
    on: vi.fn(),
    isDestroyed: vi.fn(() => false),
    show: vi.fn(),
  }
  return {
    window,
    BrowserWindow: vi.fn(() => window),
  }
})

vi.mock('electron', () => ({
  BrowserWindow: electronMocks.BrowserWindow,
}))

import { createMainWindow } from './main-window'

describe('createMainWindow security boundary', () => {
  beforeEach(() => {
    electronMocks.BrowserWindow.mockClear()
    electronMocks.window.loadURL.mockClear()
    electronMocks.window.loadFile.mockClear()
    electronMocks.window.on.mockClear()
  })

  it('creates the privileged renderer with isolation and Chromium sandboxing', () => {
    createMainWindow({
      isDev: false,
      preloadPath: '/tmp/preload.js',
      rendererHtmlPath: '/tmp/index.html',
    })

    expect(electronMocks.BrowserWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        webPreferences: {
          preload: '/tmp/preload.js',
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
        },
      }),
    )
    expect(electronMocks.window.loadFile).toHaveBeenCalledWith('/tmp/index.html')
  })
})
