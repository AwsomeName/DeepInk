export interface IpcInvokeContract<Args extends unknown[], Result> {
  readonly channel: string
  parseArgs(args: unknown[]): Args
  readonly result?: Result
}

export function defineIpcInvoke<Args extends unknown[], Result>(
  channel: string,
  parseArgs: (args: unknown[]) => Args,
): IpcInvokeContract<Args, Result> {
  return { channel, parseArgs }
}

export function defineNoArgsIpc<Result>(channel: string): IpcInvokeContract<[], Result> {
  return defineIpcInvoke(channel, (args) => {
    if (args.length !== 0) throw new Error(`IPC ${channel} 不接受参数`)
    return []
  })
}
