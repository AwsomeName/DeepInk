import type { CclinkRemoteError } from '@shared/ipc/cclink'
import { explainRemoteError, type RemoteErrorArea } from '../../utils/remote-error'

interface RemoteErrorNoticeProps {
  message: string
  area: RemoteErrorArea
  remoteError?: CclinkRemoteError | null
  compact?: boolean
}

export function RemoteErrorNotice({
  message,
  area,
  remoteError,
  compact = false,
}: RemoteErrorNoticeProps): React.ReactElement {
  const explanation = explainRemoteError(message, area, remoteError)

  return (
    <div className={`remote-error-notice ${compact ? 'compact' : ''}`}>
      <div className="remote-error-notice-title">
        <span>{explanation.title}</span>
        <span className={`remote-error-notice-layer ${explanation.layer}`}>
          {explanation.layerLabel}
        </span>
      </div>
      <div className="remote-error-notice-message">{explanation.message}</div>
      {explanation.code && <div className="remote-error-notice-code">{explanation.code}</div>}
      {!compact && <div className="remote-error-notice-action">{explanation.actionHint}</div>}
    </div>
  )
}
