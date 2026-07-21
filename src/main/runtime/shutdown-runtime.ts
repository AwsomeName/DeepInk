import type { CclinkStudioRuntimeState } from './app-runtime'

export async function shutdownRuntime(runtime: CclinkStudioRuntimeState): Promise<void> {
  await runtime.serviceRegistry?.stopAll()
}
