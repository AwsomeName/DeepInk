export interface FsDirEntry {
  name: string
  path: string
  type: 'directory' | 'file'
  extension?: string
  size: number
  modifiedAt: number
}

export interface FsFileStat {
  name: string
  path: string
  type: 'directory' | 'file'
  extension?: string
  size: number
  modifiedAt: number
  createdAt: number
}

export interface FsWatchDirEvent {
  watchId: string
  event: 'add' | 'change' | 'unlink'
  filePath: string
}

export interface FsReadResult {
  content: string
  encoding: 'utf-8' | 'base64'
}

export interface FsTextDocumentSnapshot {
  path: string
  content: string
  size: number
  modifiedAt: number
  hash: string
}

export type FsSaveTextDocumentResult =
  | {
      status: 'saved'
      snapshot: FsTextDocumentSnapshot
    }
  | {
      status: 'conflict'
      current: FsTextDocumentSnapshot | null
    }

export interface FsDocumentAssetResult {
  path: string
  relativePath: string
  fileName: string
}

export type FsRenderResult =
  | {
      kind: 'image'
      content: string
      encoding: 'base64'
      mimeType: string
      fileName: string
      path: string
    }
  | {
      kind: 'pdf'
      content: string
      encoding: 'base64'
      mimeType: 'application/pdf'
      fileName: string
      path: string
    }
  | {
      kind: 'media'
      mediaKind: 'video' | 'audio'
      playable: boolean
      content?: string
      encoding?: 'base64'
      mimeType: string | null
      fileName: string
      path: string
      reason?: string
    }
  | {
      kind: 'office-preview'
      officeKind: 'word' | 'presentation'
      blocks: FsOfficePreviewBlock[]
      truncated: boolean
      warning?: string
      fileName: string
      path: string
    }
  | {
      kind: 'unsupported'
      reason: string
      fileName: string
      path: string
    }

export type FsOfficePreviewBlock =
  | {
      type: 'heading' | 'paragraph' | 'list-item'
      text: string
      level?: number
    }
  | {
      type: 'table'
      rows: string[][]
    }
  | {
      type: 'slide'
      index: number
      title: string
      lines: string[]
    }

export interface FsExtractZipResult {
  targetDir: string
  extracted: number
}

export interface FsApiContract {
  getHomePath: () => Promise<string>
  readDir: (dirPath: string) => Promise<FsDirEntry[]>
  readFile: (filePath: string) => Promise<FsReadResult>
  readTextDocument: (filePath: string) => Promise<FsTextDocumentSnapshot>
  renderFile: (filePath: string) => Promise<FsRenderResult>
  writeFile: (filePath: string, content: string) => Promise<void>
  saveTextDocument: (input: {
    filePath: string
    content: string
    expectedHash?: string
    force?: boolean
  }) => Promise<FsSaveTextDocumentResult>
  importDocumentAsset: (documentPath: string, sourcePath: string) => Promise<FsDocumentAssetResult>
  saveDocumentAsset: (input: {
    documentPath: string
    fileName: string
    mimeType: string
    content: string
    encoding: 'base64'
  }) => Promise<FsDocumentAssetResult>
  stat: (filePath: string) => Promise<FsFileStat>
  isDirectory: (filePath: string) => Promise<boolean>
  mkdir: (dirPath: string) => Promise<void>
  rename: (oldPath: string, newPath: string) => Promise<void>
  delete: (filePath: string) => Promise<void>
  extractZip: (filePath: string) => Promise<FsExtractZipResult>
  openPath: (path: string) => Promise<void>
  watchDir: (dirPath: string, onChange: (event: FsWatchDirEvent) => void) => Promise<() => void>
}
