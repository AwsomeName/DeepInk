import { useState } from 'react'
import { useTerminalStore } from '../../stores/terminal-store'
import {
  formatTerminalExpiresIn,
  formatTerminalRuntime,
  TERMINAL_ACTOR_LABEL,
  TERMINAL_RISK_COLOR,
  TERMINAL_RISK_LABEL,
} from '../../utils/terminal-confirmation'
import { IconCheck, IconError, IconTool } from '../common/Icons'

export function TerminalConfirmationCards(): React.ReactElement | null {
  const pendingConfirmations = useTerminalStore((state) => state.pendingConfirmations)
  const removePendingConfirmation = useTerminalStore((state) => state.removePendingConfirmation)
  const [resolvingIds, setResolvingIds] = useState<Set<string>>(new Set())

  if (pendingConfirmations.length === 0) return null

  const resolveConfirmation = async (id: string, approved: boolean): Promise<void> => {
    setResolvingIds((current) => new Set(current).add(id))
    try {
      await window.cclinkStudio.terminal.resolveCommandConfirmation(id, approved)
    } finally {
      removePendingConfirmation(id)
      setResolvingIds((current) => {
        const next = new Set(current)
        next.delete(id)
        return next
      })
    }
  }

  return (
    <>
      {pendingConfirmations.map((request) => {
        const resolving = resolvingIds.has(request.id)
        return (
          <div key={request.id} className="tool-confirmation-card terminal-confirmation-card">
            <div className="confirmation-header">
              <IconTool size={14} />
              Terminal 命令确认
            </div>
            <div className="confirmation-body">
              <div className="confirmation-row">
                <span className="confirmation-label">命令:</span>
                <code className="confirmation-value terminal-command">{request.command}</code>
              </div>
              <div className="confirmation-row">
                <span className="confirmation-label">位置:</span>
                <span className="confirmation-value">{formatTerminalRuntime(request.runtime)}</span>
              </div>
              {request.cwd && (
                <div className="confirmation-row">
                  <span className="confirmation-label">目录:</span>
                  <span className="confirmation-value confirmation-params">{request.cwd}</span>
                </div>
              )}
              <div className="confirmation-row">
                <span className="confirmation-label">来源:</span>
                <span className="confirmation-value">{TERMINAL_ACTOR_LABEL[request.actor]}</span>
              </div>
              <div className="confirmation-row">
                <span className="confirmation-label">风险:</span>
                <span
                  className="confirmation-value"
                  style={{ color: TERMINAL_RISK_COLOR[request.risk] }}
                >
                  {TERMINAL_RISK_LABEL[request.risk]}
                </span>
              </div>
              <div className="confirmation-row">
                <span className="confirmation-label">原因:</span>
                <span className="confirmation-value">{request.reason}</span>
              </div>
              <div className="confirmation-row">
                <span className="confirmation-label">有效:</span>
                <span className="confirmation-value">{formatTerminalExpiresIn(request)}</span>
              </div>
            </div>
            <div className="confirmation-actions">
              <button
                className="confirm-approve-btn"
                disabled={resolving}
                onClick={() => {
                  void resolveConfirmation(request.id, true)
                }}
              >
                <IconCheck size={12} />
                允许一次
              </button>
              <button
                className="confirm-reject-btn"
                disabled={resolving}
                onClick={() => {
                  void resolveConfirmation(request.id, false)
                }}
              >
                <IconError size={12} />
                拒绝
              </button>
            </div>
          </div>
        )
      })}
    </>
  )
}
