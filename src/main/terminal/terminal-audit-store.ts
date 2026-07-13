import { app } from 'electron'
import { dirname, join } from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import type { TerminalAuditEvent } from '../../shared/terminal'

export interface TerminalAuditStoreState {
  version: 1
  events: TerminalAuditEvent[]
  updatedAt: number
}

export interface TerminalAuditEventInput extends Omit<TerminalAuditEvent, 'id' | 'timestamp'> {
  id?: string
  timestamp?: number
}

export interface TerminalAuditListFilter {
  terminalSessionId?: string
  workspaceKey?: string | null
  limit?: number
}

const EMPTY_STATE: TerminalAuditStoreState = {
  version: 1,
  events: [],
  updatedAt: 0,
}

const MAX_AUDIT_EVENTS = 5000

function newAuditEventId(): string {
  return `terminal-audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function isTerminalAuditEvent(value: unknown): value is TerminalAuditEvent {
  if (!value || typeof value !== 'object') return false
  const event = value as Partial<TerminalAuditEvent>
  return (
    typeof event.id === 'string' &&
    typeof event.terminalSessionId === 'string' &&
    typeof event.timestamp === 'number' &&
    typeof event.kind === 'string'
  )
}

function byTimestampAsc(a: TerminalAuditEvent, b: TerminalAuditEvent): number {
  return a.timestamp - b.timestamp
}

export class TerminalAuditStore {
  private readonly filePath: string
  private state: TerminalAuditStoreState = { ...EMPTY_STATE, events: [] }
  private loaded = false

  constructor(filename = 'terminal-audit-log.json') {
    this.filePath = join(app.getPath('userData'), filename)
  }

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<TerminalAuditStoreState>
      this.state = {
        version: 1,
        events: Array.isArray(parsed.events) ? parsed.events.filter(isTerminalAuditEvent) : [],
        updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('[TerminalAuditStore] 加载失败:', (error as Error).message)
      }
      this.state = { ...EMPTY_STATE, events: [] }
    }
    this.loaded = true
  }

  private async ensureLoaded(): Promise<void> {
    if (!this.loaded) await this.load()
  }

  private async save(): Promise<void> {
    this.state.updatedAt = Date.now()
    try {
      await mkdir(dirname(this.filePath), { recursive: true })
      await writeFile(this.filePath, JSON.stringify(this.state, null, 2), 'utf-8')
    } catch (error) {
      console.warn('[TerminalAuditStore] 保存失败:', (error as Error).message)
    }
  }

  async recordEvent(input: TerminalAuditEventInput): Promise<TerminalAuditEvent> {
    await this.ensureLoaded()
    const event: TerminalAuditEvent = {
      ...input,
      id: input.id ?? newAuditEventId(),
      timestamp: input.timestamp ?? Date.now(),
    }
    this.state.events = [...this.state.events, event]
      .sort(byTimestampAsc)
      .slice(-MAX_AUDIT_EVENTS)
    await this.save()
    return event
  }

  async listEvents(filter: TerminalAuditListFilter = {}): Promise<TerminalAuditEvent[]> {
    await this.ensureLoaded()
    let events = [...this.state.events].sort(byTimestampAsc)
    if (filter.terminalSessionId) {
      events = events.filter((event) => event.terminalSessionId === filter.terminalSessionId)
    }
    if ('workspaceKey' in filter) {
      events = events.filter((event) => (event.workspaceKey ?? null) === filter.workspaceKey)
    }
    if (typeof filter.limit === 'number' && filter.limit >= 0) {
      events = events.slice(-filter.limit)
    }
    return events
  }

  async clearSession(terminalSessionId: string): Promise<void> {
    await this.ensureLoaded()
    this.state.events = this.state.events.filter((event) => event.terminalSessionId !== terminalSessionId)
    await this.save()
  }

  async clearAll(): Promise<void> {
    await this.ensureLoaded()
    this.state = { ...EMPTY_STATE, events: [] }
    await this.save()
  }
}
