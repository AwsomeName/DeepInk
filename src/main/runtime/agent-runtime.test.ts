import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  AgentBridge: vi.fn(function AgentBridge() {
    return { invalidateBrowserScope: vi.fn() }
  }),
}))

vi.mock('../agent/agent-bridge', () => ({ AgentBridge: mocks.AgentBridge }))

import { createRuntimeState } from './app-runtime'
import { bootstrapAgentRuntime } from './agent-runtime'

describe('bootstrapAgentRuntime', () => {
  beforeEach(() => {
    mocks.AgentBridge.mockClear()
  })

  it('starts the local Agent when Playwright and ADB are unavailable', () => {
    const runtime = createRuntimeState(true)
    runtime.mainWindow = {} as never
    runtime.toolHost = {} as never
    runtime.permissionManager = {} as never
    runtime.mcpClientMgr = {} as never
    runtime.settingsService = {
      getRuntimeSettings: () => ({ agentEngine: 'local-claude-code' }),
      getAll: () => ({ lastWorkspacePath: '' }),
    } as never
    runtime.capabilities.ready('mcp')

    bootstrapAgentRuntime(runtime)

    expect(mocks.AgentBridge).toHaveBeenCalledWith(
      runtime.mainWindow,
      null,
      runtime.toolHost,
      runtime.permissionManager,
      runtime.mcpClientMgr,
      null,
      expect.any(Object),
    )
    expect(runtime.capabilities.get('agent-backend').state).toBe('ready')
  })

  it('keeps the Agent unavailable when the MCP host failed', () => {
    const runtime = createRuntimeState(true)
    runtime.mainWindow = {} as never
    runtime.toolHost = {} as never
    runtime.permissionManager = {} as never
    runtime.mcpClientMgr = {} as never
    runtime.settingsService = {} as never
    runtime.capabilities.failed('mcp', new Error('listen failed'))

    bootstrapAgentRuntime(runtime)

    expect(mocks.AgentBridge).not.toHaveBeenCalled()
    expect(runtime.capabilities.get('agent-backend')).toMatchObject({
      state: 'unavailable',
      reason: 'Agent 核心依赖未就绪',
    })
  })
})
