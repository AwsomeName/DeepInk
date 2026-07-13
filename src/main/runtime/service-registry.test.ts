import { describe, expect, it, vi } from 'vitest'
import { ServiceRegistry } from './service-registry'

describe('ServiceRegistry', () => {
  it('starts services in registration order', async () => {
    const calls: string[] = []
    const registry = new ServiceRegistry()
    registry.register({ name: 'a', start: () => { calls.push('start:a') } })
    registry.register({ name: 'b', start: async () => { calls.push('start:b') } })

    await registry.startAll()

    expect(calls).toEqual(['start:a', 'start:b'])
  })

  it('stops services in reverse registration order', async () => {
    const calls: string[] = []
    const registry = new ServiceRegistry()
    registry.register({ name: 'a', stop: () => { calls.push('stop:a') } })
    registry.register({ name: 'b', stop: async () => { calls.push('stop:b') } })

    await registry.stopAll()

    expect(calls).toEqual(['stop:b', 'stop:a'])
  })

  it('continues stopping remaining services when one stop fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const calls: string[] = []
    const registry = new ServiceRegistry()
    registry.register({ name: 'a', stop: () => { calls.push('stop:a') } })
    registry.register({ name: 'b', stop: () => { throw new Error('boom') } })
    registry.register({ name: 'c', stop: () => { calls.push('stop:c') } })

    await registry.stopAll()

    expect(calls).toEqual(['stop:c', 'stop:a'])
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
