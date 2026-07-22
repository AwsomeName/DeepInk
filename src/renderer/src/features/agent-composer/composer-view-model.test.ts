import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../../../../shared/ipc/settings'
import * as composerViewModel from './composer-view-model'
import {
  getClaudeCodeSourceLabel,
  getClaudeCodeStatusDetail,
  getClaudeCodeStatusLabel,
  getPermissionModeOption,
  getRuntimeDetail,
  getRuntimeLabel,
} from './composer-view-model'

describe('composer-view-model', () => {
  it('uses explicit permission mode labels', () => {
    expect(getPermissionModeOption('auto').label).toBe('自动')
    expect(getPermissionModeOption('categorized').label).toBe('分类')
    expect(getPermissionModeOption('strict').label).toBe('严格')
  })

  it('does not expose target scope labels from the composer model', () => {
    expect('getScopeLabel' in composerViewModel).toBe(false)
  })

  it('shows the real local runtime instead of a fake model selector', () => {
    expect(getRuntimeLabel(DEFAULT_SETTINGS)).toBe('Claude Code')
    expect(getRuntimeDetail(DEFAULT_SETTINGS)).toBe('系统安装')
    expect(
      getRuntimeDetail({
        ...DEFAULT_SETTINGS,
        claudeRuntimeSource: 'custom',
        claudeCodePath: '/opt/homebrew/bin/claude',
      }),
    ).toBe('自定义路径')
    expect(getRuntimeDetail({ ...DEFAULT_SETTINGS, claudeRuntimeSource: 'bundled' })).toBe(
      '内置固定版本',
    )
  })

  it('formats Claude Code detection status for the runtime menu', () => {
    expect(getClaudeCodeStatusLabel(null)).toBe('未检测')
    expect(getClaudeCodeStatusDetail(null)).toBe('打开菜单时检测本机 Claude Code')
    expect(
      getClaudeCodeStatusLabel({
        installed: true,
        path: '/opt/homebrew/bin/claude',
        source: 'known-path',
      }),
    ).toBe('已就绪')
    expect(
      getClaudeCodeStatusDetail({
        installed: false,
        path: null,
        source: 'not-found',
        error: '未找到 Claude Code CLI',
      }),
    ).toBe('未找到 Claude Code CLI')
    expect(getClaudeCodeSourceLabel('configured')).toBe('手动路径')
    expect(getClaudeCodeSourceLabel('bundled')).toBe('内置固定版本')
    expect(getClaudeCodeSourceLabel('shell-path')).toBe('Shell PATH')
  })
})
