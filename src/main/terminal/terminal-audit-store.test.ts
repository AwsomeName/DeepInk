import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockPaths = vi.hoisted(() => ({ userDataDir: '' }))

vi.mock('electron', () => ({
  app: {
    getPath: () => mockPaths.userDataDir,
  },
}))

import { TerminalAuditStore } from './terminal-audit-store'

let tempDir = ''

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'cclink-studio-terminal-audit-'))
  mockPaths.userDataDir = tempDir
})

afterEach(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true })
})

describe('TerminalAuditStore', () => {
  it('returns an empty list when no audit file exists', async () => {
    const store = new TerminalAuditStore()

    expect(await store.listEvents()).toEqual([])
  })

  it('persists events and reloads them in timestamp order', async () => {
    const store = new TerminalAuditStore()

    await store.recordEvent({
      id: 'event-2',
      terminalSessionId: 'terminal-1',
      workspaceKey: '/workspace',
      timestamp: 200,
      kind: 'output',
      message: 'done',
    })
    await store.recordEvent({
      id: 'event-1',
      terminalSessionId: 'terminal-1',
      workspaceKey: '/workspace',
      timestamp: 100,
      kind: 'command-submitted',
      actor: 'user',
      command: 'pwd',
      risk: 'read',
    })

    const raw = await readFile(join(tempDir, 'terminal-audit-log.json'), 'utf-8')
    expect(JSON.parse(raw)).toMatchObject({ version: 1 })

    const reloaded = new TerminalAuditStore()
    const events = await reloaded.listEvents()

    expect(events.map((event) => event.id)).toEqual(['event-1', 'event-2'])
    expect(events[0]).toMatchObject({
      actor: 'user',
      command: 'pwd',
      risk: 'read',
    })
  })

  it('filters events by terminal session and workspace', async () => {
    const store = new TerminalAuditStore()

    await store.recordEvent({
      id: 'local',
      terminalSessionId: 'terminal-local',
      workspaceKey: '/local',
      timestamp: 100,
      kind: 'created',
    })
    await store.recordEvent({
      id: 'namespaced',
      terminalSessionId: 'terminal-namespaced',
      workspaceKey: 'official://agent/ws',
      timestamp: 200,
      kind: 'created',
    })

    expect(
      (await store.listEvents({ terminalSessionId: 'terminal-local' })).map((event) => event.id),
    ).toEqual(['local'])
    expect(
      (await store.listEvents({ workspaceKey: 'official://agent/ws' })).map((event) => event.id),
    ).toEqual(['namespaced'])
  })

  it('limits to the latest events while keeping chronological order', async () => {
    const store = new TerminalAuditStore()

    await store.recordEvent({
      id: '1',
      terminalSessionId: 'terminal-1',
      timestamp: 1,
      kind: 'output',
    })
    await store.recordEvent({
      id: '2',
      terminalSessionId: 'terminal-1',
      timestamp: 2,
      kind: 'output',
    })
    await store.recordEvent({
      id: '3',
      terminalSessionId: 'terminal-1',
      timestamp: 3,
      kind: 'output',
    })

    expect((await store.listEvents({ limit: 2 })).map((event) => event.id)).toEqual(['2', '3'])
  })

  it('clears one session without deleting other audit events', async () => {
    const store = new TerminalAuditStore()

    await store.recordEvent({
      id: 'a',
      terminalSessionId: 'terminal-a',
      timestamp: 1,
      kind: 'created',
    })
    await store.recordEvent({
      id: 'b',
      terminalSessionId: 'terminal-b',
      timestamp: 2,
      kind: 'created',
    })

    await store.clearSession('terminal-a')

    expect((await store.listEvents()).map((event) => event.id)).toEqual(['b'])

    await store.clearAll()
    expect(await store.listEvents()).toEqual([])
  })
})
