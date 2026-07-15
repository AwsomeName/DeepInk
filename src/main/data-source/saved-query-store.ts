import { app } from 'electron'
import { dirname, join } from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import type { SavedDataQuery } from './types'

interface SavedQueryStoreState {
  version: 1
  queries: SavedDataQuery[]
  updatedAt: string
}

const EMPTY_STATE: SavedQueryStoreState = {
  version: 1,
  queries: [],
  updatedAt: '',
}

function isSavedDataQuery(value: unknown): value is SavedDataQuery {
  if (!value || typeof value !== 'object') return false
  const query = value as Partial<SavedDataQuery>
  return (
    typeof query.id === 'string' &&
    typeof query.sourceId === 'string' &&
    typeof query.name === 'string' &&
    typeof query.collection === 'string' &&
    typeof query.createdAt === 'string' &&
    typeof query.updatedAt === 'string' &&
    'query' in query
  )
}

export class SavedQueryStore {
  private readonly filePath: string
  private state: SavedQueryStoreState = { ...EMPTY_STATE, queries: [] }
  private loaded = false

  constructor(filename = 'data-source/saved-queries.json') {
    this.filePath = join(app.getPath('userData'), filename)
  }

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<SavedQueryStoreState>
      this.state = {
        version: 1,
        queries: Array.isArray(parsed.queries) ? parsed.queries.filter(isSavedDataQuery) : [],
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('[SavedQueryStore] 加载失败:', (error as Error).message)
      }
      this.state = { ...EMPTY_STATE, queries: [] }
    }
    this.loaded = true
  }

  async list(sourceId?: string): Promise<SavedDataQuery[]> {
    await this.ensureLoaded()
    const queries = sourceId
      ? this.state.queries.filter((query) => query.sourceId === sourceId)
      : this.state.queries
    return queries.map((query) => ({ ...query }))
  }

  async upsert(query: SavedDataQuery): Promise<SavedDataQuery> {
    await this.ensureLoaded()
    const next = { ...query }
    const index = this.state.queries.findIndex((item) => item.id === next.id)
    if (index >= 0) {
      this.state.queries[index] = next
    } else {
      this.state.queries.push(next)
    }
    await this.save()
    return { ...next }
  }

  async removeBySource(sourceId: string): Promise<void> {
    await this.ensureLoaded()
    this.state.queries = this.state.queries.filter((query) => query.sourceId !== sourceId)
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
