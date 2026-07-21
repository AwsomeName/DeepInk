import { defineNoArgsIpc } from './contract'

export interface WindowOperationResult {
  success: boolean
}

export interface ToggleFullscreenResult extends WindowOperationResult {
  fullscreen?: boolean
}

export interface WindowApiContract {
  toggleFullscreen: () => Promise<ToggleFullscreenResult>
  toggleDevtools: () => Promise<WindowOperationResult>
  reload: () => Promise<WindowOperationResult>
  focusRenderer: () => Promise<WindowOperationResult>
}

export const windowIpc = {
  toggleFullscreen: defineNoArgsIpc<ToggleFullscreenResult>('window:toggleFullscreen'),
  toggleDevtools: defineNoArgsIpc<WindowOperationResult>('window:toggleDevtools'),
  reload: defineNoArgsIpc<WindowOperationResult>('window:reload'),
  focusRenderer: defineNoArgsIpc<WindowOperationResult>('window:focusRenderer'),
} as const
