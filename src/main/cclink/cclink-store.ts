import { app } from 'electron'
import { dirname, join } from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import type { ChatccMessage, ChatccServer, ChatccSession } from '../../shared/chatcc'
import type { CclinkApiState, CclinkConversationMessageResult } from '../../shared/ipc/cclink'
import { REMOTE_ERROR_CODE } from '../../shared/remote-error'

export type CclinkStoreState = CclinkApiState

const EMPTY_STATE: CclinkStoreState = {
  servers: [],
  sessions: [],
  messages: {},
  updatedAt: 0,
}

const MAX_MESSAGES_PER_SESSION = 2000

function byRecentUpdatedAt(a: { updatedAt: number }, b: { updatedAt: number }): number {
  return b.updatedAt - a.updatedAt
}

function byRecentLastSeen(a: { lastSeen: number }, b: { lastSeen: number }): number {
  return b.lastSeen - a.lastSeen
}

function newMessageId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export class CclinkStore {
  private readonly filePath: string
  private state: CclinkStoreState = { ...EMPTY_STATE, messages: {} }
  private loaded = false

  constructor(filename = 'cclink-state.json') {
    this.filePath = join(app.getPath('userData'), filename)
  }

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<CclinkStoreState>
      this.state = {
        servers: Array.isArray(parsed.servers) ? parsed.servers : [],
        sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
        messages: parsed.messages && typeof parsed.messages === 'object' ? parsed.messages : {},
        updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('[CclinkStore] 加载失败:', (err as Error).message)
      }
      this.state = { ...EMPTY_STATE, messages: {} }
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
    } catch (err) {
      console.warn('[CclinkStore] 保存失败:', (err as Error).message)
    }
  }

  async getState(): Promise<CclinkStoreState> {
    await this.ensureLoaded()
    return {
      servers: [...this.state.servers].sort(byRecentLastSeen),
      sessions: [...this.state.sessions].sort(byRecentUpdatedAt),
      messages: Object.fromEntries(
        Object.entries(this.state.messages).map(([sessionId, messages]) => [sessionId, [...messages]]),
      ),
      updatedAt: this.state.updatedAt,
    }
  }

  async listServers(): Promise<ChatccServer[]> {
    await this.ensureLoaded()
    return [...this.state.servers].sort(byRecentLastSeen)
  }

  async upsertServer(server: ChatccServer): Promise<void> {
    await this.ensureLoaded()
    this.state.servers = [
      server,
      ...this.state.servers.filter((item) => item.id !== server.id),
    ]
    await this.save()
  }

  async removeServer(serverId: string): Promise<void> {
    await this.ensureLoaded()
    this.state.servers = this.state.servers.filter((server) => server.id !== serverId)
    const removedSessionIds = new Set(
      this.state.sessions.filter((session) => session.serverId === serverId).map((session) => session.id),
    )
    this.state.sessions = this.state.sessions.filter((session) => session.serverId !== serverId)
    for (const sessionId of removedSessionIds) {
      delete this.state.messages[sessionId]
    }
    await this.save()
  }

  async listSessions(serverId?: string): Promise<ChatccSession[]> {
    await this.ensureLoaded()
    const sessions = serverId
      ? this.state.sessions.filter((session) => session.serverId === serverId)
      : this.state.sessions
    return [...sessions].sort(byRecentUpdatedAt)
  }

  async upsertSession(session: ChatccSession): Promise<void> {
    await this.ensureLoaded()
    this.state.sessions = [
      session,
      ...this.state.sessions.filter((item) => item.id !== session.id),
    ]
    await this.save()
  }

  async removeSession(sessionId: string): Promise<void> {
    await this.ensureLoaded()
    this.state.sessions = this.state.sessions.filter((session) => session.id !== sessionId)
    delete this.state.messages[sessionId]
    await this.save()
  }

  async listMessages(sessionId: string): Promise<ChatccMessage[]> {
    await this.ensureLoaded()
    return [...(this.state.messages[sessionId] ?? [])]
  }

  async appendMessage(sessionId: string, message: ChatccMessage): Promise<void> {
    await this.ensureLoaded()
    const messages = this.state.messages[sessionId] ?? []
    this.state.messages[sessionId] = [...messages, message].slice(-MAX_MESSAGES_PER_SESSION)
    this.state.sessions = this.state.sessions.map((session) => {
      if (session.id !== sessionId) return session
      return {
        ...session,
        updatedAt: message.timestamp,
        messageCount: (this.state.messages[sessionId] ?? []).length,
      }
    })
    await this.save()
  }

  async sendLocalMessage(sessionId: string, content: string): Promise<CclinkConversationMessageResult> {
    await this.ensureLoaded()
    const normalized = content.trim()
    if (!normalized) {
      return { success: true, messages: await this.listMessages(sessionId) }
    }

    const session = this.state.sessions.find((item) => item.id === sessionId)
    if (!session) {
      const message = '远程会话不存在或尚未同步'
      return {
        success: false,
        error: message,
        remoteError: {
          layer: 'execution-backend',
          code: REMOTE_ERROR_CODE.SESSION_NOT_FOUND,
          message,
          retryable: true,
          context: { sessionId },
        },
      }
    }

    const now = Math.floor(Date.now() / 1000)
    const userMessage: ChatccMessage = {
      type: 'user',
      id: newMessageId('msg-local-user'),
      content: normalized,
      timestamp: now,
    }
    const systemMessage: ChatccMessage = {
      type: 'system',
      id: newMessageId('msg-local-system'),
      content: '本地测试消息已写入。实时发送需要接入 TIM Transport 后转发给 chatcc-agent。',
      timestamp: now,
    }

    const messages = this.state.messages[sessionId] ?? []
    const nextMessages = [...messages, userMessage, systemMessage].slice(-MAX_MESSAGES_PER_SESSION)
    this.state.messages[sessionId] = nextMessages
    this.state.sessions = this.state.sessions.map((session) => {
      if (session.id !== sessionId) return session
      return {
        ...session,
        status: 'idle',
        updatedAt: now,
        messageCount: nextMessages.length,
      }
    })
    await this.save()
    return { success: true, messages: [...nextMessages] }
  }

  async replaceMessages(sessionId: string, messages: ChatccMessage[]): Promise<void> {
    await this.ensureLoaded()
    this.state.messages[sessionId] = [...messages].slice(-MAX_MESSAGES_PER_SESSION)
    await this.save()
  }

  async clear(): Promise<void> {
    this.state = { ...EMPTY_STATE, messages: {} }
    await this.save()
  }

  async seedDemoData(): Promise<void> {
    await this.ensureLoaded()
    const now = Date.now()
    const serverId = 'agent_demo_mac'
    const sessionId = 'sess-demo-cclink'
    await this.upsertServer({
      id: serverId,
      name: 'Work MacBook',
      hostname: 'work-macbook',
      os: 'Darwin 25.0.0',
      status: 'offline',
      agentVersion: '0.7.33',
      claudeVersion: 'unknown',
      lastSeen: Math.floor(now / 1000),
      workspaces: [{
        id: `${serverId}:/Users/apple/Desktop/DeepInk`,
        path: '/Users/apple/Desktop/DeepInk',
        name: 'DeepInk',
        serverId,
        sessionCount: 1,
      }],
    })
    await this.upsertSession({
      id: sessionId,
      name: 'CCLink 桌面端接入验证',
      workspacePath: '/Users/apple/Desktop/DeepInk',
      serverId,
      status: 'idle',
      createdAt: Math.floor(now / 1000),
      updatedAt: Math.floor(now / 1000),
      messageCount: 2,
      contextUsage: 0,
    })
    await this.replaceMessages(sessionId, [
      {
        type: 'user',
        id: 'msg-demo-user',
        content: '帮我看一下远程项目状态。',
        timestamp: Math.floor(now / 1000) - 60,
      },
      {
        type: 'agentText',
        id: 'msg-demo-agent',
        content: '远程 CCLink 会话已经可以被 DeepInk 本地状态层承载。下一步接 TIM transport。',
        timestamp: Math.floor(now / 1000),
        fileRefs: [],
      },
    ])
  }
}
