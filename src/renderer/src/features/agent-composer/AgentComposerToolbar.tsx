import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react'
import type { AppSettings, ClaudeCodeStatus } from '@shared/ipc/settings'
import type { AgentContextUsageSnapshot } from '@shared/agent-protocol'
import type { PermissionMode } from '../../types'
import type { AgentContextCompactionState } from '../../stores/agent-store'
import {
  IconCheck,
  IconChevronDown,
  IconCircle,
  IconFile,
  IconPlus,
  IconRefresh,
  IconRobot,
  IconSettings,
  IconSparkle,
} from '../../components/common/Icons'
import {
  getClaudeCodeSourceLabel,
  getClaudeCodeStatusDetail,
  getClaudeCodeStatusLabel,
  getPermissionModeOption,
  getRuntimeDetail,
  getRuntimeLabel,
  PERMISSION_MODE_OPTIONS,
} from './composer-view-model'

interface AgentComposerToolbarProps {
  permissionMode: PermissionMode
  settings: AppSettings
  loading: boolean
  canSend: boolean
  contextUsage: AgentContextUsageSnapshot | null
  contextCompaction: AgentContextCompactionState
  canCompact: boolean
  onPermissionModeChange: (mode: PermissionMode) => void
  onCompactContext: (instructions: string) => void
  onOpenResourceMenu: () => void
  onOpenSkillMenu: () => void
  onOpenSettings: () => void
  sendButton: ReactNode
}

export function AgentComposerToolbar({
  permissionMode,
  settings,
  loading,
  canSend,
  contextUsage,
  contextCompaction,
  canCompact,
  onPermissionModeChange,
  onCompactContext,
  onOpenResourceMenu,
  onOpenSkillMenu,
  onOpenSettings,
  sendButton,
}: AgentComposerToolbarProps): ReactElement {
  const [addOpen, setAddOpen] = useState(false)
  const [permissionOpen, setPermissionOpen] = useState(false)
  const [runtimeOpen, setRuntimeOpen] = useState(false)
  const [contextOpen, setContextOpen] = useState(false)
  const [compactInstructions, setCompactInstructions] = useState('')
  const [claudeStatus, setClaudeStatus] = useState<ClaudeCodeStatus | null>(null)
  const [detectingClaude, setDetectingClaude] = useState(false)
  const [claudeError, setClaudeError] = useState<string | null>(null)
  const addRef = useRef<HTMLDivElement>(null)
  const permissionRef = useRef<HTMLDivElement>(null)
  const runtimeRef = useRef<HTMLDivElement>(null)
  const contextRef = useRef<HTMLDivElement>(null)
  const selectedPermission = getPermissionModeOption(permissionMode)
  const runtimeLabel = getRuntimeLabel(settings)
  const runtimeDetail = getRuntimeDetail(settings)
  const claudeStatusLabel = getClaudeCodeStatusLabel(claudeStatus)
  const claudeStatusDetail = getClaudeCodeStatusDetail(claudeStatus)
  const contextPercent = Math.round(contextUsage?.percentage ?? 0)
  const contextTone =
    contextCompaction.status === 'compacting'
      ? 'compacting'
      : contextPercent >= 90
        ? 'critical'
        : contextPercent >= 70
          ? 'warning'
          : 'normal'
  const contextCategories = [...(contextUsage?.categories ?? [])]
    .filter((category) => category.tokens > 0)
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, 5)

  useEffect(() => {
    const refs = [addRef, permissionRef, runtimeRef, contextRef]
    const closeAll = (event: MouseEvent): void => {
      const target = event.target as Node
      if (refs.some((ref) => ref.current?.contains(target))) return
      setAddOpen(false)
      setPermissionOpen(false)
      setRuntimeOpen(false)
      setContextOpen(false)
    }
    document.addEventListener('mousedown', closeAll)
    return () => document.removeEventListener('mousedown', closeAll)
  }, [])

  const detectClaudeCode = async (): Promise<void> => {
    setDetectingClaude(true)
    setClaudeError(null)
    try {
      const result = await window.cclinkStudio.settings.detectClaudeCode()
      if (result.success && result.status) {
        setClaudeStatus(result.status)
        return
      }
      setClaudeError(result.error ?? '检测失败')
    } catch (error) {
      setClaudeError(error instanceof Error ? error.message : String(error))
    } finally {
      setDetectingClaude(false)
    }
  }

  useEffect(() => {
    if (!runtimeOpen || claudeStatus || detectingClaude) return
    void detectClaudeCode()
  }, [runtimeOpen, claudeStatus, detectingClaude])

  return (
    <div className="agent-composer-toolbar">
      <div className="agent-composer-tools">
        <div className="agent-composer-menu-wrap" ref={addRef}>
          <button
            className="agent-composer-icon-btn"
            title="添加上下文"
            onClick={() => setAddOpen((value) => !value)}
            disabled={loading}
          >
            <IconPlus size={16} />
          </button>
          {addOpen && (
            <div className="agent-composer-menu compact">
              <button
                onClick={() => {
                  setAddOpen(false)
                  onOpenResourceMenu()
                }}
              >
                <IconFile size={13} />
                <span>
                  <strong>挂资源</strong>
                  <em>@ 文件、Tab 或项目资源</em>
                </span>
              </button>
              <button
                onClick={() => {
                  setAddOpen(false)
                  onOpenSkillMenu()
                }}
              >
                <IconSparkle size={13} />
                <span>
                  <strong>挂技能</strong>
                  <em>/ Skill 工作流</em>
                </span>
              </button>
            </div>
          )}
        </div>

        <div className="agent-composer-menu-wrap" ref={permissionRef}>
          <button
            className="agent-mode-btn"
            onClick={() => setPermissionOpen((value) => !value)}
            title={`权限模式: ${selectedPermission.label}`}
            disabled={loading}
          >
            <IconCircle size={8} filled color={selectedPermission.color} />
            {selectedPermission.label}
            <IconChevronDown size={12} />
          </button>
          {permissionOpen && (
            <div className="agent-composer-menu">
              <div className="agent-composer-menu-title">权限模式</div>
              {PERMISSION_MODE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  className={option.value === permissionMode ? 'selected' : ''}
                  onClick={() => {
                    setPermissionOpen(false)
                    onPermissionModeChange(option.value)
                  }}
                >
                  <IconCircle size={8} filled color={option.color} />
                  <span>
                    <strong>{option.label}</strong>
                    <em>{option.description}</em>
                  </span>
                  {option.value === permissionMode && <IconCheck size={11} />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="agent-composer-tools">
        <div className="agent-composer-menu-wrap" ref={contextRef}>
          <button
            type="button"
            className={`agent-context-usage-btn ${contextTone}`}
            style={
              {
                '--agent-context-angle': `${Math.min(100, Math.max(0, contextPercent)) * 3.6}deg`,
              } as CSSProperties
            }
            title={
              contextUsage
                ? `上下文 ${contextPercent}% · ${formatTokens(contextUsage.totalTokens)} / ${formatTokens(contextUsage.maxTokens)}`
                : '上下文占用将在 Agent 运行后显示'
            }
            aria-label={contextUsage ? `上下文占用 ${contextPercent}%` : '上下文占用未知'}
            onClick={() => setContextOpen((value) => !value)}
          >
            <span>{contextCompaction.status === 'compacting' ? '…' : contextUsage ? contextPercent : '–'}</span>
          </button>
          {contextOpen && (
            <div className="agent-composer-menu agent-context-usage-menu align-right">
              <div className="agent-context-usage-heading">
                <span>
                  <strong>上下文窗口</strong>
                  <em>{contextUsage?.model || '等待 SDK 数据'}</em>
                </span>
                <b>{contextUsage ? `${contextPercent}%` : '未知'}</b>
              </div>

              {contextUsage ? (
                <>
                  <div className="agent-context-usage-meter" aria-hidden="true">
                    <span style={{ width: `${contextPercent}%` }} />
                  </div>
                  <div className="agent-context-usage-total">
                    <span>{formatTokens(contextUsage.totalTokens)} 已使用</span>
                    <span>{formatTokens(contextUsage.maxTokens)} 可用</span>
                  </div>
                  {contextCategories.length > 0 && (
                    <div className="agent-context-category-list">
                      {contextCategories.map((category) => (
                        <div key={category.name}>
                          <span>{formatCategoryName(category.name)}</span>
                          <strong>{formatTokens(category.tokens)}</strong>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="agent-context-auto-compact">
                    自动压缩
                    <strong>
                      {contextUsage.isAutoCompactEnabled
                        ? contextUsage.autoCompactThreshold
                          ? `约 ${formatTokens(contextUsage.autoCompactThreshold)}`
                          : '已启用'
                        : '未启用'}
                    </strong>
                  </div>
                </>
              ) : (
                <div className="agent-context-empty">暂无 SDK 用量数据</div>
              )}

              {contextCompaction.status !== 'idle' && (
                <div className={`agent-context-compact-result ${contextCompaction.status}`}>
                  <span>{compactionStatusLabel(contextCompaction)}</span>
                  {contextCompaction.preTokens !== null && (
                    <strong>
                      {formatTokens(contextCompaction.preTokens)}
                      {contextCompaction.postTokens !== null
                        ? ` → ${formatTokens(contextCompaction.postTokens)}`
                        : ''}
                    </strong>
                  )}
                </div>
              )}

              <div className="agent-context-compact-controls">
                <input
                  value={compactInstructions}
                  onChange={(event) => setCompactInstructions(event.target.value)}
                  placeholder="可选：指定要保留的重点"
                  maxLength={1000}
                  disabled={contextCompaction.status === 'compacting'}
                />
                <button
                  type="button"
                  className="agent-context-compact-btn"
                  disabled={!canCompact || contextCompaction.status === 'compacting'}
                  onClick={() => onCompactContext(compactInstructions)}
                >
                  <IconRefresh size={13} />
                  <span>
                    <strong>
                      {contextCompaction.status === 'compacting' ? '正在压缩' : '压缩上下文'}
                    </strong>
                    <em>{canCompact ? '保留当前会话并生成摘要' : '会话启动后可用'}</em>
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="agent-composer-menu-wrap" ref={runtimeRef}>
          <button
            className="agent-model-btn"
            title="运行环境"
            onClick={() => setRuntimeOpen((value) => !value)}
          >
            {runtimeLabel}
            <span>{runtimeDetail}</span>
            <IconChevronDown size={12} />
          </button>
          {runtimeOpen && (
            <div className="agent-composer-menu agent-runtime-menu align-right">
              <div className="agent-composer-menu-title">运行环境</div>
              <div className="agent-runtime-card">
                <IconRobot size={14} />
                <span>
                  <strong>{runtimeLabel}</strong>
                  <em>模型、登录和 API Key 由本机 Claude Code 管理</em>
                </span>
              </div>
              <div
                className={`agent-runtime-status ${claudeStatus?.installed ? 'ready' : 'warning'}`}
              >
                <span className="agent-runtime-status-dot" />
                <span>
                  <strong>{detectingClaude ? '检测中' : claudeStatusLabel}</strong>
                  <em title={claudeError ?? claudeStatusDetail}>
                    {claudeError ?? claudeStatusDetail}
                  </em>
                </span>
                <button
                  className="agent-runtime-refresh"
                  onClick={() => void detectClaudeCode()}
                  disabled={detectingClaude}
                  title="重新检测 Claude Code"
                >
                  <IconRefresh size={12} />
                </button>
              </div>
              <div className="agent-runtime-facts">
                <span>
                  <strong>{getClaudeCodeSourceLabel(claudeStatus?.source ?? null)}</strong>
                  <em>来源</em>
                </span>
                <span>
                  <strong>${settings.maxBudgetUsd.toFixed(2)}</strong>
                  <em>单次预算</em>
                </span>
              </div>
              <button
                onClick={() => {
                  setRuntimeOpen(false)
                  onOpenSettings()
                }}
              >
                <IconSettings size={13} />
                <span>
                  <strong>打开 Agent 设置</strong>
                  <em>Claude Code 路径、权限和预算</em>
                </span>
              </button>
            </div>
          )}
        </div>
        <span className="agent-composer-send-slot" aria-disabled={!canSend}>
          {sendButton}
        </span>
      </div>
    </div>
  )
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}m`
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k`
  return String(Math.round(tokens))
}

function formatCategoryName(name: string): string {
  const labels: Record<string, string> = {
    system_prompt: '系统提示',
    systemPrompt: '系统提示',
    tools: '工具定义',
    messages: '会话消息',
    mcp_tools: 'MCP 工具',
    memory_files: '项目记忆',
  }
  return labels[name] ?? name.replaceAll('_', ' ')
}

function compactionStatusLabel(state: AgentContextCompactionState): string {
  if (state.status === 'compacting') return '正在压缩上下文'
  if (state.status === 'failed') return state.error || '压缩失败'
  return state.trigger === 'auto' ? 'SDK 已自动压缩' : '上下文已压缩'
}
