import type { IpcMainInvokeEvent } from 'electron'
import type { CadConvertRequest } from '../../shared/ipc/cad'
import type { CadConversionService } from './cad-conversion-service'
import { registerTrustedIpcHandler, type TrustedRendererGuard } from '../ipc/trusted-renderer-guard'
import { cadConvertRequestSchema, cadPathSchema } from '../ipc/workbench-ipc-schema'

export function registerCadIpc(
  cadConversionService: CadConversionService | (() => CadConversionService | null),
  trustedRendererGuard: TrustedRendererGuard,
): void {
  const handle = <Args extends unknown[], Result>(
    channel: string,
    handler: (event: IpcMainInvokeEvent, ...args: Args) => Result,
  ): void => registerTrustedIpcHandler(channel, trustedRendererGuard, handler)

  const getService = (): CadConversionService => {
    const service =
      typeof cadConversionService === 'function' ? cadConversionService() : cadConversionService
    if (!service) throw new Error('CAD 转换能力当前不可用，请查看 Agent 能力状态')
    return service
  }

  handle('cad:getBackendStatus', () => getService().getBackendStatus())
  handle('cad:getModelSupport', (_event, inputPath: string) =>
    getService().getModelSupport(cadPathSchema.parse(inputPath)),
  )
  handle('cad:inspectModel', (_event, inputPath: string) =>
    getService().inspectModel(cadPathSchema.parse(inputPath)),
  )
  handle('cad:getCacheStatus', () => getService().getCacheStatus())
  handle('cad:clearCache', () => getService().clearCache())
  handle('cad:convertModel', (_event, request: CadConvertRequest) =>
    getService().convertModel(cadConvertRequestSchema.parse(request)),
  )
}
