import { describe, expect, it } from 'vitest'
import type { Tab } from '../types'
import { resolveConversationTab } from './conversation-tab'

describe('resolveConversationTab', () => {
  it('解析本地工作会话 Tab', () => {
    const tab: Tab = {
      id: 'tab-local',
      type: 'conversation',
      title: '本地会话',
      icon: '🤖',
      conversation: {
        surface: 'workbench-tab',
        runtime: {
          location: 'local',
          transport: 'local',
          backend: 'cclink-studio-agent',
        },
        sessionId: 'agent-1',
      },
    }

    expect(resolveConversationTab(tab)).toEqual({
      kind: 'local-agent',
      tabId: 'tab-local',
      conversationId: 'agent-1',
    })
  })

  it('非会话 Tab 返回 null', () => {
    expect(
      resolveConversationTab({
        id: 'doc',
        type: 'editor',
        title: 'README.md',
        icon: '📄',
      }),
    ).toBeNull()
  })
})
