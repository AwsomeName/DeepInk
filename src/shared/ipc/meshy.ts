export type MeshyFormat = 'glb' | 'obj' | 'fbx' | 'stl' | 'usdz' | '3mf'

export type MeshyTaskStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'EXPIRED'
  | string

export interface MeshyTask {
  id: string
  type?: string
  status: MeshyTaskStatus
  progress?: number
  prompt?: string
  model_urls?: Partial<Record<MeshyFormat | 'mtl', string>>
  thumbnail_url?: string
  alpha_thumbnail_url?: string
  texture_urls?: Array<Record<string, string>>
  task_error?: {
    message?: string
  }
  consumed_credits?: number
  created_at?: number
  started_at?: number
  finished_at?: number
  expires_at?: number
  [key: string]: unknown
}

export interface MeshyCreatePreviewOptions {
  prompt: string
  modelType?: 'standard' | 'lowpoly'
  aiModel?: 'meshy-5' | 'meshy-6' | 'latest'
  shouldRemesh?: boolean
  topology?: 'quad' | 'triangle'
  targetPolycount?: number
  decimationMode?: 1 | 2 | 3 | 4
  poseMode?: 'a-pose' | 't-pose' | ''
  targetFormats?: MeshyFormat[]
  moderation?: boolean
  alphaThumbnail?: boolean
  autoSize?: boolean
  originAt?: 'bottom' | 'center'
}

export interface MeshyCreateRefineOptions {
  previewTaskId: string
  texturePrompt?: string
  enablePbr?: boolean
  hdTexture?: boolean
  aiModel?: 'meshy-5' | 'meshy-6' | 'latest'
  moderation?: boolean
  removeLighting?: boolean
  targetFormats?: MeshyFormat[]
  alphaThumbnail?: boolean
  autoSize?: boolean
  originAt?: 'bottom' | 'center'
}

export interface MeshySaveAssetOptions {
  taskId: string
  format?: MeshyFormat
  outputDir?: string
  fileName?: string
  includeMetadata?: boolean
  includeThumbnail?: boolean
}

export interface MeshySavedAsset {
  taskId: string
  format: MeshyFormat
  filePath: string
  metadataPath?: string
  thumbnailPath?: string
  bytes: number
  task: MeshyTask
}

export interface MeshyGenerateAndSaveOptions extends Omit<
  MeshyCreatePreviewOptions,
  'targetFormats'
> {
  format?: MeshyFormat
  refine?: boolean
  texturePrompt?: string
  enablePbr?: boolean
  hdTexture?: boolean
  outputDir?: string
  fileName?: string
  pollIntervalMs?: number
  timeoutMs?: number
}

export interface MeshyGenerateAndSaveResult {
  previewTask: MeshyTask
  refineTask?: MeshyTask
  savedAsset: MeshySavedAsset
}

export interface MeshyApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

export interface MeshyApiContract {
  createPreview(options: MeshyCreatePreviewOptions): Promise<MeshyApiResponse<{ taskId: string }>>
  createRefine(options: MeshyCreateRefineOptions): Promise<MeshyApiResponse<{ taskId: string }>>
  getTask(taskId: string): Promise<MeshyApiResponse<MeshyTask>>
  saveAsset(options: MeshySaveAssetOptions): Promise<MeshyApiResponse<MeshySavedAsset>>
  generateAndSave(
    options: MeshyGenerateAndSaveOptions,
  ): Promise<MeshyApiResponse<MeshyGenerateAndSaveResult>>
}
