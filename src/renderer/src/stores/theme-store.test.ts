import { describe, expect, it } from 'vitest'
import { useThemeStore } from './theme-store'

describe('useThemeStore', () => {
  it('可在非 DOM 测试环境导入并更新主题状态', () => {
    useThemeStore.getState().setTheme('light')
    expect(useThemeStore.getState().theme).toBe('light')
    expect(useThemeStore.getState().resolvedTheme).toBe('light')

    useThemeStore.getState().setTheme('dark')
    expect(useThemeStore.getState().theme).toBe('dark')
    expect(useThemeStore.getState().resolvedTheme).toBe('dark')
  })
})
