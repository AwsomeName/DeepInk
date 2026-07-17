import { app } from 'electron'
import { dirname, join } from 'node:path'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'

export interface GitBackupProjectBinding {
  projectId: string
  remoteUrl: string
  repositoryLabel: string
  remoteName: string
  lastBackupAt: string | null
}

interface GitBackupProjectStoreState {
  version: 1
  projects: Record<string, GitBackupProjectBinding>
}

function isBinding(value: unknown, projectId: string): value is GitBackupProjectBinding {
  if (!value || typeof value !== 'object') return false
  const binding = value as Partial<GitBackupProjectBinding>
  return (
    binding.projectId === projectId &&
    typeof binding.remoteUrl === 'string' &&
    typeof binding.repositoryLabel === 'string' &&
    typeof binding.remoteName === 'string' &&
    (binding.lastBackupAt === null || typeof binding.lastBackupAt === 'string')
  )
}

export class GitBackupProjectStore {
  private readonly filePath: string
  private state: GitBackupProjectStoreState = { version: 1, projects: {} }
  private loaded = false

  constructor(filename = 'git-backup/projects.json') {
    this.filePath = join(app.getPath('userData'), filename)
  }

  async load(): Promise<void> {
    try {
      const parsed = JSON.parse(
        await readFile(this.filePath, 'utf-8'),
      ) as Partial<GitBackupProjectStoreState>
      const projects: Record<string, GitBackupProjectBinding> = {}
      if (parsed.version === 1 && parsed.projects && typeof parsed.projects === 'object') {
        for (const [projectId, binding] of Object.entries(parsed.projects)) {
          if (isBinding(binding, projectId)) projects[projectId] = { ...binding }
        }
      }
      this.state = { version: 1, projects }
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('[GitBackupProjectStore] 项目绑定读取失败，使用空状态:', error)
      }
      this.state = { version: 1, projects: {} }
    }
    this.loaded = true
  }

  async get(projectId: string): Promise<GitBackupProjectBinding | null> {
    await this.ensureLoaded()
    const binding = this.state.projects[projectId]
    return binding ? { ...binding } : null
  }

  async set(binding: GitBackupProjectBinding): Promise<void> {
    await this.ensureLoaded()
    this.state.projects[binding.projectId] = { ...binding }
    await this.save()
  }

  async remove(projectId: string): Promise<void> {
    await this.ensureLoaded()
    delete this.state.projects[projectId]
    await this.save()
  }

  private async ensureLoaded(): Promise<void> {
    if (!this.loaded) await this.load()
  }

  private async save(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true })
    const tempPath = `${this.filePath}.${process.pid}.tmp`
    await writeFile(tempPath, JSON.stringify(this.state, null, 2), {
      encoding: 'utf-8',
      mode: 0o600,
    })
    await rename(tempPath, this.filePath)
  }
}
