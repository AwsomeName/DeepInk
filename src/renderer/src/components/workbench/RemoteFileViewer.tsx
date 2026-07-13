import { useEffect, useState } from 'react'
import type { ChatccFileContent } from '@shared/chatcc'
import type { CclinkRemoteError } from '@shared/ipc/cclink'
import { RemoteErrorNotice } from '../common/RemoteErrorNotice'

interface RemoteFileViewerProps {
  remoteFile: {
    serverId: string
    workspaceId: string
    path: string
  }
}

function fileName(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path
}

export function RemoteFileViewer({ remoteFile }: RemoteFileViewerProps): React.ReactElement {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [remoteError, setRemoteError] = useState<CclinkRemoteError | null>(null)
  const [file, setFile] = useState<ChatccFileContent | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setRemoteError(null)
    setFile(null)

    window.deepink.cclink
      .readFile(remoteFile)
      .then((result) => {
        if (cancelled) return
        if (!result.success || !result.file) {
          setError(result.error || '远程文件读取失败')
          setRemoteError(result.remoteError ?? null)
          return
        }
        setFile(result.file)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
        setRemoteError(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [remoteFile])

  return (
    <div className="remote-file-viewer">
      <div className="remote-file-viewer-header">
        <div>
          <div className="remote-file-viewer-title">{fileName(remoteFile.path)}</div>
          <div className="remote-file-viewer-path">{remoteFile.path}</div>
        </div>
        <span className="remote-file-viewer-badge">远程只读</span>
      </div>

      {loading && <div className="remote-file-viewer-state">正在读取远程文件...</div>}
      {error && (
        <div className="remote-file-viewer-error">
          <RemoteErrorNotice message={error} area="file-read" remoteError={remoteError} />
        </div>
      )}
      {file && (
        <pre className="remote-file-viewer-content">
          <code>{file.content}</code>
        </pre>
      )}
    </div>
  )
}
