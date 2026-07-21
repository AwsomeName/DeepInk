import type { IpcMainInvokeEvent } from 'electron'
import type { HardwareService } from './hardware-service'
import { registerTrustedIpcHandler, type TrustedRendererGuard } from '../ipc/trusted-renderer-guard'
import {
  hardwarePackageEntrySchema,
  hardwarePackagePathSchema,
  hardwareWorkspacePathSchema,
} from '../ipc/workbench-ipc-schema'

export function registerHardwareIpc(
  hardwareService: HardwareService,
  trustedRendererGuard: TrustedRendererGuard,
): void {
  const handle = <Args extends unknown[], Result>(
    channel: string,
    handler: (event: IpcMainInvokeEvent, ...args: Args) => Result,
  ): void => registerTrustedIpcHandler(channel, trustedRendererGuard, handler)

  handle('hardware:scanWorkspace', (_event, workspacePath: string) =>
    hardwareService.scanWorkspace(hardwareWorkspacePathSchema.parse(workspacePath)),
  )

  handle('hardware:inspectProductionPackage', (_event, workspacePath: string) =>
    hardwareService.inspectProductionPackage(hardwareWorkspacePathSchema.parse(workspacePath)),
  )

  handle('hardware:prepareFpcShapeContext', (_event, workspacePath: string) =>
    hardwareService.prepareFpcShapeContext(hardwareWorkspacePathSchema.parse(workspacePath)),
  )

  handle(
    'hardware:readGerberLayerPreview',
    (_event, workspacePath: string, packagePath: string, entry: string) =>
      hardwareService.readGerberLayerPreview(
        hardwareWorkspacePathSchema.parse(workspacePath),
        hardwarePackagePathSchema.parse(packagePath),
        hardwarePackageEntrySchema.parse(entry),
      ),
  )

  handle(
    'hardware:readGerberLayerGeometry',
    (_event, workspacePath: string, packagePath: string, entry: string) =>
      hardwareService.readGerberLayerGeometry(
        hardwareWorkspacePathSchema.parse(workspacePath),
        hardwarePackagePathSchema.parse(packagePath),
        hardwarePackageEntrySchema.parse(entry),
      ),
  )

  handle('hardware:writeProductionReportMarkdown', (_event, workspacePath: string) =>
    hardwareService.writeProductionReportMarkdown(hardwareWorkspacePathSchema.parse(workspacePath)),
  )
}
