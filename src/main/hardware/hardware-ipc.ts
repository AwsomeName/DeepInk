import type { IpcMainInvokeEvent } from 'electron'
import type { HardwareService } from './hardware-service'
import { registerTrustedIpcHandler, type TrustedRendererGuard } from '../ipc/trusted-renderer-guard'
import {
  hardwarePackageEntrySchema,
  hardwarePackagePathSchema,
  hardwareWorkspacePathSchema,
} from '../ipc/workbench-ipc-schema'

export function registerHardwareIpc(
  hardwareService: HardwareService | (() => HardwareService | null),
  trustedRendererGuard: TrustedRendererGuard,
): void {
  const handle = <Args extends unknown[], Result>(
    channel: string,
    handler: (event: IpcMainInvokeEvent, ...args: Args) => Result,
  ): void => registerTrustedIpcHandler(channel, trustedRendererGuard, handler)

  const getService = (): HardwareService => {
    const service = typeof hardwareService === 'function' ? hardwareService() : hardwareService
    if (!service) throw new Error('硬件工作区能力当前不可用，请查看 Agent 能力状态')
    return service
  }

  handle('hardware:scanWorkspace', (_event, workspacePath: string) =>
    getService().scanWorkspace(hardwareWorkspacePathSchema.parse(workspacePath)),
  )

  handle('hardware:inspectProductionPackage', (_event, workspacePath: string) =>
    getService().inspectProductionPackage(hardwareWorkspacePathSchema.parse(workspacePath)),
  )

  handle('hardware:prepareFpcShapeContext', (_event, workspacePath: string) =>
    getService().prepareFpcShapeContext(hardwareWorkspacePathSchema.parse(workspacePath)),
  )

  handle(
    'hardware:readGerberLayerPreview',
    (_event, workspacePath: string, packagePath: string, entry: string) =>
      getService().readGerberLayerPreview(
        hardwareWorkspacePathSchema.parse(workspacePath),
        hardwarePackagePathSchema.parse(packagePath),
        hardwarePackageEntrySchema.parse(entry),
      ),
  )

  handle(
    'hardware:readGerberLayerGeometry',
    (_event, workspacePath: string, packagePath: string, entry: string) =>
      getService().readGerberLayerGeometry(
        hardwareWorkspacePathSchema.parse(workspacePath),
        hardwarePackagePathSchema.parse(packagePath),
        hardwarePackageEntrySchema.parse(entry),
      ),
  )

  handle('hardware:writeProductionReportMarkdown', (_event, workspacePath: string) =>
    getService().writeProductionReportMarkdown(hardwareWorkspacePathSchema.parse(workspacePath)),
  )
}
