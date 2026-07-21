import { describe, expect, it, vi } from 'vitest'
import { ServiceRegistry } from './service-registry'

describe('ServiceRegistry', () => {
  it('starts services in registration order', async () => {
    const calls: string[] = []
    const registry = new ServiceRegistry()
    registry.register({
      name: 'a',
      start: () => {
        calls.push('start:a')
      },
    })
    registry.register({
      name: 'b',
      start: async () => {
        calls.push('start:b')
      },
    })

    await registry.startAll()

    expect(calls).toEqual(['start:a', 'start:b'])
  })

  it('stops started services in reverse registration order', async () => {
    const calls: string[] = []
    const registry = new ServiceRegistry()
    registry.register({
      name: 'a',
      start: () => undefined,
      stop: () => {
        calls.push('stop:a')
      },
    })
    registry.register({
      name: 'b',
      start: () => undefined,
      stop: async () => {
        calls.push('stop:b')
      },
    })

    await registry.startAll()
    await registry.stopAll()

    expect(calls).toEqual(['stop:b', 'stop:a'])
  })

  it('continues stopping remaining services when one stop fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const calls: string[] = []
    const registry = new ServiceRegistry()
    registry.register({
      name: 'a',
      start: () => undefined,
      stop: () => {
        calls.push('stop:a')
      },
    })
    registry.register({
      name: 'b',
      start: () => undefined,
      stop: () => {
        throw new Error('boom')
      },
    })
    registry.register({
      name: 'c',
      start: () => undefined,
      stop: () => {
        calls.push('stop:c')
      },
    })

    await registry.startAll()
    await registry.stopAll()

    expect(calls).toEqual(['stop:c', 'stop:a'])
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('rolls back the failing service and previously started services', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const calls: string[] = []
    const registry = new ServiceRegistry()
    registry.register({
      name: 'a',
      start: () => {
        calls.push('start:a')
      },
      stop: () => {
        calls.push('stop:a')
      },
    })
    registry.register({
      name: 'b',
      start: () => {
        calls.push('start:b')
        throw new Error('partial failure')
      },
      stop: () => {
        calls.push('stop:b')
      },
    })
    registry.register({
      name: 'c',
      start: () => {
        calls.push('start:c')
      },
      stop: () => {
        calls.push('stop:c')
      },
    })

    await expect(registry.startAll()).rejects.toThrow('partial failure')

    expect(calls).toEqual(['start:a', 'start:b', 'stop:b', 'stop:a'])
    expect(registry.getState()).toBe('idle')
    error.mockRestore()
  })

  it('makes repeated start and stop calls idempotent', async () => {
    const start = vi.fn()
    const stop = vi.fn()
    const registry = new ServiceRegistry()
    registry.register({ name: 'service', start, stop })

    await Promise.all([registry.startAll(), registry.startAll()])
    await Promise.all([registry.stopAll(), registry.stopAll()])
    await registry.stopAll()

    expect(start).toHaveBeenCalledTimes(1)
    expect(stop).toHaveBeenCalledTimes(1)
    expect(registry.getState()).toBe('idle')
  })

  it('restarts the same service declarations', async () => {
    const calls: string[] = []
    const registry = new ServiceRegistry()
    registry.register({
      name: 'service',
      start: () => {
        calls.push('start')
      },
      stop: () => {
        calls.push('stop')
      },
    })

    await registry.startAll()
    await registry.restartAll()

    expect(calls).toEqual(['start', 'stop', 'start'])
    expect(registry.getState()).toBe('started')
  })
})
