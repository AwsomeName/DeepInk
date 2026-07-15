import type {
  RemoteAgentMessageRequest,
  RemoteAgentMessageResult,
  RemoteDiagnosticReport,
  RemoteFileReadRequest,
  RemoteFileReadResult,
  RemoteFileCreateRequest,
  RemoteFileDeleteRequest,
  RemoteFileMutationResult,
  RemoteFileRenameRequest,
  RemoteFileTreeRequest,
  RemoteFileTreeResult,
  RemoteFileWriteRequest,
  RemoteStatus,
} from '../remote-protocol'
import type { RemoteWorkspaceRef } from '../workspace-ref'

export interface RemoteApiContract {
  getStatus: (ref: RemoteWorkspaceRef) => Promise<RemoteStatus>
  getDiagnostics: (ref: RemoteWorkspaceRef) => Promise<RemoteDiagnosticReport>
  listFileTree: (request: RemoteFileTreeRequest) => Promise<RemoteFileTreeResult>
  readFile: (request: RemoteFileReadRequest) => Promise<RemoteFileReadResult>
  writeFile: (request: RemoteFileWriteRequest) => Promise<RemoteFileMutationResult>
  createFile: (request: RemoteFileCreateRequest) => Promise<RemoteFileMutationResult>
  renameFile: (request: RemoteFileRenameRequest) => Promise<RemoteFileMutationResult>
  deleteFile: (request: RemoteFileDeleteRequest) => Promise<RemoteFileMutationResult>
  sendAgentMessage: (request: RemoteAgentMessageRequest) => Promise<RemoteAgentMessageResult>
}
