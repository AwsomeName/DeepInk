import { app } from 'electron'
import { dirname, join } from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import type { DataSourceConfig } from './types'

interface DataSourceConfigStoreState {
  version: 1
  sources: DataSourceConfig[]
  updatedAt: string
}

const EMPTY_STATE: DataSourceConfigStoreState = {
  version: 1,
  sources: [],
  updatedAt: '',
}

function isDataSourceConfig(value: unknown): value is DataSourceConfig {
  if (!value || typeof value !== 'object') return false
  const config = value as Partial<DataSourceConfig>
  return (
    typeof config.id === 'string' &&
    config.type === 'elasticsearch' &&
    typeof config.name === 'string' &&
    typeof config.endpoint === 'string' &&
    config.readOnly === true
  )
}

export class DataSourceConfigStore {
  private readonly filePath: string
  private state: DataSourceConfigStoreState = { ...EMPTY_STATE, sources: [] }
  private loaded = false

  constructor(filename = 'data-source/connections.json') {
    this.filePath = join(app.getPath('userData'), filename)
  }

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<DataSourceConfigStoreState>
      this.state = {
        version: 1,
        sources: Array.isArray(parsed.sources) ? parsed.sources.filter(isDataSourceConfig) : [],
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('[DataSourceConfigStore] 加载失败:', (error as Error).message)
      }
      this.state = { ...EMPTY_STATE, sources: [] }
    }
    this.loaded = true
  }

  async list(): Promise<DataSourceConfig[]> {
    await this.ensureLoaded()
    return this.state.sources.map((source) => ({ ...source }))
  }

  async get(id: string): Promise<DataSourceConfig | null> {
    await this.ensureLoaded()
    const source = this.state.sources.find((item) => item.id === id)
    return source ? { ...source } : null
  }

  async upsert(config: DataSourceConfig): Promise<DataSourceConfig> {
    await this.ensureLoaded()
    const next = { ...config }
    const index = this.state.sources.findIndex((item) => item.id === next.id)
    if (index >= 0) {
      this.state.sources[index] = next
    } else {
      this.state.sources.push(next)
    }
    await this.save()
    return { ...next }
  }

  async remove(id: string): Promise<void> {
    await this.ensureLoaded()
    this.state.sources = this.state.sources.filter((item) => item.id !== id)
    await this.save()
  }

  private async ensureLoaded(): Promise<void> {
    if (!this.loaded) await this.load()
  }

  private async save(): Promise<void> {
    this.state.updatedAt = new Date().toISOString()
    await mkdir(dirname(this.filePath), { recursive: true })
    await writeFile(this.filePath, JSON.stringify(this.state, null, 2), 'utf-8')
  }
}
