import { describe, expect, it } from 'vitest'
import {
  shouldDestroyBrowserViewDuringReconcile,
  shouldRecreateBrowserViewForBinding,
} from './browser-view-reconciliation'

describe('shouldDestroyBrowserViewDuringReconcile', () => {
  it('preserves browser views owned by a background workspace', () => {
    expect(
      shouldDestroyBrowserViewDuringReconcile({
        tabId: 'browser-a',
        viewWorkspaceKey: '/workspace/a',
        viewProfileId: 'v2ex',
        activeWorkspaceKey: '/workspace/b',
        expectedProfileByTabId: new Map([['browser-b', 'v2ex']]),
      }),
    ).toBe(false)
  })

  it('destroys a removed browser tab in the active workspace', () => {
    expect(
      shouldDestroyBrowserViewDuringReconcile({
        tabId: 'browser-a',
        viewWorkspaceKey: '/workspace/a',
        viewProfileId: null,
        activeWorkspaceKey: '/workspace/a',
        expectedProfileByTabId: new Map(),
      }),
    ).toBe(true)
  })

  it('destroys a view whose declared profile no longer matches the active workspace tab', () => {
    expect(
      shouldDestroyBrowserViewDuringReconcile({
        tabId: 'browser-a',
        viewWorkspaceKey: '/workspace/a',
        viewProfileId: 'default-profile',
        activeWorkspaceKey: '/workspace/a',
        expectedProfileByTabId: new Map([['browser-a', 'v2ex']]),
      }),
    ).toBe(true)
  })

  it('recreates a view when either workspace or profile binding changes', () => {
    expect(
      shouldRecreateBrowserViewForBinding({
        currentWorkspaceKey: '/workspace/a',
        currentProfileId: 'zhihu',
        requestedWorkspaceKey: '/workspace/a',
        requestedProfileId: 'v2ex',
      }),
    ).toBe(true)
    expect(
      shouldRecreateBrowserViewForBinding({
        currentWorkspaceKey: '/workspace/a',
        currentProfileId: 'v2ex',
        requestedWorkspaceKey: '/workspace/b',
        requestedProfileId: 'v2ex',
      }),
    ).toBe(true)
    expect(
      shouldRecreateBrowserViewForBinding({
        currentWorkspaceKey: '/workspace/a',
        currentProfileId: 'v2ex',
        requestedWorkspaceKey: '/workspace/a',
        requestedProfileId: 'v2ex',
      }),
    ).toBe(false)
  })
})
