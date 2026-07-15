import { describe, expect, it, vi } from 'vitest'
import { ElasticsearchAdapter } from './adapters/elasticsearch-adapter'
import type { DataSourceConfig, DataSourceSecret } from './types'

const config: DataSourceConfig = {
  id: 'source-1',
  type: 'elasticsearch',
  scope: 'workspace',
  name: 'Articles',
  endpoint: 'https://es.example.com',
  defaultCollection: 'articles-*',
  readOnly: true,
  timeoutMs: 10000,
  maxRows: 50,
  createdAt: '2026-07-15T00:00:00.000Z',
  updatedAt: '2026-07-15T00:00:00.000Z',
}

const secret: DataSourceSecret = {
  sourceId: 'source-1',
  authType: 'apiKey',
  apiKey: 'secret-key',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('ElasticsearchAdapter', () => {
  it('lists indices and normalizes collection metadata', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse([{ index: 'articles-2026', health: 'green', 'docs.count': '12' }]),
    )
    const adapter = new ElasticsearchAdapter(fetchImpl as typeof fetch)

    const collections = await adapter.listCollections(config, secret)

    expect(collections).toEqual([
      {
        sourceId: 'source-1',
        name: 'articles-2026',
        kind: 'index',
        docsCount: 12,
        health: 'green',
      },
    ])
    const call = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect((call[1].headers as Record<string, string>).Authorization).toBe('ApiKey secret-key')
  })

  it('runs a read-only search and normalizes hits', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        hits: {
          total: { value: 2 },
          hits: [
            {
              _id: 'doc-1',
              _index: 'articles-2026',
              _score: 1.5,
              _source: {
                title: 'Hello',
                content: 'World',
                url: 'https://example.com/a',
                collectedAt: '2026-07-15',
              },
            },
          ],
        },
      }),
    )
    const adapter = new ElasticsearchAdapter(fetchImpl as typeof fetch)

    const snapshot = await adapter.query(
      {
        sourceId: 'source-1',
        query: { query: { match_all: {} }, size: 999 },
      },
      config,
      secret,
    )

    const call = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(call[0]).toBe('https://es.example.com/articles-*/_search')
    expect(JSON.parse(call[1].body as string).size).toBe(50)
    expect(snapshot).toMatchObject({
      sourceId: 'source-1',
      collection: 'articles-*',
      total: 2,
      returned: 1,
      truncated: true,
    })
    expect(snapshot.records[0]).toMatchObject({
      id: 'doc-1',
      title: 'Hello',
      content: 'World',
      sourceUrl: 'https://example.com/a',
    })
    expect(snapshot.records[0].raw).toBeUndefined()
  })

  it('rejects unsafe collection path fragments', async () => {
    const adapter = new ElasticsearchAdapter(vi.fn() as unknown as typeof fetch)

    await expect(
      adapter.query(
        {
          sourceId: 'source-1',
          collection: '_bulk',
          query: { query: { match_all: {} } },
        },
        config,
        secret,
      ),
    ).rejects.toMatchObject({ code: 'DATA_SOURCE_QUERY_REJECTED' })
  })

  it('maps auth and missing index errors to stable codes', async () => {
    const authAdapter = new ElasticsearchAdapter(vi.fn(async () => jsonResponse({}, 401)) as unknown as typeof fetch)
    await expect(authAdapter.test(config, secret)).rejects.toMatchObject({
      code: 'DATA_SOURCE_AUTH_FAILED',
    })

    const missingAdapter = new ElasticsearchAdapter(vi.fn(async () => jsonResponse({}, 404)) as unknown as typeof fetch)
    await expect(
      missingAdapter.getRecord({ sourceId: 'source-1', collection: 'missing', id: '1' }, config, secret),
    ).rejects.toMatchObject({ code: 'DATA_SOURCE_COLLECTION_NOT_FOUND' })
  })
})
