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

export interface FsReadResult {
  content: string
  encoding: 'utf-8' | 'base64'
}

export interface FsApiContract {
  getHomePath: () => Promise<string>
  readDir: (dirPath: string) => Promise<FsDirEntry[]>
  readFile: (filePath: string) => Promise<FsReadResult>
  writeFile: (filePath: string, content: string) => Promise<void>
  stat: (filePath: string) => Promise<FsFileStat>
  mkdir: (dirPath: string) => Promise<void>
  rename: (oldPath: string, newPath: string) => Promise<void>
  delete: (filePath: string) => Promise<void>
  openPath: (path: string) => Promise<void>
}
