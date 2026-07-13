import type { TabType } from '../types'

const MODEL_EXTENSIONS = new Set(['.fbx', '.glb', '.gltf'])

export function isModelFileExtension(extension?: string): boolean {
  return MODEL_EXTENSIONS.has((extension ?? '').toLowerCase())
}

export function getTabTypeForFile(extension?: string): TabType {
  return isModelFileExtension(extension) ? 'model' : 'editor'
}

export function getModelFileIcon(extension?: string): string {
  switch ((extension ?? '').toLowerCase()) {
    case '.fbx':
      return '🧊'
    case '.glb':
    case '.gltf':
      return '⬢'
    default:
      return '📦'
  }
}
