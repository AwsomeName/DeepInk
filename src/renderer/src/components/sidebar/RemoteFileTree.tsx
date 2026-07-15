import { useEffect, useState } from 'react'
import type { ChatccTreeNode } from '@shared/chatcc'
import type { RemoteStatus } from '@shared/remote-protocol'
import type { RemoteError } from '@shared/remote-error'
import { remoteWorkspaceRef } from '@shared/workspace-ref'
import { IconChevronDown, IconChevronRight, IconFile, IconFolder } from '../common/Icons'
import { useTabStore } from '../../stores'
import { RemoteErrorNotice } from '../common/RemoteErrorNotice'

interface RemoteFileTreeProps {
  serverId: string
  workspaceId: string
  rootPath: string
}

interface RemoteNodeState {
  expanded: boolean
  loading: boolean
  children: ChatccTreeNode[] | null
  error: string | null
  remoteError: RemoteError | null
}

const MAX_INITIAL_DEPTH = 1

function nodeKey(path: string): string {
  return path
}

function fileName(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path
}

export function RemoteFileTree({
  serverId,
  workspaceId,
  rootPath,
}: RemoteFileTreeProps): React.ReactElement {
  const [root, setRoot] = useState<ChatccTreeNode | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [remoteError, setRemoteError] = useState<RemoteError | null>(null)
  const [status, setStatus] = useState<RemoteStatus | null>(null)
  const [nodeStates, setNodeStates] = useState<Record<string, RemoteNodeState>>({})

  function getWorkspaceRef() {
    return remoteWorkspaceRef({
      endpointId: serverId,
      workspaceId,
      path: rootPath,
    })
  }

  const workspaceRef = getWorkspaceRef()

  useEffect(() => {
    let cancelled = false
    window.deepink.remote
      .getStatus(workspaceRef)
      .then((nextStatus) => {
        if (!cancelled) setStatus(nextStatus)
      })
      .catch(() => {
        if (!cancelled) setStatus(null)
      })

    return () => {
      cancelled = true
    }
  }, [rootPath, serverId, workspaceId])

  useEffect(() => {
    const ref = remoteWorkspaceRef({
      endpointId: serverId,
      workspaceId,
      path: rootPath,
    })
    let cancelled = false
    setRoot(null)
    setLoading(true)
    setError(null)
    setRemoteError(null)
    setNodeStates({})

    window.deepink.remote
      .listFileTree({
        ref,
        path: rootPath,
        depth: MAX_INITIAL_DEPTH,
      })
      .then((result) => {
        if (cancelled) return
        if (!result.success || !result.tree) {
          setError(result.error || '远程文件树暂不可用')
          setRemoteError(result.remoteError ?? null)
          return
        }
        setRoot(result.tree)
        setNodeStates({
          [nodeKey(result.tree.path)]: {
            expanded: true,
            loading: false,
            children: result.tree.children ?? [],
            error: null,
            remoteError: null,
          },
        })
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
  }, [rootPath, serverId, workspaceId])

  const toggleDirectory = async (node: ChatccTreeNode): Promise<void> => {
    const key = nodeKey(node.path)
    const state = nodeStates[key]
    if (state?.expanded) {
      setNodeStates((current) => ({
        ...current,
        [key]: { ...state, expanded: false },
      }))
      return
    }

    if (state?.children) {
      setNodeStates((current) => ({
        ...current,
        [key]: { ...state, expanded: true },
      }))
      return
    }

    setNodeStates((current) => ({
      ...current,
      [key]: { expanded: true, loading: true, children: null, error: null, remoteError: null },
    }))

    const result = await window.deepink.remote.listFileTree({
      ref: getWorkspaceRef(),
      path: node.path,
      depth: MAX_INITIAL_DEPTH,
    })

    setNodeStates((current) => ({
      ...current,
      [key]: {
        expanded: true,
        loading: false,
        children: result.success ? (result.tree?.children ?? []) : [],
        error: result.success ? null : result.error || '目录加载失败',
        remoteError: result.success ? null : (result.remoteError ?? null),
      },
    }))
  }

  if (loading) return <div className="file-tree-loading">正在加载远程文件...</div>
  if (error) {
    return (
      <div className="file-tree-error">
        <RemoteErrorNotice message={error} area="file-tree" remoteError={remoteError} compact />
      </div>
    )
  }
  if (!root) return <div className="file-tree-empty-hint">远程文件树为空</div>

  return (
    <div className="remote-file-tree">
      {status && <RemoteCapabilitySummary status={status} />}
      {(nodeStates[nodeKey(root.path)]?.children ?? root.children ?? []).map((node) => (
        <RemoteFileNode
          key={node.path}
          node={node}
          depth={0}
          serverId={serverId}
          workspaceId={workspaceId}
          nodeStates={nodeStates}
          onToggleDirectory={toggleDirectory}
        />
      ))}
    </div>
  )
}

function RemoteCapabilitySummary({ status }: { status: RemoteStatus }): React.ReactElement {
  const fileMode = status.capabilities.file.write
    ? '文件可写'
    : status.capabilities.file.read
      ? '文件只读'
      : '文件不可用'
  const terminalMode = status.capabilities.shell.command ? 'Terminal 可用' : 'Terminal 不可用'
  const agentMode =
    status.capabilities.agent.codex || status.capabilities.agent.claudeCode
      ? 'Agent 可用'
      : 'Agent 未就绪'

  return (
    <div className="remote-file-tree-state" title={status.remoteError?.message}>
      {status.state === 'online' ? '在线' : status.state === 'connecting' ? '连接中' : '离线'}
      {' · '}
      {fileMode}
      {' · '}
      {terminalMode}
      {' · '}
      {agentMode}
    </div>
  )
}

function RemoteFileNode({
  node,
  depth,
  serverId,
  workspaceId,
  nodeStates,
  onToggleDirectory,
}: {
  node: ChatccTreeNode
  depth: number
  serverId: string
  workspaceId: string
  nodeStates: Record<string, RemoteNodeState>
  onToggleDirectory: (node: ChatccTreeNode) => Promise<void>
}): React.ReactElement {
  const openTab = useTabStore((s) => s.openTab)
  const state = nodeStates[nodeKey(node.path)]
  const expanded = state?.expanded ?? false
  const children = state?.children ?? node.children ?? []
  const isDirectory = node.type === 'directory'

  return (
    <div className="file-tree-node">
      <button
        className={`file-tree-item remote ${isDirectory ? 'directory' : 'file'} ${node.modifiedByAgent ? 'modified' : ''}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => {
          if (isDirectory) {
            void onToggleDirectory(node)
            return
          }
          openTab({
            type: 'remote-file',
            title: fileName(node.path),
            icon: '📄',
            remoteFile: { serverId, workspaceId, path: node.path },
          })
        }}
        title={node.path}
      >
        <span className="file-tree-arrow">
          {isDirectory &&
            (expanded ? <IconChevronDown size={10} /> : <IconChevronRight size={10} />)}
        </span>
        <span className="file-tree-icon">
          {isDirectory ? <IconFolder size={14} /> : <IconFile size={14} />}
        </span>
        <span className="file-tree-name">{node.name}</span>
      </button>
      {state?.loading && (
        <div
          className="remote-file-tree-state"
          style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
        >
          加载中...
        </div>
      )}
      {state?.error && (
        <div
          className="remote-file-tree-error"
          style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
        >
          <RemoteErrorNotice
            message={state.error}
            area="file-tree"
            remoteError={state.remoteError}
            compact
          />
        </div>
      )}
      {isDirectory && expanded && children.length > 0 && (
        <div className="file-tree-children">
          {children.map((child) => (
            <RemoteFileNode
              key={child.path}
              node={child}
              depth={depth + 1}
              serverId={serverId}
              workspaceId={workspaceId}
              nodeStates={nodeStates}
              onToggleDirectory={onToggleDirectory}
            />
          ))}
        </div>
      )}
    </div>
  )
}
