import { describe, expect, it, vi } from 'vitest'
import { CclinkRemoteProvider } from './cclink-remote-provider'
import type { ChatccServer } from '../../shared/chatcc'
import { remoteWorkspaceRef } from '../../shared/workspace-ref'
import type { CclinkStore } from '../cclink/cclink-store'
import type { CclinkFileService } from '../cclink/cclink-file-service'

const onlineServer: ChatccServer = {
  id: 'server-1',
  name: 'Mac mini',
  hostname: 'mac-mini',
  os: 'Darwin',
  status: 'online',
  agentVersion: '0.8.3',
  protocolVersion: '2',
  claudeVersion: '1.0.0',
  lastSeen: 100,
  workspaces: [
    {
      id: 'workspace-1',
      serverId: 'server-1',
      path: '/Users/apple/project',
      name: 'project',
      sessionCount: 1,
    },
  ],
}

function storeWithServers(servers: ChatccServer[]): CclinkStore {
  return {
    listServers: vi.fn().mockResolvedValue(servers),
    sendLocalMessage: vi.fn().mockResolvedValue({ success: true, messages: [] }),
  } as unknown as CclinkStore
}

function fileService(): CclinkFileService {
  return {
    listFileTree: vi.fn().mockResolvedValue({ success: true, tree: { id: 'root', name: 'project', type: 'directory', path: '/Users/apple/project', modifiedByAgent: false } }),
    readFile: vi.fn().mockResolvedValue({ success: true, file: { path: '/Users/apple/project/README.md', content: '# Hi', totalLines: 1, agentModifiedLines: [] } }),
  } as unknown as CclinkFileService
}

describe('CclinkRemoteProvider', () => {
  it('maps an online CCLink workspace into remote capabilities', async () => {
    const provider = new CclinkRemoteProvider(storeWithServers([onlineServer]), fileService())
    const ref = remoteWorkspaceRef({
      endpointId: 'server-1',
      workspaceId: 'workspace-1',
      path: '/Users/apple/project',
    })

    const status = await provider.getStatus(ref)

    expect(status.state).toBe('online')
    expect(status.capabilities.file.read).toBe(true)
    expect(status.capabilities.shell.command).toBe(true)
    expect(status.capabilities.agent.claudeCode).toBe(true)
    expect(status.protocolVersion).toBe('2')
    expect(status.compatibility).toMatchObject({
      status: 'compatible',
      agentReported: '2',
    })
  })

  it('marks missing protocol versions as unknown for legacy CCLink agents', async () => {
    const legacyServer = { ...onlineServer, protocolVersion: undefined }
    const provider = new CclinkRemoteProvider(storeWithServers([legacyServer]), fileService())
    const ref = remoteWorkspaceRef({
      endpointId: 'server-1',
      workspaceId: 'workspace-1',
      path: '/Users/apple/project',
    })

    const status = await provider.getStatus(ref)

    expect(status.compatibility).toMatchObject({
      status: 'unknown',
      minSupported: '2',
    })
  })

  it('reports missing workspaces as structured remote errors', async () => {
    const provider = new CclinkRemoteProvider(storeWithServers([onlineServer]), fileService())
    const ref = remoteWorkspaceRef({
      endpointId: 'server-1',
      workspaceId: 'missing',
      path: '/Users/apple/missing',
    })

    const status = await provider.getStatus(ref)

    expect(status.remoteError).toMatchObject({
      layer: 'workspace',
      code: 'REMOTE_WORKSPACE_NOT_FOUND',
    })
    expect(status.capabilities.file.read).toBe(false)
  })

  it('keeps CCLink remote file writes unavailable until the agent protocol supports them', async () => {
    const provider = new CclinkRemoteProvider(storeWithServers([onlineServer]), fileService())
    const ref = remoteWorkspaceRef({
      endpointId: 'server-1',
      workspaceId: 'workspace-1',
      path: '/Users/apple/project',
    })

    const result = await provider.writeFile({
      ref,
      path: '/Users/apple/project/README.md',
      content: '# Updated',
    })

    expect(result).toMatchObject({
      success: false,
      unavailable: true,
      remoteError: {
        layer: 'file-provider',
        code: 'REMOTE_CAPABILITY_UNAVAILABLE',
      },
    })
  })

  it('sends remote agent messages through the existing CCLink session store', async () => {
    const store = storeWithServers([onlineServer])
    const provider = new CclinkRemoteProvider(store, fileService())
    const ref = remoteWorkspaceRef({
      endpointId: 'server-1',
      workspaceId: 'workspace-1',
      path: '/Users/apple/project',
    })

    await expect(provider.sendAgentMessage({ ref, sessionId: 'session-1', content: 'hello' }))
      .resolves.toEqual({ success: true, messages: [] })

    expect(store.sendLocalMessage).toHaveBeenCalledWith('session-1', 'hello')
  })
})
