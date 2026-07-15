import { create } from 'zustand'
import type {
  CreateDataSourceInput,
  DataCollection,
  DataSourceConfig,
  DataSourceOperationError,
  SaveDataQueryInput,
  SavedDataQuery,
} from '@shared/ipc/data-source'

interface DataSourceState {
  sources: DataSourceConfig[]
  collectionsBySourceId: Record<string, DataCollection[]>
  savedQueriesBySourceId: Record<string, SavedDataQuery[]>
  selectedSourceId: string | null
  loading: boolean
  error: DataSourceOperationError | null

  loadSources: () => Promise<void>
  createSource: (input: CreateDataSourceInput) => Promise<DataSourceConfig | null>
  selectSource: (sourceId: string) => Promise<void>
  loadSavedQueries: (sourceId?: string) => Promise<void>
  saveQuery: (input: SaveDataQueryInput) => Promise<SavedDataQuery | null>
  testConnection: (sourceId: string) => Promise<boolean>
  clearError: () => void
}

function setError(error: DataSourceOperationError | null): Partial<DataSourceState> {
  return { error }
}

export const useDataSourceStore = create<DataSourceState>((set, get) => ({
  sources: [],
  collectionsBySourceId: {},
  savedQueriesBySourceId: {},
  selectedSourceId: null,
  loading: false,
  error: null,

  loadSources: async () => {
    set({ loading: true, error: null })
    const result = await window.deepink.dataSource.listSources()
    if (result.success) {
      set({
        sources: result.data,
        selectedSourceId: get().selectedSourceId ?? result.data[0]?.id ?? null,
        loading: false,
      })
    } else {
      set({ ...setError(result.error), loading: false })
    }
  },

  createSource: async (input) => {
    set({ loading: true, error: null })
    const result = await window.deepink.dataSource.createSource(input)
    if (!result.success) {
      set({ ...setError(result.error), loading: false })
      return null
    }
    const sources = [...get().sources.filter((source) => source.id !== result.data.id), result.data]
    set({ sources, selectedSourceId: result.data.id, loading: false })
    await get().selectSource(result.data.id)
    return result.data
  },

  selectSource: async (sourceId) => {
    set({ selectedSourceId: sourceId, loading: true, error: null })
    const [collectionsResult, savedQueriesResult] = await Promise.all([
      window.deepink.dataSource.listCollections(sourceId),
      window.deepink.dataSource.listSavedQueries(sourceId),
    ])
    if (collectionsResult.success === false) {
      set({ ...setError(collectionsResult.error), loading: false })
      return
    }
    if (savedQueriesResult.success === false) {
      set({ ...setError(savedQueriesResult.error), loading: false })
      return
    }
    set((state) => ({
      collectionsBySourceId: { ...state.collectionsBySourceId, [sourceId]: collectionsResult.data },
      savedQueriesBySourceId: {
        ...state.savedQueriesBySourceId,
        [sourceId]: savedQueriesResult.data,
      },
      loading: false,
    }))
  },

  loadSavedQueries: async (sourceId) => {
    const result = await window.deepink.dataSource.listSavedQueries(sourceId)
    if (!result.success) {
      set(setError(result.error))
      return
    }
    if (sourceId) {
      set((state) => ({
        savedQueriesBySourceId: { ...state.savedQueriesBySourceId, [sourceId]: result.data },
      }))
      return
    }
    const grouped: Record<string, SavedDataQuery[]> = {}
    for (const query of result.data) {
      grouped[query.sourceId] = [...(grouped[query.sourceId] ?? []), query]
    }
    set({ savedQueriesBySourceId: grouped })
  },

  saveQuery: async (input) => {
    set({ error: null })
    const result = await window.deepink.dataSource.saveQuery(input)
    if (!result.success) {
      set(setError(result.error))
      return null
    }
    set((state) => {
      const existing = state.savedQueriesBySourceId[result.data.sourceId] ?? []
      const next = [...existing.filter((query) => query.id !== result.data.id), result.data].sort(
        (a, b) => a.name.localeCompare(b.name),
      )
      return {
        savedQueriesBySourceId: {
          ...state.savedQueriesBySourceId,
          [result.data.sourceId]: next,
        },
      }
    })
    return result.data
  },

  testConnection: async (sourceId) => {
    set({ loading: true, error: null })
    const result = await window.deepink.dataSource.testConnection(sourceId)
    set({ loading: false })
    if (!result.success) {
      set(setError(result.error))
      return false
    }
    return true
  },

  clearError: () => set({ error: null }),
}))
