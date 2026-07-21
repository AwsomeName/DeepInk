import { ipcRenderer } from 'electron'
import type { IpcInvokeContract } from '../shared/ipc/contract'

export function invokeIpcContract<Args extends unknown[], Result>(
  contract: IpcInvokeContract<Args, Result>,
  ...args: Args
): Promise<Result> {
  return ipcRenderer.invoke(contract.channel, ...args)
}
