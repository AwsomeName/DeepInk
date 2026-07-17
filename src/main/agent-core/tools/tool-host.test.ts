import { afterEach, describe, expect, it, vi } from 'vitest'
import { McpToolHost, type ToolConfirmationInput } from './tool-host'
import type { ToolModule } from './types'

describe('McpToolHost tool session context', () => {
  let host: McpToolHost | null = null

  afterEach(async () => {
    await host?.stop()
    host = null
  })

  it('attaches conversationId to tool confirmation requests', async () => {
    const requestConfirmation = vi.fn(async () => true)
    const execute = vi.fn(async () => ({ ok: true }))
    host = new McpToolHost({
      needsConfirmation: () => true,
      requestConfirmation,
    })
    host.registerModule(createModule(execute))
    const port = await host.start()
    const token = host.createToolSession('conv-123', '/workspace/a')

    const response = await fetch(`http://127.0.0.1:${port}/mcp?session=${token}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'test_write', arguments: { value: 1 } },
      }),
    })

    expect(response.status).toBe(200)
    expect(requestConfirmation).toHaveBeenCalledWith(
      expect.objectContaining<ToolConfirmationInput>({
        conversationId: 'conv-123',
        toolName: 'test_write',
        params: { value: 1 },
        riskLevel: 'write',
      }),
    )
    expect(execute).toHaveBeenCalledWith(
      'test_write',
      { value: 1 },
      {
        conversationId: 'conv-123',
        workspaceKey: '/workspace/a',
        confirmationGranted: true,
      },
    )
  })

  it('enforces a module runtime policy even when global auto mode allows the tool', async () => {
    const requestConfirmation = vi.fn(async () => true)
    const execute = vi.fn(async () => ({ ok: true }))
    host = new McpToolHost({
      needsConfirmation: () => false,
      requestConfirmation,
    })
    host.registerModule({
      ...createModule(execute),
      getExecutionPolicy: async () => ({
        requireConfirmation: true,
        riskLevel: 'destructive',
        reason: '最终发布动作',
        allowAlways: false,
      }),
    })
    const port = await host.start()

    await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'test_write', arguments: { value: 2 } },
      }),
    })

    expect(requestConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: '最终发布动作',
        allowAlways: false,
        riskLevel: 'destructive',
      }),
    )
    expect(execute).toHaveBeenCalledWith('test_write', { value: 2 }, { confirmationGranted: true })
  })

  it('hides disabled module tools and rejects calls from stale clients', async () => {
    const execute = vi.fn(async () => ({ ok: true }))
    host = new McpToolHost({
      needsConfirmation: () => false,
      requestConfirmation: vi.fn(async () => true),
    })
    host.registerModule(createModule(execute))

    expect(host.getAllTools()).toHaveLength(1)
    expect(host.setModuleEnabled('test', false)).toBe(true)
    expect(host.getAllTools()).toEqual([])
    expect(host.getRegisteredModules()).toMatchObject([
      { name: 'test', enabled: false, tools: [{ name: 'test_write' }] },
    ])

    const port = await host.start()
    const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'test_write', arguments: {} },
      }),
    })
    const payload = (await response.json()) as {
      result: { content: Array<{ text: string }>; isError?: boolean }
    }

    expect(payload.result.isError).toBe(true)
    expect(payload.result.content[0]?.text).toContain('已在设置中禁用')
    expect(execute).not.toHaveBeenCalled()
  })
})

function createModule(execute = vi.fn(async () => ({ ok: true }))): ToolModule {
  return {
    name: 'test',
    tools: [
      {
        name: 'test_write',
        description: 'write',
        inputSchema: {
          type: 'object',
          properties: {},
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
        },
      },
    ],
    execute,
  }
}
