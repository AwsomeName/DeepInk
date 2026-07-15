import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import type { AppSettings, ClaudeCodeStatus } from '@shared/ipc/settings'
import type { PermissionMode } from '../../types'
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
  onPermissionModeChange: (mode: PermissionMode) => void
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
  onPermissionModeChange,
  onOpenResourceMenu,
  onOpenSkillMenu,
  onOpenSettings,
  sendButton,
}: AgentComposerToolbarProps): ReactElement {
  const [addOpen, setAddOpen] = useState(false)
  const [permissionOpen, setPermissionOpen] = useState(false)
  const [runtimeOpen, setRuntimeOpen] = useState(false)
  const [claudeStatus, setClaudeStatus] = useState<ClaudeCodeStatus | null>(null)
  const [detectingClaude, setDetectingClaude] = useState(false)
  const [claudeError, setClaudeError] = useState<string | null>(null)
  const addRef = useRef<HTMLDivElement>(null)
  const permissionRef = useRef<HTMLDivElement>(null)
  const runtimeRef = useRef<HTMLDivElement>(null)
  const selectedPermission = getPermissionModeOption(permissionMode)
  const runtimeLabel = getRuntimeLabel(settings)
  const runtimeDetail = getRuntimeDetail(settings)
  const claudeStatusLabel = getClaudeCodeStatusLabel(claudeStatus)
  const claudeStatusDetail = getClaudeCodeStatusDetail(claudeStatus)

  useEffect(() => {
    const refs = [addRef, permissionRef, runtimeRef]
    const closeAll = (event: MouseEvent): void => {
      const target = event.target as Node
      if (refs.some((ref) => ref.current?.contains(target))) return
      setAddOpen(false)
      setPermissionOpen(false)
      setRuntimeOpen(false)
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
              <div className={`agent-runtime-status ${claudeStatus?.installed ? 'ready' : 'warning'}`}>
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
