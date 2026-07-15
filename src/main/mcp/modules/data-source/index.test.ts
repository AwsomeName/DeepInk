import { describe, expect, it, vi } from 'vitest'
import { DataSourceToolModule } from './index'
import type { DataSourceService } from '../../../data-source/data-source-service'

function createServiceMock(): DataSourceService {
  return {
    listSources: vi.fn(async () => [
      {
        id: 'source-1',
        type: 'elasticsearch',
        scope: 'workspace',
        name: 'Articles',
        endpoint: 'https://es.example.com',
        defaultCollection: 'articles-*',
        authRef: 'data-source:source-1',
        readOnly: true,
        timeoutMs: 10000,
        maxRows: 100,
        createdAt: '2026-07-15T00:00:00.000Z',
        updatedAt: '2026-07-15T00:00:00.000Z',
      },
    ]),
    listCollections: vi.fn(async () => [
      {
        sourceId: 'source-1',
        name: 'articles-*',
        kind: 'index',
        docsCount: 10,
        health: 'green',
      },
    ]),
    listSavedQueries: vi.fn(async () => [
      {
        id: 'saved-1',
        sourceId: 'source-1',
        name: 'Recent Articles',
        collection: 'articles-*',
        query: { query: { match_all: {} } },
        createdAt: '2026-07-15T00:00:00.000Z',
        updatedAt: '2026-07-15T00:00:00.000Z',
      },
    ]),
    runQuery: vi.fn(async (input) => ({
      id: 'snapshot-1',
      sourceId: input.sourceId,
      collection: input.collection ?? 'articles-*',
      query: input.query,
      executedAt: '2026-07-15T00:00:00.000Z',
      total: 1,
      returned: 1,
      truncated: false,
      records: [
        {
          id: 'doc-1',
          sourceId: input.sourceId,
          collection: input.collection ?? 'articles-*',
          title: 'Hello',
          raw: { secret: 'raw-value' },
        },
      ],
    })),
    getRecord: vi.fn(async () => ({
      id: 'doc-1',
      sourceId: 'source-1',
      collection: 'articles-*',
      title: 'Hello',
      raw: { secret: 'raw-value' },
    })),
  } as unknown as DataSourceService
}

describe('DataSourceToolModule', () => {
  it('defines only read-only tools with schemas', () => {
    const module = new DataSourceToolModule(createServiceMock())

    expect(module.tools.map((tool) => tool.name)).toEqual([
      'data_source_list_sources',
      'data_source_list_collections',
      'data_source_list_saved_queries',
      'data_source_search',
      'data_source_get_record',
      'data_source_run_saved_query',
    ])
    for (const tool of module.tools) {
      expect(tool.inputSchema.type).toBe('object')
      expect(tool.annotations).toEqual({ readOnlyHint: true, destructiveHint: false })
    }
  })

  it('lists sources without leaking authRef or credentials', async () => {
    const module = new DataSourceToolModule(createServiceMock())

    const sources = await module.execute('data_source_list_sources', {})

    expect(sources).toEqual([
      {
        id: 'source-1',
        type: 'elasticsearch',
        scope: 'workspace',
        name: 'Articles',
        endpointHost: 'es.example.com',
        defaultCollection: 'articles-*',
        readOnly: true,
        maxRows: 100,
        updatedAt: '2026-07-15T00:00:00.000Z',
      },
    ])
    expect(JSON.stringify(sources)).not.toContain('authRef')
  })

  it('searches with a bounded DSL and strips raw records', async () => {
    const service = createServiceMock()
    const module = new DataSourceToolModule(service)

    const snapshot = await module.execute('data_source_search', {
      sourceId: 'source-1',
      collection: 'articles-*',
      text: 'CCLink Studio',
      limit: 999,
    })

    expect(service.runQuery).toHaveBeenCalledWith({
      sourceId: 'source-1',
      collection: 'articles-*',
      query: {
        query: {
          multi_match: {
            query: 'CCLink Studio',
            fields: ['title^3', 'content', 'author', 'tags'],
          },
        },
      },
      maxRows: 100,
      includeRaw: false,
      caller: 'mcp:data_source_search',
    })
    expect(JSON.stringify(snapshot)).not.toContain('raw-value')
  })

  it('runs saved queries with the default tool limit and strips raw records', async () => {
    const service = createServiceMock()
    const module = new DataSourceToolModule(service)

    const snapshot = await module.execute('data_source_run_saved_query', {
      savedQueryId: 'saved-1',
    })

    expect(service.runQuery).toHaveBeenCalledWith({
      sourceId: 'source-1',
      collection: 'articles-*',
      query: { query: { match_all: {} } },
      maxRows: 20,
      includeRaw: false,
      caller: 'mcp:data_source_run_saved_query',
    })
    expect(JSON.stringify(snapshot)).not.toContain('raw-value')
  })
})
