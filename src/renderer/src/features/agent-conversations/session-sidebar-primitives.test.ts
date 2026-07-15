import { describe, expect, it, vi } from 'vitest'
import { formatRelativeSessionTime } from './session-sidebar-primitives'

describe('session sidebar primitives', () => {
  it('formats relative session time consistently', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-14T12:00:00+08:00'))

    expect(formatRelativeSessionTime(new Date('2026-07-14T11:59:45+08:00').getTime())).toBe('刚刚')
    expect(formatRelativeSessionTime(new Date('2026-07-14T11:30:00+08:00').getTime())).toBe(
      '30 分钟前',
    )
    expect(formatRelativeSessionTime(new Date('2026-07-14T09:00:00+08:00').getTime())).toBe(
      '3 小时前',
    )
    expect(formatRelativeSessionTime(new Date('2026-07-12T12:00:00+08:00').getTime())).toBe(
      '2 天前',
    )

    vi.useRealTimers()
  })
})
