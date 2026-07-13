import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChatccMessage } from '@shared/chatcc'
import { useCclinkStore } from '../../stores'
import { IconSend } from '../common/Icons'
import { RemoteErrorNotice } from '../common/RemoteErrorNotice'
import { ConversationShell } from '../workbench/ConversationShell'
import { getCclinkConversationMeta } from '../../utils/conversation-runtime-adapter'
import { createCclinkConversationProvider } from '../../utils/conversation-runtime-provider'

function normalizeTimestamp(timestamp: number): number {
  return timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp
}

function formatMessageTime(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(normalizeTimestamp(timestamp)))
}

function roleLabel(message: ChatccMessage): string {
  switch (message.type) {
    case 'user':
      return '我'
    case 'agentText':
      return 'Agent'
    case 'agentTool':
      return '工具'
    case 'system':
      return '系统'
  }
}

function messageText(message: ChatccMessage): string {
  if (message.type === 'agentTool') {
    return `${message.tool.toolType}: ${message.tool.target}${message.tool.summary ? `\n${message.tool.summary}` : ''}`
  }
  return message.content
}

export function CclinkConversation({ sessionId }: { sessionId: string }): React.ReactElement {
  const sessions = useCclinkStore((s) => s.sessions)
  const servers = useCclinkStore((s) => s.servers)
  const messages = useCclinkStore((s) => s.messages[sessionId] ?? [])
  const loading = useCclinkStore((s) => s.loading)
  const error = useCclinkStore((s) => s.error)
  const remoteError = useCclinkStore((s) => s.remoteError)
  const load = useCclinkStore((s) => s.load)
  const loadMessages = useCclinkStore((s) => s.loadMessages)
  const sendLocalMessage = useCclinkStore((s) => s.sendLocalMessage)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  const session = useMemo(
    () => sessions.find((item) => item.id === sessionId) ?? null,
    [sessionId, sessions],
  )
  const server = useMemo(
    () => servers.find((item) => item.id === session?.serverId) ?? null,
    [servers, session?.serverId],
  )
  const adapterMeta = useMemo(
    () => getCclinkConversationMeta(session, server),
    [server, session],
  )
  const provider = useMemo(
    () =>
      createCclinkConversationProvider({
        sessionId,
        load,
        loadMessages,
        sendLocalMessage,
      }),
    [load, loadMessages, sendLocalMessage, sessionId],
  )

  useEffect(() => {
    void provider.load?.()
  }, [provider])

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages.length])

  const submit = async (): Promise<void> => {
    const content = draft.trim()
    if (!content || sending) return
    setSending(true)
    setDraft('')
    try {
      await provider.send(content)
    } finally {
      setSending(false)
    }
  }

  return (
    <ConversationShell
      title={adapterMeta.title}
      subtitle={adapterMeta.subtitle}
      chips={adapterMeta.chips}
      badge={adapterMeta.badge}
      badgeKind={adapterMeta.status === 'ready' ? 'idle' : 'remote'}
      variant="remote"
      error={error ? <RemoteErrorNotice message={error} area="conversation" remoteError={remoteError} /> : null}
      listRef={listRef}
      empty={
        messages.length === 0 && !loading ? (
          <div className="cclink-conversation-empty">
            这个远程会话还没有消息。你可以先发一条消息验证会话闭环。
          </div>
        ) : null
      }
      composer={
        <>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                void submit()
              }
            }}
            placeholder="发送到远程会话。当前可本地测试，接实时链路后发送。"
          />
          <button
            disabled={!draft.trim() || sending}
            onClick={() => void submit()}
            title="发送 Cmd/Ctrl + Enter"
          >
            <IconSend size={16} />
          </button>
        </>
      }
    >
      {messages.map((message) => (
        <div key={message.id} className={`cclink-bubble-row ${message.type}`}>
          <div className="cclink-bubble-meta">
            <span>{roleLabel(message)}</span>
            <span>{formatMessageTime(message.timestamp)}</span>
          </div>
          <div className="cclink-bubble">
            {message.type === 'system' && message.remoteError ? (
              <RemoteErrorNotice
                message={message.content}
                area="conversation"
                remoteError={message.remoteError}
                compact
              />
            ) : (
              messageText(message)
            )}
          </div>
        </div>
      ))}
    </ConversationShell>
  )
}
