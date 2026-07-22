import { beforeEach, describe, expect, it } from 'vitest'
import { useContextMenuStore } from './context-menu-store'

describe('tab context menu browser preview', () => {
  beforeEach(() => {
    useContextMenuStore.setState({
      open: false,
      x: 0,
      y: 0,
      target: null,
      focusReturn: null,
      editingContributionId: null,
      inputValue: '',
      browserPreviewDataUrl: null,
      workspaceKeyAtOpen: null,
    })
  })

  it('keeps the preview until the browser view has time to reattach', () => {
    const preview = 'data:image/png;base64,preview'
    useContextMenuStore.getState().show({
      target: { kind: 'tab', workspaceKey: '/workspace', tabId: 'browser-1', tabType: 'browser' },
      x: 20,
      y: 30,
      browserPreviewDataUrl: preview,
    })

    expect(useContextMenuStore.getState()).toMatchObject({
      open: true,
      target: { kind: 'tab', tabId: 'browser-1' },
      browserPreviewDataUrl: preview,
    })

    useContextMenuStore.getState().hide()
    expect(useContextMenuStore.getState()).toMatchObject({
      open: false,
      target: null,
      browserPreviewDataUrl: preview,
    })

    useContextMenuStore.getState().clearBrowserPreview()
    expect(useContextMenuStore.getState().browserPreviewDataUrl).toBeNull()
  })

  it('clears a stale preview when a non-browser menu opens', () => {
    useContextMenuStore.setState({ browserPreviewDataUrl: 'data:image/png;base64,old' })
    useContextMenuStore.getState().show({
      target: { kind: 'tab', workspaceKey: '/workspace', tabId: 'editor-1', tabType: 'editor' },
      x: 10,
      y: 12,
    })

    expect(useContextMenuStore.getState().browserPreviewDataUrl).toBeNull()
  })
})
