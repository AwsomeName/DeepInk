import type { IpcMainInvokeEvent } from 'electron'
import type { CadConvertRequest } from '../../shared/ipc/cad'
import type { CadConversionService } from './cad-conversion-service'
import { registerTrustedIpcHandler, type TrustedRendererGuard } from '../ipc/trusted-renderer-guard'
import { cadConvertRequestSchema, cadPathSchema } from '../ipc/workbench-ipc-schema'

export function registerCadIpc(
  cadConversionService: CadConversionService,
  trustedRendererGuard: TrustedRendererGuard,
): void {
  const handle = <Args extends unknown[], Result>(
    channel: string,
    handler: (event: IpcMainInvokeEvent, ...args: Args) => Result,
  ): void => registerTrustedIpcHandler(channel, trustedRendererGuard, handler)

  handle('cad:getBackendStatus', () => cadConversionService.getBackendStatus())
  handle('cad:getModelSupport', (_event, inputPath: string) =>
    cadConversionService.getModelSupport(cadPathSchema.parse(inputPath)),
  )
  handle('cad:inspectModel', (_event, inputPath: string) =>
    cadConversionService.inspectModel(cadPathSchema.parse(inputPath)),
  )
  handle('cad:getCacheStatus', () => cadConversionService.getCacheStatus())
  handle('cad:clearCache', () => cadConversionService.clearCache())
  handle('cad:convertModel', (_event, request: CadConvertRequest) =>
    cadConversionService.convertModel(cadConvertRequestSchema.parse(request)),
  )
}
