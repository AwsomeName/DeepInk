import type { ChatccServer, ChatccSession, ChatccWorkspace } from '@shared/chatcc'
import type { WorkspaceRef } from '../../../shared/workspace-ref'
import { remoteWorkspaceRef } from '../../../shared/workspace-ref'

export interface RemoteWorkspaceItem {
  server: ChatccServer
  workspace: ChatccWorkspace
  ref: Extract<WorkspaceRef, { kind: 'remote' }>
}

export function getCclinkRemoteWorkspaceItems(servers: ChatccServer[]): RemoteWorkspaceItem[] {
  return servers.flatMap((server) =>
    server.workspaces.map((workspace) => ({
      server,
      workspace,
      ref: remoteWorkspaceRef({
        endpointId: server.id,
        endpointName: server.name,
        workspaceId: workspace.id,
        path: workspace.path,
        label: workspace.name,
      }),
    })),
  )
}

export function getCclinkRemoteWorkspaceSessions(
  workspaceRef: Extract<WorkspaceRef, { kind: 'remote' }>,
  sessions: ChatccSession[],
  archivedSessionIds: Record<string, number> = {},
): ChatccSession[] {
  return sessions
    .filter(
      (session) =>
        session.serverId === workspaceRef.endpointId &&
        session.workspacePath === workspaceRef.path &&
        !archivedSessionIds[session.id],
    )
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function getArchivedCclinkRemoteWorkspaceSessions(
  workspaceRef: Extract<WorkspaceRef, { kind: 'remote' }>,
  sessions: ChatccSession[],
  archivedSessionIds: Record<string, number>,
): ChatccSession[] {
  return sessions
    .filter(
      (session) =>
        session.serverId === workspaceRef.endpointId &&
        session.workspacePath === workspaceRef.path &&
        archivedSessionIds[session.id],
    )
    .sort((a, b) => (archivedSessionIds[b.id] ?? 0) - (archivedSessionIds[a.id] ?? 0))
}
