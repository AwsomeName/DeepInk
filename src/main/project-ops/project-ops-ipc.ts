import type { IpcMainInvokeEvent } from 'electron'
import type {
  ProjectOpsCreateDraftInput,
  ProjectOpsPublicationRecordInput,
} from '../../shared/ipc/project-ops'
import type { ProjectOpsService } from './project-ops-service'
import { registerTrustedIpcHandler, type TrustedRendererGuard } from '../ipc/trusted-renderer-guard'
import {
  projectOpsDraftSchema,
  projectOpsPublicationSchema,
  projectOpsWorkspacePathSchema,
} from '../ipc/workbench-ipc-schema'

export function registerProjectOpsIpc(
  projectOpsService: ProjectOpsService,
  trustedRendererGuard: TrustedRendererGuard,
): void {
  const handle = <Args extends unknown[], Result>(
    channel: string,
    handler: (event: IpcMainInvokeEvent, ...args: Args) => Result,
  ): void => registerTrustedIpcHandler(channel, trustedRendererGuard, handler)

  handle('projectOps:getAccounts', (_event, workspacePath: string) =>
    projectOpsService.getAccounts(projectOpsWorkspacePathSchema.parse(workspacePath)),
  )

  handle('projectOps:createAccountsTemplate', (_event, workspacePath: string) =>
    projectOpsService.createAccountsTemplate(projectOpsWorkspacePathSchema.parse(workspacePath)),
  )

  handle(
    'projectOps:createCopyDraft',
    (_event, workspacePath: string, input?: ProjectOpsCreateDraftInput) =>
      projectOpsService.createCopyDraft(
        projectOpsWorkspacePathSchema.parse(workspacePath),
        projectOpsDraftSchema.parse(input),
      ),
  )

  handle(
    'projectOps:appendPublicationRecord',
    (_event, workspacePath: string, input: ProjectOpsPublicationRecordInput) =>
      projectOpsService.appendPublicationRecord(
        projectOpsWorkspacePathSchema.parse(workspacePath),
        projectOpsPublicationSchema.parse(input),
      ),
  )
}
