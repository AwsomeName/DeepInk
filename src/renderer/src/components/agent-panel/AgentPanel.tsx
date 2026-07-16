import { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import {
  useAgentStore,
  useBrowserDownloadStore,
  useBrowserTaskStore,
  useDataSourceStore,
  useEditorStore,
  useFsStore,
  useSettingsStore,
  useTabStore,
  useWorkspaceStore,
} from '../../stores'
import { workspaceRefLabel } from '../../../../shared/workspace-ref'
import { MountedResourceBar } from '../../features/agent-conversations/mounted-resource-bar'
import { MountedSkillStrip } from '../../features/agent-conversations/mounted-skill-strip'
import {
  ResourceCandidateMenu,
  SkillCandidateMenu,
} from '../../features/agent-conversations/context-candidate-menu'
import {
  buildAgentSendPayload,
  stripTrailingMentionToken,
  toMountedResource,
  toMountedSkill,
} from '../../features/agent-conversations/payload'
import {
  buildResourceCandidates,
  buildSkillCandidates,
  buildQuickThreadList,
  createConversationRuntimeForWorkspace,
  type AgentResourceCandidate,
  type AgentSkillCandidate,
  type QuickThreadSummary,
} from '../../features/agent-conversations/view-model'
import type { PermissionMode } from '../../types'
import type { BrowserActionLog, BrowserDownloadRecord, BrowserTaskRun } from '@shared/ipc/browser'
import { ConversationMessageRenderer } from '../common/ConversationMessageRenderer'
import { AgentComposerToolbar } from '../../features/agent-composer/AgentComposerToolbar'
import { TerminalConfirmationCards } from './TerminalConfirmationCards'
import { buildAgentDiagnosticMarkdown } from '../../features/diagnostics/agent-diagnostic-report'
import { useToastStore } from '../common/Toast'
import {
  IconSparkle,
  IconCircle,
  IconSend,
  IconStop,
  IconDollar,
  IconTool,
  IconCheck,
  IconError,
  IconGlobe,
  IconFile,
  IconClipboard,
  IconPlus,
  IconHistory,
} from '../common/Icons'

interface AgentPanelProps {
  variant?: 'center' | 'side'
}

export function AgentPanel({ variant = 'side' }: AgentPanelProps): React.ReactElement {
  const conversations = useAgentStore((s) => s.conversations)
  const conversationOrder = useAgentStore((s) => s.conversationOrder)
  const activeConversationId = useAgentStore((s) => s.activeConversationId)
  const messages = useAgentStore((s) => s.messages)
  const input = useAgentStore((s) => s.input)
  const loading = useAgentStore((s) => s.loading)
  const backendState = useAgentStore((s) => s.backendState)
  const lastCost = useAgentStore((s) => s.lastCost)
  const pendingConfirmations = useAgentStore((s) => s.pendingConfirmations)
  const permissionMode = useAgentStore((s) => s.permissionMode)
  const setInput = useAgentStore((s) => s.setInput)
  const addUserMessage = useAgentStore((s) => s.addUserMessage)
  const addSystemMessage = useAgentStore((s) => s.addSystemMessage)
  const cancelStreaming = useAgentStore((s) => s.cancelStreaming)
  const removePendingConfirmation = useAgentStore((s) => s.removePendingConfirmation)
  const setPermissionMode = useAgentStore((s) => s.setPermissionMode)
  const addMountedResource = useAgentStore((s) => s.addMountedResource)
  const removeMountedResource = useAgentStore((s) => s.removeMountedResource)
  const addMountedSkill = useAgentStore((s) => s.addMountedSkill)
  const removeMountedSkill = useAgentStore((s) => s.removeMountedSkill)
  const scope = useAgentStore((s) => s.scope)
  const createConversation = useAgentStore((s) => s.createConversation)
  const switchConversation = useAgentStore((s) => s.switchConversation)
  const renameConversation = useAgentStore((s) => s.renameConversation)
  const tabs = useTabStore((s) => s.tabs)
  const activeTabId = useTabStore((s) => s.activeTabId)
  const openTab = useTabStore((s) => s.openTab)
  const settings = useSettingsStore((s) => s.settings)
  const loadSettings = useSettingsStore((s) => s.loadSettings)
  const editorFiles = useEditorStore((s) => s.files)
  const selectedPath = useFsStore((s) => s.selectedPath)
  const activeWorkspaceRef = useWorkspaceStore((s) => s.activeWorkspaceRef)
  const browserTasks = useBrowserTaskStore((s) => s.tasks)
  const browserActionLogs = useBrowserTaskStore((s) => s.actionLogs)
  const upsertBrowserTask = useBrowserTaskStore((s) => s.upsertTask)
  const upsertBrowserActionLog = useBrowserTaskStore((s) => s.upsertActionLog)
  const refreshBrowserTasks = useBrowserTaskStore((s) => s.refresh)
  const browserDownloads = useBrowserDownloadStore((s) => s.downloads)
  const upsertBrowserDownload = useBrowserDownloadStore((s) => s.upsertDownload)
  const refreshBrowserDownloads = useBrowserDownloadStore((s) => s.refresh)
  const dataSources = useDataSourceStore((s) => s.sources)
  const savedQueriesBySourceId = useDataSourceStore((s) => s.savedQueriesBySourceId)
  const loadDataSources = useDataSourceStore((s) => s.loadSources)
  const loadSavedQueries = useDataSourceStore((s) => s.loadSavedQueries)
  const showToast = useToastStore((s) => s.show)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  /** 中止重入守卫：防止快速连点产生重复的中止提示 */
  const abortingRef = useRef(false)
  const [resourceQuery, setResourceQuery] = useState<string | null>(null)
  const [skillQuery, setSkillQuery] = useState<string | null>(null)
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0)
  const [quickThreadsExpanded, setQuickThreadsExpanded] = useState(false)

  useEffect(() => {
    void refreshBrowserTasks()
    const offTask = window.cclinkStudio.browser.onTaskChanged(({ task }) => {
      upsertBrowserTask(task)
    })
    const offLog = window.cclinkStudio.browser.onActionLogChanged(({ log }) => {
      upsertBrowserActionLog(log)
    })
    const offDownload = window.cclinkStudio.browser.onDownloadChanged(({ download }) => {
      upsertBrowserDownload(download)
    })
    return () => {
      offTask()
      offLog()
      offDownload()
    }
  }, [refreshBrowserTasks, upsertBrowserTask, upsertBrowserActionLog, upsertBrowserDownload])

  useEffect(() => {
    void refreshBrowserDownloads()
  }, [refreshBrowserDownloads])

  useEffect(() => {
    void loadDataSources()
    void loadSavedQueries()
  }, [loadDataSources, loadSavedQueries])

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 发送消息
  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || loading) return
    const conversationId = activeConversationId
    setInput('', conversationId)
    setResourceQuery(null)
    setSkillQuery(null)
    addUserMessage(text, conversationId)
    try {
      const conversation = useAgentStore.getState().conversations[conversationId]
      await window.cclinkStudio.agent.sendMessage(
        conversationId,
        buildAgentSendPayload(text, conversation),
      )
    } catch (err) {
      addSystemMessage(`发送失败: ${String(err)}`, conversationId)
    }
  }, [activeConversationId, addSystemMessage, addUserMessage, input, loading, setInput])

  const updateMentionQueryFromInput = useCallback((text: string) => {
    const match = /(?:^|\s)([@/])([^\s@/]*)$/.exec(text)
    setResourceQuery(match?.[1] === '@' ? match[2] : null)
    setSkillQuery(match?.[1] === '/' ? match[2] : null)
    setMentionSelectedIndex(0)
  }, [])

  const handleInputChange = useCallback(
    (text: string) => {
      setInput(text, activeConversationId)
      updateMentionQueryFromInput(text)
    },
    [activeConversationId, setInput, updateMentionQueryFromInput],
  )

  const handleMountResource = useCallback(
    (resource: AgentResourceCandidate) => {
      addMountedResource(toMountedResource(resource), activeConversationId)
      setInput(stripTrailingMentionToken(input), activeConversationId)
      setResourceQuery(null)
      setSkillQuery(null)
      setMentionSelectedIndex(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    },
    [activeConversationId, addMountedResource, input, setInput],
  )

  const handleRemoveMountedResource = useCallback(
    (resourceId: string) => {
      removeMountedResource(resourceId, activeConversationId)
    },
    [activeConversationId, removeMountedResource],
  )

  const handleMountSkill = useCallback(
    (skill: AgentSkillCandidate) => {
      addMountedSkill(toMountedSkill(skill), activeConversationId)
      setInput(stripTrailingMentionToken(input), activeConversationId)
      setResourceQuery(null)
      setSkillQuery(null)
      setMentionSelectedIndex(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    },
    [activeConversationId, addMountedSkill, input, setInput],
  )

  const handleRemoveMountedSkill = useCallback(
    (skillId: string) => {
      removeMountedSkill(skillId, activeConversationId)
    },
    [activeConversationId, removeMountedSkill],
  )

  // 中止（带重入守卫，避免连点产生重复提示）
  const handleAbort = useCallback(async () => {
    if (abortingRef.current) return
    abortingRef.current = true
    try {
      const conversationId = activeConversationId
      await window.cclinkStudio.agent.abort(conversationId)
      cancelStreaming(conversationId)
      addSystemMessage('已手动中止当前任务', conversationId)
    } finally {
      abortingRef.current = false
    }
  }, [activeConversationId, cancelStreaming, addSystemMessage])

  // 权限确认：允许
  const handleConfirmApprove = useCallback(
    async (id: string, alwaysAllow = false) => {
      await window.cclinkStudio.agent.resolveToolConfirmation(id, true, alwaysAllow)
      removePendingConfirmation(id)
    },
    [removePendingConfirmation],
  )

  // 权限确认：拒绝
  const handleConfirmReject = useCallback(
    async (id: string) => {
      await window.cclinkStudio.agent.resolveToolConfirmation(id, false)
      removePendingConfirmation(id)
    },
    [removePendingConfirmation],
  )

  // 切换权限模式
  const handlePermissionModeChange = useCallback(
    async (nextMode: PermissionMode) => {
      if (nextMode === permissionMode) return
      await window.cclinkStudio.agent.setPermissionMode(nextMode)
      setPermissionMode(nextMode)
    },
    [permissionMode, setPermissionMode],
  )

  const handleOpenAgentSettings = useCallback(() => {
    openTab({ type: 'settings', title: 'Agent 设置', icon: '⚙️', settingsSection: 'agent' })
  }, [openTab])

  const handleNewConversation = useCallback(() => {
    const conversationId = createConversation({
      runtime: createConversationRuntimeForWorkspace(activeWorkspaceRef),
      activate: true,
    })
    setResourceQuery(null)
    setSkillQuery(null)
    void window.cclinkStudio.agent.resetSession(conversationId)
  }, [activeWorkspaceRef, createConversation])

  const handleSwitchConversation = useCallback(
    (conversationId: string) => {
      switchConversation(conversationId)
      setResourceQuery(null)
      setSkillQuery(null)
    },
    [switchConversation],
  )

  const handleCopyDiagnostics = useCallback(async () => {
    const conversation = useAgentStore.getState().conversations[activeConversationId] ?? null
    const currentMessages = conversation?.messages ?? messages
    const browserTab =
      scope.kind === 'browser'
        ? tabs.find((tab) => tab.id === scope.instanceId && tab.type === 'browser')
        : tabs.find((tab) => tab.id === activeTabId && tab.type === 'browser')
    const browserTabId = browserTab?.id ?? (scope.kind === 'browser' ? scope.instanceId : null)
    let currentUrl = browserTab?.initialUrl ?? null
    let viewState = null
    let pageDiagnostics = null

    if (browserTabId) {
      try {
        currentUrl = await window.cclinkStudio.browser.getCurrentURL(browserTabId)
      } catch {
        currentUrl = browserTab?.initialUrl ?? null
      }
      try {
        viewState = await window.cclinkStudio.browser.getViewState()
      } catch {
        viewState = null
      }
      try {
        pageDiagnostics = await window.cclinkStudio.browser.getDiagnostics(browserTabId)
      } catch {
        pageDiagnostics = null
      }
    }

    const tasksForTab = browserTabId
      ? Object.values(browserTasks)
          .filter((task) => task.tabId === browserTabId)
          .sort((a, b) => b.startedAt - a.startedAt)
      : []
    const diagnosticTask =
      tasksForTab.find((task) => !isFinalBrowserTaskStatus(task.status)) ?? tasksForTab[0] ?? null
    const diagnosticDownloads = diagnosticTask
      ? diagnosticTask.downloadIds.map((downloadId) => browserDownloads[downloadId]).filter(Boolean)
      : []
    const markdown = buildAgentDiagnosticMarkdown({
      appVersion: '0.1.1',
      platform: navigator.platform,
      workspaceRef: activeWorkspaceRef,
      conversation,
      messages: currentMessages,
      backendState,
      permissionMode,
      scope,
      browser: {
        tabId: browserTabId,
        url: pageDiagnostics?.url ?? currentUrl,
        title: pageDiagnostics?.title || browserTab?.title || null,
        profile: browserTab?.browserProfile ?? null,
        viewState,
      },
      pageDiagnostics,
      browserTask: diagnosticTask,
      browserActionLogs: diagnosticTask ? (browserActionLogs[diagnosticTask.id] ?? []) : [],
      browserDownloads: diagnosticDownloads,
      pendingConfirmationCount: pendingConfirmations.length,
    })

    try {
      await copyTextToClipboard(markdown)
      showToast('诊断日志已复制', 'success')
    } catch (err) {
      showToast(`复制诊断日志失败: ${String(err)}`, 'error')
    }
  }, [
    activeConversationId,
    activeTabId,
    activeWorkspaceRef,
    backendState,
    browserActionLogs,
    browserDownloads,
    browserTasks,
    messages,
    pendingConfirmations.length,
    permissionMode,
    scope,
    showToast,
    tabs,
  ])

  const allQuickThreads = useMemo(
    () =>
      buildQuickThreadList({
        conversations,
        conversationOrder,
        activeConversationId,
        activeWorkspaceRef,
        pendingConfirmationCount: pendingConfirmations.length,
        expanded: true,
      }),
    [
      activeConversationId,
      activeWorkspaceRef,
      conversationOrder,
      conversations,
      pendingConfirmations.length,
    ],
  )
  const quickThreads = quickThreadsExpanded ? allQuickThreads : allQuickThreads.slice(0, 5)

  useEffect(() => {
    if (variant !== 'side') return
    const active = conversations[activeConversationId]
    if (
      active &&
      !active.archivedAt &&
      allQuickThreads.some((thread) => thread.id === activeConversationId)
    ) {
      return
    }
    const fallback = allQuickThreads.find((thread) => !conversations[thread.id]?.archivedAt)
    if (fallback) {
      switchConversation(fallback.id)
      return
    }
    createConversation({
      runtime: createConversationRuntimeForWorkspace(activeWorkspaceRef),
    })
  }, [
    activeConversationId,
    activeWorkspaceRef,
    allQuickThreads,
    conversations,
    createConversation,
    switchConversation,
    variant,
  ])

  // 连接状态颜色
  const statusColor: Record<string, string> = {
    disconnected: '#666666',
    connecting: '#eab308',
    connected: '#22c55e',
    streaming: '#3b82f6',
    error: '#ef4444',
  }

  const statusText: Record<string, string> = {
    disconnected: '未连接',
    connecting: '连接中...',
    connected: '已就绪',
    streaming: '思考中...',
    error: '连接错误',
  }

  const riskLabel: Record<string, string> = {
    read: '只读',
    write: '写入',
    destructive: '破坏性',
  }

  const riskColor: Record<string, string> = {
    read: '#22c55e',
    write: '#eab308',
    destructive: '#ef4444',
  }

  const isStreaming = backendState === 'streaming'
  const activeBrowserTask = useMemo(() => {
    if (scope.kind !== 'browser') return null
    const tasks = Object.values(browserTasks)
      .filter((task) => task.tabId === scope.instanceId)
      .sort((a, b) => b.startedAt - a.startedAt)
    return tasks.find((task) => !isFinalBrowserTaskStatus(task.status)) ?? tasks[0] ?? null
  }, [browserTasks, scope])
  const activeBrowserTaskLogs = activeBrowserTask
    ? (browserActionLogs[activeBrowserTask.id] ?? []).slice(-5)
    : []
  const activeBrowserTaskDownloads = activeBrowserTask
    ? activeBrowserTask.downloadIds
        .map((downloadId) => browserDownloads[downloadId])
        .filter(Boolean)
        .slice(-3)
    : []
  const workspaceName = useMemo(() => workspaceRefLabel(activeWorkspaceRef), [activeWorkspaceRef])
  const activeConversation = conversations[activeConversationId]
  const mountedResources = activeConversation?.mountedResources ?? []
  const mountedSkills = activeConversation?.mountedSkills ?? []
  const savedQueries = useMemo(
    () => Object.values(savedQueriesBySourceId).flat(),
    [savedQueriesBySourceId],
  )
  const resourceCandidates = useMemo(
    () =>
      buildResourceCandidates({
        activeWorkspaceRef,
        tabs,
        editorFiles,
        selectedPath,
        dataSources,
        savedQueries,
        query: resourceQuery ?? '',
      }),
    [activeWorkspaceRef, dataSources, editorFiles, resourceQuery, savedQueries, selectedPath, tabs],
  )
  const skillCandidates = useMemo(() => buildSkillCandidates(skillQuery ?? ''), [skillQuery])
  const activeMentionKind =
    resourceQuery !== null ? 'resource' : skillQuery !== null ? 'skill' : null
  const activeMentionCount =
    activeMentionKind === 'resource'
      ? resourceCandidates.length
      : activeMentionKind === 'skill'
        ? skillCandidates.length
        : 0
  const handlePickSelectedMention = useCallback((): boolean => {
    if (activeMentionKind === 'resource') {
      const candidate = resourceCandidates[mentionSelectedIndex]
      if (!candidate) return false
      handleMountResource(candidate)
      return true
    }
    if (activeMentionKind === 'skill') {
      const candidate = skillCandidates[mentionSelectedIndex]
      if (!candidate) return false
      handleMountSkill(candidate)
      return true
    }
    return false
  }, [
    activeMentionKind,
    handleMountResource,
    handleMountSkill,
    mentionSelectedIndex,
    resourceCandidates,
    skillCandidates,
  ])

  useEffect(() => {
    if (activeMentionCount === 0) {
      setMentionSelectedIndex(0)
      return
    }
    setMentionSelectedIndex((index) => Math.min(index, activeMentionCount - 1))
  }, [activeMentionCount])

  // 键盘事件：候选菜单优先；流式输出期间仍允许编辑草稿，但不提交。
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.nativeEvent.isComposing) return

      if (activeMentionKind && activeMentionCount > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setMentionSelectedIndex((index) => (index + 1) % activeMentionCount)
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setMentionSelectedIndex((index) => (index - 1 + activeMentionCount) % activeMentionCount)
          return
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault()
          handlePickSelectedMention()
          return
        }
      }

      if (activeMentionKind && e.key === 'Escape') {
        e.preventDefault()
        setResourceQuery(null)
        setSkillQuery(null)
        setMentionSelectedIndex(0)
        return
      }

      if (loading) return
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [activeMentionCount, activeMentionKind, handlePickSelectedMention, handleSend, loading],
  )
  const isStartConversation =
    messages.every((msg) => msg.id === 'welcome') &&
    pendingConfirmations.length === 0 &&
    !loading &&
    lastCost === null

  if (variant === 'center' && isStartConversation) {
    return (
      <div className="agent-start-page">
        <div className="agent-start-content">
          <div className="agent-start-status">
            <IconSparkle size={14} />
            <span>Agent</span>
            <IconCircle
              size={8}
              filled
              color={statusColor[backendState]}
              className={isStreaming ? 'animate-pulse' : ''}
            />
            <span>{statusText[backendState]}</span>
          </div>

          <h1 className="agent-start-title">我们应该在 {workspaceName} 中构建什么？</h1>

          <div className="agent-start-composer">
            {resourceQuery !== null && (
              <ResourceCandidateMenu
                candidates={resourceCandidates}
                selectedIndex={mentionSelectedIndex}
                onActiveIndexChange={setMentionSelectedIndex}
                onPick={handleMountResource}
              />
            )}
            {skillQuery !== null && (
              <SkillCandidateMenu
                candidates={skillCandidates}
                selectedIndex={mentionSelectedIndex}
                onActiveIndexChange={setMentionSelectedIndex}
                onPick={handleMountSkill}
              />
            )}
            <MountedSkillStrip skills={mountedSkills} onRemove={handleRemoveMountedSkill} />
            <textarea
              ref={inputRef}
              className="agent-start-input"
              value={input}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="随心输入"
              rows={3}
            />
            <AgentComposerToolbar
              permissionMode={permissionMode}
              settings={settings}
              loading={loading}
              canSend={Boolean(input.trim())}
              onPermissionModeChange={handlePermissionModeChange}
              onOpenResourceMenu={() => setResourceQuery('')}
              onOpenSkillMenu={() => setSkillQuery('')}
              onOpenSettings={handleOpenAgentSettings}
              sendButton={
                <button
                  className="agent-start-send"
                  onClick={handleSend}
                  disabled={!input.trim()}
                  title="发送"
                >
                  <IconSend size={16} />
                </button>
              }
            />
          </div>

          <div className="agent-start-hints">
            <span>打开网页并整理资料</span>
            <span>新建 Markdown 草稿</span>
            <span>继续当前工作空间任务</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`agent-panel agent-panel-${variant}`}>
      {variant === 'side' && (
        <QuickThreadSwitcher
          threads={quickThreads}
          totalCount={allQuickThreads.length}
          expanded={quickThreadsExpanded}
          onToggleExpanded={() => setQuickThreadsExpanded((value) => !value)}
          onNew={handleNewConversation}
          onSwitch={handleSwitchConversation}
          onRename={renameConversation}
        />
      )}
      <div className="agent-conversation-main">
        {activeBrowserTask && (
          <BrowserTaskCard
            task={activeBrowserTask}
            logs={activeBrowserTaskLogs}
            downloads={activeBrowserTaskDownloads}
            onPause={() => {
              void window.cclinkStudio.browser.pauseTask(activeBrowserTask.id)
            }}
            onResume={() => {
              void window.cclinkStudio.browser.resumeTask(activeBrowserTask.id)
            }}
            onCancel={() => {
              void window.cclinkStudio.browser.cancelTask(activeBrowserTask.id)
            }}
          />
        )}

        {/* 消息列表 */}
        <div className="agent-messages">
          {messages.map((msg) => (
            <ConversationMessageRenderer key={msg.id} message={msg} />
          ))}

          {/* 工具确认卡片（支持并发多个） */}
          {pendingConfirmations.map((req) => (
            <div key={req.id} className="tool-confirmation-card">
              <div className="confirmation-header">
                <IconTool size={14} />
                请求执行操作
              </div>
              <div className="confirmation-body">
                <div className="confirmation-row">
                  <span className="confirmation-label">操作:</span>
                  <span className="confirmation-value">{req.toolName}</span>
                </div>
                <div className="confirmation-row">
                  <span className="confirmation-label">参数:</span>
                  <span className="confirmation-value confirmation-params">
                    {Object.entries(req.params)
                      .map(([k, v]) => `${k}="${String(v)}"`)
                      .join(', ')}
                  </span>
                </div>
                <div className="confirmation-row">
                  <span className="confirmation-label">风险:</span>
                  <span className="confirmation-value" style={{ color: riskColor[req.riskLevel] }}>
                    {riskLabel[req.riskLevel]}
                  </span>
                </div>
              </div>
              <div className="confirmation-actions">
                <button
                  className="confirm-approve-btn"
                  onClick={() => handleConfirmApprove(req.id, false)}
                >
                  <IconCheck size={12} />
                  允许
                </button>
                <button
                  className="confirm-always-btn"
                  onClick={() => handleConfirmApprove(req.id, true)}
                >
                  始终允许
                </button>
                <button className="confirm-reject-btn" onClick={() => handleConfirmReject(req.id)}>
                  <IconError size={12} />
                  拒绝
                </button>
              </div>
            </div>
          ))}

          <TerminalConfirmationCards />

          <div ref={messagesEndRef} />
        </div>

        {/* 费用显示 */}
        {lastCost !== null && (
          <div className="agent-cost">
            <IconDollar size={10} />${lastCost.toFixed(4)}
          </div>
        )}

        {/* 输入区域 */}
        <div className="agent-composer-wrap">
          {resourceQuery !== null && (
            <ResourceCandidateMenu
              candidates={resourceCandidates}
              selectedIndex={mentionSelectedIndex}
              onActiveIndexChange={setMentionSelectedIndex}
              onPick={handleMountResource}
            />
          )}
          {skillQuery !== null && (
            <SkillCandidateMenu
              candidates={skillCandidates}
              selectedIndex={mentionSelectedIndex}
              onActiveIndexChange={setMentionSelectedIndex}
              onPick={handleMountSkill}
            />
          )}
          <MountedResourceBar resources={mountedResources} onRemove={handleRemoveMountedResource} />
          <MountedSkillStrip skills={mountedSkills} onRemove={handleRemoveMountedSkill} />
          <div className="agent-input-card">
            <button
              type="button"
              className="agent-copy-diagnostics-btn"
              onClick={() => void handleCopyDiagnostics()}
              title="复制当前会话诊断日志"
            >
              <IconClipboard size={13} />
            </button>
            <textarea
              ref={inputRef}
              className="agent-input"
              value={input}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入消息，@ 挂资源，/ 挂技能..."
              rows={2}
            />
            <AgentComposerToolbar
              permissionMode={permissionMode}
              settings={settings}
              loading={loading}
              canSend={Boolean(input.trim())}
              onPermissionModeChange={handlePermissionModeChange}
              onOpenResourceMenu={() => setResourceQuery('')}
              onOpenSkillMenu={() => setSkillQuery('')}
              onOpenSettings={handleOpenAgentSettings}
              sendButton={
                loading ? (
                  <button className="agent-abort-btn" onClick={handleAbort} title="中止">
                    <IconStop size={15} />
                  </button>
                ) : (
                  <button
                    className="agent-send-btn"
                    onClick={handleSend}
                    disabled={!input.trim()}
                    title="发送"
                  >
                    <IconSend size={17} />
                  </button>
                )
              }
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function QuickThreadSwitcher({
  threads,
  totalCount,
  expanded,
  onToggleExpanded,
  onNew,
  onSwitch,
  onRename,
}: {
  threads: QuickThreadSummary[]
  totalCount: number
  expanded: boolean
  onToggleExpanded: () => void
  onNew: () => void
  onSwitch: (conversationId: string) => void
  onRename: (conversationId: string, title: string) => void
}): React.ReactElement {
  const [contextMenu, setContextMenu] = useState<{
    thread: QuickThreadSummary
    x: number
    y: number
  } | null>(null)
  const [renamingThreadId, setRenamingThreadId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const contextMenuRef = useRef<HTMLDivElement | null>(null)
  const renameInputRef = useRef<HTMLInputElement | null>(null)
  const renameCancelledRef = useRef(false)
  const hasOverflow = totalCount > 5

  useEffect(() => {
    if (!contextMenu) return

    const handlePointerDown = (event: MouseEvent): void => {
      if (!contextMenuRef.current?.contains(event.target as Node)) {
        setContextMenu(null)
      }
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setContextMenu(null)
    }

    const frame = requestAnimationFrame(() => {
      document.addEventListener('mousedown', handlePointerDown)
      document.addEventListener('keydown', handleKeyDown)
    })

    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [contextMenu])

  useEffect(() => {
    if (!renamingThreadId) return
    renameInputRef.current?.focus()
    renameInputRef.current?.select()
  }, [renamingThreadId])

  const beginRename = (): void => {
    if (!contextMenu) return
    const { thread } = contextMenu
    setContextMenu(null)
    renameCancelledRef.current = false
    setRenameDraft(thread.title)
    setRenamingThreadId(thread.id)
  }

  const commitRename = (threadId: string): void => {
    if (renameCancelledRef.current) {
      renameCancelledRef.current = false
      return
    }
    const nextTitle = renameDraft.trim()
    setRenamingThreadId(null)
    setRenameDraft('')
    if (!nextTitle) return
    onRename(threadId, nextTitle)
  }

  return (
    <div className="agent-quick-switcher">
      <div className="agent-quick-switcher-head">
        <div className="agent-quick-switcher-heading">
          <IconHistory size={12} />
          <span>会话列表</span>
          <em>{totalCount}</em>
        </div>
        <button type="button" className="agent-quick-new-btn" onClick={onNew} title="新建会话">
          <IconPlus size={14} />
        </button>
      </div>

      <div className="agent-quick-thread-list" aria-label="会话列表">
        {threads.map((thread) => (
          <div
            key={thread.id}
            className={`agent-quick-thread-row ${thread.isActive ? 'active' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => {
              if (renamingThreadId !== thread.id) onSwitch(thread.id)
            }}
            onKeyDown={(event) => {
              if (
                event.target === event.currentTarget &&
                (event.key === 'Enter' || event.key === ' ')
              ) {
                event.preventDefault()
                onSwitch(thread.id)
              }
            }}
            onContextMenu={(event) => {
              event.preventDefault()
              event.stopPropagation()
              setContextMenu({
                thread,
                x: event.clientX,
                y: event.clientY,
              })
            }}
            title={`${thread.title} · ${thread.statusLabel} · 右键重命名`}
          >
            <span className={`agent-quick-thread-dot status-${thread.statusKind}`} />
            <span className="agent-quick-thread-copy">
              {renamingThreadId === thread.id ? (
                <input
                  ref={renameInputRef}
                  className="agent-quick-thread-rename-input"
                  value={renameDraft}
                  aria-label="重命名会话"
                  onChange={(event) => setRenameDraft(event.target.value)}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => {
                    event.stopPropagation()
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      event.currentTarget.blur()
                    } else if (event.key === 'Escape') {
                      event.preventDefault()
                      renameCancelledRef.current = true
                      setRenamingThreadId(null)
                      setRenameDraft('')
                    }
                  }}
                  onBlur={() => commitRename(thread.id)}
                />
              ) : (
                <span className="agent-quick-thread-title">{thread.title}</span>
              )}
              <span className="agent-quick-thread-meta">
                {thread.workspaceLabel} · {thread.messageCount} 条消息
              </span>
            </span>
            <span className="agent-quick-thread-detail">{thread.detail}</span>
          </div>
        ))}
      </div>

      {hasOverflow && (
        <button
          type="button"
          className="agent-quick-expand-btn"
          onClick={onToggleExpanded}
          title={expanded ? '收起会话列表' : '展开更多会话'}
        >
          {expanded ? '收起' : `展开其余 ${totalCount - threads.length}`}
        </button>
      )}

      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="context-menu agent-thread-context-menu"
          role="menu"
          style={{
            left: Math.min(contextMenu.x, window.innerWidth - 170),
            top: Math.min(contextMenu.y, window.innerHeight - 56),
          }}
        >
          <div className="context-menu-items">
            <button
              type="button"
              className="context-menu-item agent-thread-context-action"
              role="menuitem"
              onClick={beginRename}
            >
              <span className="context-menu-icon">✎</span>
              <span>重命名</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function BrowserTaskCard({
  task,
  logs,
  downloads,
  onPause,
  onResume,
  onCancel,
}: {
  task: BrowserTaskRun
  logs: BrowserActionLog[]
  downloads: BrowserDownloadRecord[]
  onPause: () => void
  onResume: () => void
  onCancel: () => void
}): React.ReactElement {
  const status = browserTaskStatusMeta(task.status)
  const canPause = task.status === 'running'
  const canResume = task.status === 'paused'
  const canCancel = task.status === 'running' || task.status === 'paused'

  return (
    <div className={`browser-task-card browser-task-card-${task.status}`}>
      <div className="browser-task-head">
        <div className="browser-task-title">
          <IconGlobe size={13} />
          <span title={task.goal}>{task.goal}</span>
        </div>
        <span className="browser-task-status" style={{ color: status.color }}>
          <IconCircle size={7} filled color={status.color} />
          {status.label}
        </span>
      </div>

      {logs.length > 0 && (
        <div className="browser-task-log-list">
          {logs.map((log) => {
            const logMeta = browserActionStatusMeta(log.status)
            return (
              <div key={log.id} className="browser-task-log-row">
                <span className="browser-task-log-status" style={{ color: logMeta.color }}>
                  {logMeta.label}
                </span>
                <span className="browser-task-log-action">{log.action}</span>
                <span className="browser-task-log-time">
                  {formatBrowserTaskDuration(log.startedAt, log.endedAt)}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {task.errorMessage && (
        <div className="browser-task-error" title={task.errorMessage}>
          {task.failureReason ?? 'unknown'} · {task.errorMessage}
        </div>
      )}

      {downloads.length > 0 && (
        <div className="browser-task-downloads">
          {downloads.map((download) => (
            <div key={download.id} className="browser-task-download-row">
              <div className="browser-task-download-main">
                <IconFile size={12} />
                <span title={download.savedPath ?? download.tempPath ?? download.suggestedFilename}>
                  {download.suggestedFilename}
                </span>
                <em>{downloadStatusLabel(download)}</em>
              </div>
              {download.retention !== 'discarded' && (
                <div className="browser-task-download-actions">
                  <button
                    disabled={download.fileMissing}
                    onClick={() => {
                      void window.cclinkStudio.browser.openDownload(download.id)
                    }}
                  >
                    打开
                  </button>
                  <button
                    disabled={download.fileMissing}
                    onClick={() => {
                      void window.cclinkStudio.browser.revealDownload(download.id)
                    }}
                  >
                    定位
                  </button>
                  {download.retention === 'temporary' && (
                    <button
                      disabled={download.fileMissing}
                      onClick={() => {
                        void window.cclinkStudio.browser.keepDownloadToWorkspace(download.id)
                      }}
                    >
                      保留
                    </button>
                  )}
                  <button
                    disabled={download.fileMissing}
                    onClick={() => {
                      void window.cclinkStudio.browser.saveDownloadAs(download.id)
                    }}
                  >
                    另存为
                  </button>
                  {download.retention === 'temporary' && (
                    <button
                      className="danger"
                      onClick={() => {
                        void window.cclinkStudio.browser.discardDownload(download.id)
                      }}
                    >
                      丢弃
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {canCancel && (
        <div className="browser-task-actions">
          {canPause && (
            <button className="browser-task-btn" onClick={onPause}>
              暂停
            </button>
          )}
          {canResume && (
            <button className="browser-task-btn" onClick={onResume}>
              继续
            </button>
          )}
          <button className="browser-task-btn danger" onClick={onCancel}>
            <IconStop size={11} />
            终止
          </button>
        </div>
      )}
    </div>
  )
}

function downloadStatusLabel(download: BrowserDownloadRecord): string {
  if (download.fileMissing) return '已丢失'
  if (download.retention === 'discarded') return '已丢弃'
  if (download.retention === 'kept') return '已保留'
  switch (download.status) {
    case 'pending':
      return '等待中'
    case 'downloading':
      return '下载中'
    case 'completed':
      return '临时'
    case 'failed':
      return '失败'
    case 'cancelled':
      return '已取消'
  }
}

async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  const ok = document.execCommand('copy')
  document.body.removeChild(textarea)
  if (!ok) throw new Error('clipboard unavailable')
}

function isFinalBrowserTaskStatus(status: BrowserTaskRun['status']): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}

function browserTaskStatusMeta(status: BrowserTaskRun['status']): { label: string; color: string } {
  switch (status) {
    case 'running':
      return { label: '运行中', color: '#3b82f6' }
    case 'paused':
      return { label: '已暂停', color: '#eab308' }
    case 'completed':
      return { label: '已完成', color: '#22c55e' }
    case 'failed':
      return { label: '失败', color: '#ef4444' }
    case 'cancelled':
      return { label: '已终止', color: '#9ca3af' }
  }
}

function browserActionStatusMeta(status: BrowserActionLog['status']): {
  label: string
  color: string
} {
  switch (status) {
    case 'started':
      return { label: '执行中', color: '#3b82f6' }
    case 'succeeded':
      return { label: '成功', color: '#22c55e' }
    case 'failed':
      return { label: '失败', color: '#ef4444' }
    case 'skipped':
      return { label: '跳过', color: '#9ca3af' }
  }
}

function formatBrowserTaskDuration(startedAt: number, endedAt?: number): string {
  const durationMs = Math.max(0, (endedAt ?? Date.now()) - startedAt)
  if (durationMs < 1000) return `${durationMs}ms`
  return `${(durationMs / 1000).toFixed(1)}s`
}
