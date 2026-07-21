import { describe, expect, it } from 'vitest'
import { createRuntimeState } from './app-runtime'
import { getAgentCapabilities } from './agent-capabilities'

describe('getAgentCapabilities', () => {
  it('returns the structured runtime state and derives available from ready only', () => {
    const runtime = createRuntimeState(true)
    runtime.capabilities.ready('agent-backend')
    runtime.capabilities.degraded('browser', 'Browser 工具未注册')
    runtime.capabilities.failed('meshy', new Error('API initialization failed'))

    const capabilities = getAgentCapabilities(runtime)

    expect(capabilities.find((item) => item.name === 'agent-backend')).toMatchObject({
      state: 'ready',
      available: true,
    })
    expect(capabilities.find((item) => item.name === 'browser')).toMatchObject({
      state: 'degraded',
      available: false,
      reason: 'Browser 工具未注册',
    })
    expect(capabilities.find((item) => item.name === 'meshy')).toMatchObject({
      state: 'failed',
      available: false,
      reason: 'API initialization failed',
    })
  })

  it('reports a missing Android device as unavailable without hiding initialization failure', () => {
    const runtime = createRuntimeState(true)
    runtime.activeDeviceManager = { getSource: () => null } as never
    runtime.capabilities.ready('android')

    expect(getAgentCapabilities(runtime).find((item) => item.name === 'android')).toMatchObject({
      state: 'unavailable',
      reason: '未连接用户真机',
    })

    runtime.capabilities.failed('android', new Error('adb bootstrap failed'))
    expect(getAgentCapabilities(runtime).find((item) => item.name === 'android')).toMatchObject({
      state: 'failed',
      reason: 'adb bootstrap failed',
    })
  })
})
