import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getWorkspaceStateKey,
  getWorkspaceStateOwnerKey,
  getWorkspaceStatePath,
  beginWorkspaceStateRestore,
  endWorkspaceStateRestore,
  isWorkspaceStateRestoring,
  persistWorkspaceSection,
  setWorkspaceStateOwnerKey,
  setWorkspaceStatePath,
  setWorkspaceStateRef,
} from './workspace-state'

afterEach(() => {
  vi.unstubAllGlobals()
  setWorkspaceStatePath(null)
  setWorkspaceStateOwnerKey(null)
  while (isWorkspaceStateRestoring()) endWorkspaceStateRestore()
})

describe('workspace-state utils', () => {
  it('默认使用当前工作区路径持久化 section', () => {
    const setSection = vi.fn().mockResolvedValue({ success: true })
    vi.stubGlobal('window', { cclinkStudio: { workspaceState: { setSection } } })

    setWorkspaceStatePath('/workspace/a')
    persistWorkspaceSection('layout', { sidebarVisible: false })

    expect(getWorkspaceStatePath()).toBe('/workspace/a')
    expect(getWorkspaceStateKey()).toBe('/workspace/a')
    expect(setSection).toHaveBeenCalledWith(
      '/workspace/a',
      'layout',
      { sidebarVisible: false },
      null,
    )
  })

  it('显式传入 workspacePath 时覆盖默认路径', () => {
    const setSection = vi.fn().mockResolvedValue({ success: true })
    vi.stubGlobal('window', { cclinkStudio: { workspaceState: { setSection } } })

    setWorkspaceStatePath('/workspace/a')
    persistWorkspaceSection('fileTree', { selectedPath: '/workspace/b/file.md' }, '/workspace/b')

    expect(setSection).toHaveBeenCalledWith(
      '/workspace/b',
      'fileTree',
      {
        selectedPath: '/workspace/b/file.md',
      },
      null,
    )
  })

  it('默认携带当前本机身份 ownerKey', () => {
    const setSection = vi.fn().mockResolvedValue({ success: true })
    vi.stubGlobal('window', { cclinkStudio: { workspaceState: { setSection } } })

    setWorkspaceStateOwnerKey('local:abc')
    persistWorkspaceSection('layout', { agentPanelMode: 'right' })

    expect(getWorkspaceStateOwnerKey()).toBe('local:abc')
    expect(setSection).toHaveBeenCalledWith(
      null,
      'layout',
      { agentPanelMode: 'right' },
      'local:abc',
    )
  })

  it('支持通过 WorkspaceRef 设置本地工作空间状态 key', () => {
    const setSection = vi.fn().mockResolvedValue({ success: true })
    vi.stubGlobal('window', { cclinkStudio: { workspaceState: { setSection } } })

    setWorkspaceStateRef({ kind: 'local', path: '/Users/app/project' })
    persistWorkspaceSection('tabs', { tabs: [] })

    expect(getWorkspaceStateKey()).toBe('/Users/app/project')
    expect(setSection).toHaveBeenCalledWith(
      '/Users/app/project',
      'tabs',
      {
        tabs: [],
      },
      null,
    )
  })

  it('恢复事务期间跳过 section 持久化', () => {
    const setSection = vi.fn().mockResolvedValue({ success: true })
    vi.stubGlobal('window', { cclinkStudio: { workspaceState: { setSection } } })

    beginWorkspaceStateRestore()
    persistWorkspaceSection('tabs', { tabs: [] })
    endWorkspaceStateRestore()

    expect(setSection).not.toHaveBeenCalled()
  })
})
