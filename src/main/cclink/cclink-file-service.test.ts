import { describe, expect, it } from 'vitest'
import type { CclinkStore } from './cclink-store'
import { CclinkFileService } from './cclink-file-service'
import { CclinkProtocolResponseError, CclinkRequestTimeoutError } from './cclink-request-router'
import type { CclinkRequestClient } from './cclink-request-router'
import type { ChatccProtocolMessage } from '../../shared/chatcc/protocol'

function storeWithServers(servers: Awaited<ReturnType<CclinkStore['listServers']>>): CclinkStore {
  return {
    listServers: async () => servers,
  } as unknown as CclinkStore
}

describe('CclinkFileService', () => {
  it('returns unavailable when transport is not connected', async () => {
    const service = new CclinkFileService(storeWithServers([{
      id: 'mac',
      name: 'Mac mini',
      hostname: 'mac-mini',
      os: 'Darwin',
      status: 'online',
      agentVersion: '0.1.0',
      claudeVersion: 'unknown',
      lastSeen: 1,
      workspaces: [{
        id: 'ws-1',
        name: 'workspace',
        path: '/workspace',
        serverId: 'mac',
        sessionCount: 0,
      }],
    }]))

    const result = await service.listFileTree({ serverId: 'mac', workspaceId: 'ws-1', path: '/workspace' })

    expect(result.success).toBe(false)
    expect(result.unavailable).toBe(true)
    expect(result.error).toContain('尚未接入实时 transport')
    expect(result.remoteError).toMatchObject({
      layer: 'transport',
      code: 'REMOTE_TRANSPORT_UNAVAILABLE',
      retryable: true,
    })
  })

  it('validates remote workspace existence before file operations', async () => {
    const service = new CclinkFileService(storeWithServers([]))

    const result = await service.readFile({ serverId: 'missing', workspaceId: 'ws', path: '/a.md' })

    expect(result.success).toBe(false)
    expect(result.error).toContain('远程设备不存在')
    expect(result.remoteError).toMatchObject({
      layer: 'remote-agent',
      code: 'REMOTE_SERVER_NOT_FOUND',
      retryable: true,
      context: { serverId: 'missing' },
    })
  })

  it('returns structured workspace error when remote server is offline', async () => {
    const service = new CclinkFileService(storeWithServers([{
      id: 'linux',
      name: 'Linux box',
      hostname: 'linux',
      os: 'Linux',
      status: 'offline',
      agentVersion: '0.1.0',
      claudeVersion: 'unknown',
      lastSeen: 1,
      workspaces: [{
        id: 'ws-1',
        name: 'workspace',
        path: '/workspace',
        serverId: 'linux',
        sessionCount: 0,
      }],
    }]))

    const result = await service.listFileTree({ serverId: 'linux', workspaceId: 'ws-1' })

    expect(result.success).toBe(false)
    expect(result.unavailable).toBe(true)
    expect(result.remoteError).toMatchObject({
      layer: 'remote-agent',
      code: 'REMOTE_SERVER_NOT_ONLINE',
      retryable: true,
      context: { serverId: 'linux', workspaceId: 'ws-1', status: 'offline' },
    })
  })

  it('returns structured file provider error for unexpected remote responses', async () => {
    const requestClient: CclinkRequestClient = {
      request: async () => ({
        cc_type: 'file_read_response',
        v: 1,
        min_v: 1,
        path: '/workspace/README.md',
        content: '# Hello',
        total_lines: 1,
      }),
    }
    const service = new CclinkFileService(storeWithServers([{
      id: 'mac',
      name: 'Mac mini',
      hostname: 'mac-mini',
      os: 'Darwin',
      status: 'online',
      agentVersion: '0.1.0',
      claudeVersion: 'unknown',
      lastSeen: 1,
      workspaces: [{
        id: 'ws-1',
        name: 'workspace',
        path: '/workspace',
        serverId: 'mac',
        sessionCount: 0,
      }],
    }]), requestClient)

    const result = await service.listFileTree({ serverId: 'mac', workspaceId: 'ws-1' })

    expect(result.success).toBe(false)
    expect(result.remoteError).toMatchObject({
      layer: 'file-provider',
      code: 'UNEXPECTED_FILE_TREE_RESPONSE',
      retryable: true,
      context: { serverId: 'mac', workspaceId: 'ws-1' },
    })
  })

  it('keeps remote protocol errors in the file provider layer', async () => {
    const requestClient: CclinkRequestClient = {
      request: async () => {
        throw new CclinkProtocolResponseError('远程文件不存在', 'REMOTE_FILE_NOT_FOUND')
      },
    }
    const service = new CclinkFileService(storeWithServers([{
      id: 'mac',
      name: 'Mac mini',
      hostname: 'mac-mini',
      os: 'Darwin',
      status: 'online',
      agentVersion: '0.1.0',
      claudeVersion: 'unknown',
      lastSeen: 1,
      workspaces: [{
        id: 'ws-1',
        name: 'workspace',
        path: '/workspace',
        serverId: 'mac',
        sessionCount: 0,
      }],
    }]), requestClient)

    const result = await service.readFile({ serverId: 'mac', workspaceId: 'ws-1', path: '/workspace/missing.md' })

    expect(result.success).toBe(false)
    expect(result.unavailable).toBe(false)
    expect(result.remoteError).toMatchObject({
      layer: 'file-provider',
      code: 'REMOTE_FILE_NOT_FOUND',
      retryable: true,
      context: {
        serverId: 'mac',
        workspaceId: 'ws-1',
        path: '/workspace/missing.md',
        operation: 'file_read',
      },
    })
  })

  it('keeps request layer errors structured and adds file context', async () => {
    const requestClient: CclinkRequestClient = {
      request: async () => {
        throw new CclinkRequestTimeoutError()
      },
    }
    const service = new CclinkFileService(storeWithServers([{
      id: 'mac',
      name: 'Mac mini',
      hostname: 'mac-mini',
      os: 'Darwin',
      status: 'online',
      agentVersion: '0.1.0',
      claudeVersion: 'unknown',
      lastSeen: 1,
      workspaces: [{
        id: 'ws-1',
        name: 'workspace',
        path: '/workspace',
        serverId: 'mac',
        sessionCount: 0,
      }],
    }]), requestClient)

    const result = await service.readFile({ serverId: 'mac', workspaceId: 'ws-1', path: '/workspace/README.md' })

    expect(result.success).toBe(false)
    expect(result.unavailable).toBe(true)
    expect(result.remoteError).toMatchObject({
      layer: 'transport',
      code: 'REMOTE_REQUEST_TIMEOUT',
      retryable: true,
      context: {
        serverId: 'mac',
        workspaceId: 'ws-1',
        path: '/workspace/README.md',
        operation: 'file_read',
      },
    })
  })

  it('requests remote file tree through request client', async () => {
    const outboundMessages: ChatccProtocolMessage[] = []
    const requestClient: CclinkRequestClient = {
      request: async (_serverId, message) => {
        outboundMessages.push(message)
        return {
          cc_type: 'file_tree_response',
          v: 1,
          min_v: 1,
          tree: {
            id: 'root',
            name: 'workspace',
            type: 'directory',
            path: '/workspace',
            modifiedByAgent: false,
            children: [],
          },
        }
      },
    }
    const service = new CclinkFileService(storeWithServers([{
      id: 'mac',
      name: 'Mac mini',
      hostname: 'mac-mini',
      os: 'Darwin',
      status: 'online',
      agentVersion: '0.1.0',
      claudeVersion: 'unknown',
      lastSeen: 1,
      workspaces: [{
        id: 'ws-1',
        name: 'workspace',
        path: '/workspace',
        serverId: 'mac',
        sessionCount: 0,
      }],
    }]), requestClient)

    const result = await service.listFileTree({ serverId: 'mac', workspaceId: 'ws-1', depth: 1 })

    expect(result.success).toBe(true)
    expect(result.tree?.path).toBe('/workspace')
    const outbound = outboundMessages[0]
    expect(outbound?.cc_type).toBe('file_tree_request')
    expect(outbound).toMatchObject({ path: '/workspace', depth: 1 })
  })

  it('maps remote file read response to renderer file content', async () => {
    const requestClient: CclinkRequestClient = {
      request: async () => ({
        cc_type: 'file_read_response',
        v: 1,
        min_v: 1,
        path: '/workspace/README.md',
        content: '# Hello',
        total_lines: 1,
      }),
    }
    const service = new CclinkFileService(storeWithServers([{
      id: 'mac',
      name: 'Mac mini',
      hostname: 'mac-mini',
      os: 'Darwin',
      status: 'online',
      agentVersion: '0.1.0',
      claudeVersion: 'unknown',
      lastSeen: 1,
      workspaces: [{
        id: 'ws-1',
        name: 'workspace',
        path: '/workspace',
        serverId: 'mac',
        sessionCount: 0,
      }],
    }]), requestClient)

    const result = await service.readFile({ serverId: 'mac', workspaceId: 'ws-1', path: '/workspace/README.md' })

    expect(result.success).toBe(true)
    expect(result.file).toEqual({
      path: '/workspace/README.md',
      content: '# Hello',
      totalLines: 1,
      agentModifiedLines: [],
    })
  })
})
