import { describe, expect, it } from 'vitest'
import type { AgentConversationState } from '../../stores/agent-store'
import type { WorkspaceRef } from '../../../../shared/workspace-ref'
import {
  buildActiveContextChips,
  buildArchivedAssistantPanelSessions,
  buildAssistantPanelSessionStats,
  buildAssistantPanelSessionGroups,
  buildProjectAssistantSessions,
  buildResourceCandidates,
  buildSkillCandidates,
  buildSessionDetail,
  createConversationRuntimeForWorkspace,
} from './view-model'
import { getWorkspaceConversationGroups } from './local-session-sidebar'

const now = new Date('2026-07-14T12:00:00+08:00').getTime()
const workspace: WorkspaceRef = { kind: 'local', path: '/Users/apple/project' }

describe('agent conversation view model', () => {
  it('groups assistant panel sessions and keeps active session first', () => {
    const conversations = {
      active: conversation({
        id: 'active',
        title: '当前任务',
        updatedAt: now - 3 * 24 * 60 * 60 * 1000,
        messages: ['先做这个'],
      }),
      today: conversation({
        id: 'today',
        title: '今天任务',
        updatedAt: now - 60 * 1000,
        messages: ['今天继续'],
      }),
      workbench: conversation({
        id: 'workbench',
        surface: 'workbench-tab',
        title: '工作会话',
      }),
    }

    const groups = buildAssistantPanelSessionGroups({
      conversations,
      conversationOrder: ['today', 'workbench', 'active'],
      activeConversationId: 'active',
      now,
    })

    expect(groups.map((group) => group.key)).toEqual(['active', 'today'])
    expect(groups[0].sessions[0].id).toBe('active')
    expect(groups[1].sessions[0].id).toBe('today')
  })

  it('summarizes archived assistant sessions separately', () => {
    const conversations = {
      archived: conversation({
        id: 'archived',
        archivedAt: now - 1000,
        title: '旧会话',
      }),
      open: conversation({
        id: 'open',
        title: '新会话',
      }),
    }

    const archived = buildArchivedAssistantPanelSessions({
      conversations,
      conversationOrder: ['archived', 'open'],
      activeConversationId: 'open',
      now,
    })

    expect(archived).toHaveLength(1)
    expect(archived[0].id).toBe('archived')
  })

  it('filters sessions by search query and active workspace', () => {
    const otherWorkspace: WorkspaceRef = { kind: 'local', path: '/Users/apple/other' }
    const conversations = {
      current: conversation({
        id: 'current',
        title: 'DeepInk 文档整理',
        messages: ['整理浏览器资料'],
      }),
      other: conversation({
        id: 'other',
        title: '别的项目',
        messages: ['DeepInk 资料'],
        workspaceRef: otherWorkspace,
      }),
      unbound: conversation({
        id: 'unbound',
        title: '随手问答',
        messages: ['hello'],
        workspaceRef: null,
      }),
    }

    const searched = buildAssistantPanelSessionGroups({
      conversations,
      conversationOrder: ['current', 'other', 'unbound'],
      activeConversationId: 'current',
      searchQuery: '浏览器',
      now,
    })
    expect(searched.flatMap((group) => group.sessions.map((session) => session.id))).toEqual([
      'current',
    ])

    const workspaceOnly = buildAssistantPanelSessionGroups({
      conversations,
      conversationOrder: ['current', 'other', 'unbound'],
      activeConversationId: 'current',
      filter: 'workspace',
      activeWorkspaceRef: workspace,
      now,
    })
    expect(workspaceOnly.flatMap((group) => group.sessions.map((session) => session.id))).toEqual([
      'current',
    ])
  })

  it('groups workbench conversations for the left session sidebar', () => {
    const otherWorkspace: WorkspaceRef = { kind: 'local', path: '/Users/apple/other' }
    const conversations = {
      current: conversation({
        id: 'current',
        title: '当前项目',
        surface: 'workbench-tab',
      }),
      unbound: conversation({
        id: 'unbound',
        title: '未绑定',
        surface: 'workbench-tab',
        workspaceRef: null,
      }),
      closed: conversation({
        id: 'closed',
        title: '已关闭',
        surface: 'workbench-tab',
        archivedAt: now - 1000,
      }),
      other: conversation({
        id: 'other',
        title: '其他项目',
        surface: 'workbench-tab',
        workspaceRef: otherWorkspace,
      }),
      assistant: conversation({
        id: 'assistant',
        title: '即时助手',
        surface: 'assistant-panel',
      }),
    }

    const groups = getWorkspaceConversationGroups(
      ['assistant', 'other', 'closed', 'unbound', 'current'],
      conversations,
      workspace,
    )

    expect(groups.current.map((item) => item.id)).toEqual(['current'])
    expect(groups.unbound.map((item) => item.id)).toEqual(['unbound'])
    expect(groups.closed.map((item) => item.id)).toEqual(['closed'])
  })

  it('builds session stats for visible assistant sessions', () => {
    const conversations = {
      bound: conversation({ id: 'bound', title: '已绑定' }),
      running: conversation({ id: 'running', title: '运行中', loading: true }),
      unbound: conversation({ id: 'unbound', title: '未绑定', workspaceRef: null }),
      archived: conversation({ id: 'archived', title: '归档', archivedAt: now }),
    }

    expect(
      buildAssistantPanelSessionStats({
        conversations,
        conversationOrder: ['bound', 'running', 'unbound', 'archived'],
      }),
    ).toEqual({
      total: 3,
      workspaceBound: 2,
      unbound: 1,
      running: 1,
    })
  })

  it('builds active and closed sessions for the current project only', () => {
    const otherWorkspace: WorkspaceRef = { kind: 'local', path: '/Users/apple/other' }
    const conversations = {
      active: conversation({ id: 'active', title: '当前项目会话' }),
      closed: conversation({
        id: 'closed',
        title: '当前项目关闭会话',
        archivedAt: now - 1000,
      }),
      other: conversation({
        id: 'other',
        title: '其他项目会话',
        workspaceRef: otherWorkspace,
      }),
      workbench: conversation({
        id: 'workbench',
        title: '工作会话',
        surface: 'workbench-tab',
      }),
    }

    const sessions = buildProjectAssistantSessions({
      conversations,
      conversationOrder: ['other', 'closed', 'workbench', 'active'],
      activeConversationId: 'active',
      activeWorkspaceRef: workspace,
      now,
    })

    expect(sessions.active.map((session) => session.id)).toEqual(['active'])
    expect(sessions.closed.map((session) => session.id)).toEqual(['closed'])
  })

  it('builds visible context chips from workspace, scope, and active tab', () => {
    const chips = buildActiveContextChips({
      activeWorkspaceRef: workspace,
      scope: { kind: 'browser', instanceId: 'tab-1' },
      activeTab: {
        id: 'tab-1',
        type: 'browser',
        title: 'DeepInk 官网',
        icon: 'G',
      },
      tabs: [
        {
          id: 'tab-1',
          type: 'browser',
          title: 'DeepInk 官网',
          icon: 'G',
        },
        {
          id: 'tab-2',
          type: 'editor',
          title: '方案.md',
          icon: 'F',
          filePath: '/Users/apple/project/方案.md',
          dirty: true,
        },
      ],
      editorFiles: {
        '/Users/apple/project/方案.md': {
          dirty: true,
        },
      },
    })

    expect(chips.map((chip) => chip.kind)).toEqual(['workspace', 'scope', 'tab', 'file', 'file'])
    expect(chips[0].label).toBe('project')
    expect(chips[1].label).toBe('DeepInk 官网')
  })

  it('builds @ resource candidates from workspace, selected files, open tabs, and drafts', () => {
    const candidates = buildResourceCandidates({
      activeWorkspaceRef: workspace,
      selectedPath: '/Users/apple/project/选题库.md',
      tabs: [
        {
          id: 'browser-1',
          type: 'browser',
          title: 'DeepInk 官网',
          icon: 'G',
        },
        {
          id: 'doc-1',
          type: 'editor',
          title: 'README.md',
          icon: 'F',
          filePath: '/Users/apple/project/README.md',
          dirty: false,
        },
        {
          id: 'android-1',
          type: 'android',
          title: 'Pixel 真机',
          icon: 'A',
        },
        {
          id: 'terminal-1',
          type: 'terminal',
          title: '部署命令',
          icon: 'T',
        },
      ],
      editorFiles: {
        '/Users/apple/project/README.md': {
          dirty: true,
        },
        'virtual:draft-1': {
          dirty: true,
        },
      },
    })

    expect(candidates.map((candidate) => candidate.id)).toEqual([
      'project:/Users/apple/project',
      'file:/Users/apple/project/选题库.md',
      'browser:browser-1',
      'file:/Users/apple/project/README.md',
      'android:android-1',
      'terminal:terminal-1',
      'draft:virtual:draft-1',
    ])
    expect(candidates[0]).toMatchObject({
      kind: 'project',
      label: 'project',
      source: 'workspace',
    })
    expect(candidates[1]).toMatchObject({
      kind: 'file',
      label: '选题库.md',
      source: 'selected-file',
    })
  })

  it('filters @ resource candidates by query text', () => {
    const candidates = buildResourceCandidates({
      activeWorkspaceRef: workspace,
      query: '本地',
      tabs: [
        {
          id: 'browser-1',
          type: 'browser',
          title: 'DeepInk 官网',
          icon: 'G',
        },
        {
          id: 'doc-1',
          type: 'editor',
          title: '方案.md',
          icon: 'F',
          filePath: '/Users/apple/project/方案.md',
        },
      ],
    })

    expect(candidates.map((candidate) => candidate.id)).toEqual(['project:/Users/apple/project'])
  })

  it('builds / skill candidates by query text', () => {
    const candidates = buildSkillCandidates('grill')

    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({
      id: 'grill-me',
      name: 'grill-me',
      label: 'grill-me',
    })
  })

  it('builds session detail rows for inspection panel', () => {
    const summary = buildAssistantPanelSessionGroups({
      conversations: {
        current: conversation({
          id: 'current',
          title: '验收会话',
          messages: ['检查 UI'],
        }),
      },
      conversationOrder: ['current'],
      activeConversationId: 'current',
      now,
    })[0].sessions[0]

    const detail = buildSessionDetail(summary)
    expect(detail?.title).toBe('验收会话')
    expect(detail?.rows.map((row) => row.label)).toContain('工作区')
    expect(detail?.rows.map((row) => row.label)).toContain('运行环境')
  })

  it('creates workspace-bound local conversation runtime', () => {
    expect(createConversationRuntimeForWorkspace(workspace)).toEqual({
      location: 'local',
      transport: 'local',
      backend: 'deepink-agent',
      workspaceRef: workspace,
    })
  })
})

function conversation({
  id,
  title,
  updatedAt = now,
  archivedAt = null,
  surface = 'assistant-panel',
  messages = [],
  workspaceRef = workspace,
  loading = false,
}: {
  id: string
  title: string
  updatedAt?: number
  archivedAt?: number | null
  surface?: AgentConversationState['surface']
  messages?: string[]
  workspaceRef?: WorkspaceRef | null
  loading?: boolean
}): AgentConversationState {
  return {
    id,
    title,
    surface,
    runtime: {
      location: 'local',
      transport: 'local',
      backend: 'deepink-agent',
      ...(workspaceRef ? { workspaceRef } : {}),
    },
    messages: [
      {
        id: 'welcome',
        role: 'assistant',
        content: [{ type: 'text', text: 'welcome' }],
        rawText: 'welcome',
        timestamp: updatedAt,
      },
      ...messages.map((message, index) => ({
        id: `user-${index}`,
        role: 'user' as const,
        content: [{ type: 'text' as const, text: message }],
        rawText: message,
        timestamp: updatedAt + index,
      })),
    ],
    input: '',
    loading,
    backendState: loading ? 'streaming' : 'connected',
    sessionId: null,
    streamingMessageId: null,
    lastCost: null,
    scope: { kind: 'all' },
    mountedResources: [],
    mountedSkills: [],
    createdAt: updatedAt,
    updatedAt,
    archivedAt,
  }
}
