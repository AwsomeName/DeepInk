import { describe, expect, it, vi } from 'vitest'
import { RuntimeCapabilityRegistry } from './capability-registry'

describe('RuntimeCapabilityRegistry', () => {
  it('distinguishes unavailable, degraded, ready and failed states', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1234)
    const registry = new RuntimeCapabilityRegistry()

    expect(registry.get('browser')).toMatchObject({
      state: 'unavailable',
      reason: '能力尚未初始化',
      updatedAt: 0,
    })

    registry.degraded('browser', 'CDP 尚未连接')
    expect(registry.get('browser')).toMatchObject({
      state: 'degraded',
      reason: 'CDP 尚未连接',
      updatedAt: 1234,
    })

    registry.ready('browser')
    expect(registry.get('browser')).toMatchObject({ state: 'ready', updatedAt: 1234 })
    expect(registry.get('browser').reason).toBeUndefined()

    registry.failed('browser', new Error('connection refused'))
    expect(registry.get('browser')).toMatchObject({
      state: 'failed',
      reason: 'connection refused',
    })
  })

  it('bounds non-Error failure diagnostics', () => {
    const registry = new RuntimeCapabilityRegistry()
    registry.failed('meshy', 'x'.repeat(3_000))
    expect(registry.get('meshy').reason).toHaveLength(2_000)
  })

  it('redacts secrets before capability reasons cross into the renderer', () => {
    const registry = new RuntimeCapabilityRegistry()
    registry.failed(
      'browser',
      new Error(
        'token=secret-value https://example.com/login?access_token=query-secret Bearer auth-secret',
      ),
    )

    const reason = registry.get('browser').reason ?? ''
    expect(reason).toContain('token=[redacted]')
    expect(reason).toContain('access_token=[redacted]')
    expect(reason).toContain('Bearer [redacted]')
    expect(reason).not.toContain('secret-value')
    expect(reason).not.toContain('query-secret')
    expect(reason).not.toContain('auth-secret')
  })
})
