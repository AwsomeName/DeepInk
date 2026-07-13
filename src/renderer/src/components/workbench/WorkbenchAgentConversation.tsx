import { useEffect, useRef, type ReactNode } from 'react'
import { useAgentStore, useTabStore } from '../../stores'
import type { ConversationRuntimeRef } from '../../types'
import { workspaceRefLabel, workspaceRefSourceLabel } from '../../../../shared/workspace-ref'
import { ConversationMessageRenderer } from '../common/ConversationMessageRenderer'
import { IconSend, IconStop } from '../common/Icons'
import { ConversationShell, type ConversationShellBadgeKind } from './ConversationShell'
import {
  getLocalAgentConversationMeta,
  type ConversationRuntimeAdapterStatus,
} from '../../utils/conversation-runtime-adapter'
import { createLocalAgentConversationProvider } from '../../utils/conversation-runtime-provider'

export function WorkbenchAgentConversation({
  tabId,
  conversationId,
}: {
  tabId: string
  conversationId: string
}): React.ReactElement {
  const conversation = useAgentStore((state) => state.conversations[conversationId])
  const setInput = useAgentStore((state) => state.setInput)
  const addUserMessage = useAgentStore((state) => state.addUserMessage)
  const addSystemMessage = useAgentStore((state) => state.addSystemMessage)
  const cancelStreaming = useAgentStore((state) => state.cancelStreaming)
  const restoreArchivedConversation = useAgentStore((state) => state.restoreArchivedConversation)
  const updateTabTitle = useTabStore((state) => state.updateTabTitle)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const list = listRef.current
    if (!list) return
    list.scrollTop = list.scrollHeight
  }, [conversation?.messages.length])

  useEffect(() => {
    if (!conversation) return
    updateTabTitle(tabId, conversation.title === '新会话' ? '新工作会话' : conversation.title)
  }, [conversation, tabId, updateTabTitle])

  if (!conversation) {
    return (
      <div className="workbench-agent-conversation">
        <div className="workbench-agent-empty">这个工作会话不存在，可能已经被关闭或迁移。</div>
      </div>
    )
  }

  const runtimeMeta = getRuntimeMeta(conversation.runtime)
  const adapterMeta = getLocalAgentConversationMeta(
    conversation,
    runtimeMeta.subtitle,
    runtimeMeta.chips,
  )
  const isArchived = Boolean(conversation.archivedAt)
  const provider = createLocalAgentConversationProvider({
    conversationId,
    isBusy: () => Boolean(useAgentStore.getState().conversations[conversationId]?.loading),
    setInput,
    addUserMessage,
    addSystemMessage,
    cancelStreaming,
    sendMessage: window.deepink.agent.sendMessage,
    abortMessage: window.deepink.agent.abort,
  })

  return (
    <ConversationShell
      title={adapterMeta.title}
      subtitle={adapterMeta.subtitle}
      chips={adapterMeta.chips}
      badge={adapterMeta.badge}
      badgeKind={toShellBadgeKind(adapterMeta.status)}
      variant="local"
      listRef={listRef}
      composer={
        isArchived ? (
          <ConversationComposer>
            <div className="conversation-archive-composer">
              <span>这个工作会话已归档。恢复后才能继续发送消息。</span>
              <button onClick={() => restoreArchivedConversation(conversationId)} title="恢复会话">
                恢复会话
              </button>
            </div>
          </ConversationComposer>
        ) : (
          <ConversationComposer>
            <textarea
              value={conversation.input}
              onChange={(event) => setInput(event.target.value, conversationId)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault()
                  void provider.send(conversation.input)
                }
              }}
              placeholder="发送到这个工作会话。Cmd/Ctrl + Enter 发送。"
              disabled={conversation.loading}
            />
            {conversation.loading ? (
              <button onClick={() => void provider.abort?.()} title="中止当前任务">
                <IconStop size={16} />
              </button>
            ) : (
              <button
                disabled={!conversation.input.trim()}
                onClick={() => void provider.send(conversation.input)}
                title="发送"
              >
                <IconSend size={16} />
              </button>
            )}
          </ConversationComposer>
        )
      }
    >
      {conversation.messages.map((message) => (
        <ConversationMessageRenderer key={message.id} message={message} />
      ))}
    </ConversationShell>
  )
}

function ConversationComposer({ children }: { children: ReactNode }): React.ReactElement {
  return <>{children}</>
}

function getRuntimeMeta(runtime: ConversationRuntimeRef): {
  subtitle: string
  chips: string[]
} {
  const workspace = runtime.workspaceRef
  const workspaceLabel = workspace ? workspaceRefLabel(workspace) : '未绑定工作空间'
  const sourceLabel = workspace ? workspaceRefSourceLabel(workspace) : '系统'
  const locationLabel = runtime.location === 'remote' ? '远程' : '本地'
  const transportLabel =
    runtime.transport === 'local' ? 'Local' : runtime.transport === 'direct' ? 'Direct' : 'CCLink'

  return {
    subtitle: `${sourceLabel} · ${workspaceLabel}`,
    chips: [`${locationLabel}`, transportLabel],
  }
}

function toShellBadgeKind(status: ConversationRuntimeAdapterStatus): ConversationShellBadgeKind {
  switch (status) {
    case 'busy':
      return 'busy'
    case 'error':
      return 'error'
    case 'offline':
      return 'offline'
    case 'cached':
      return 'remote'
    case 'archived':
      return 'archived'
    case 'ready':
    default:
      return 'idle'
  }
}
