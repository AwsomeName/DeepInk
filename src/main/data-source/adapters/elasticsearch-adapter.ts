import { Buffer } from 'node:buffer'
import { DataSourceError } from '../errors'
import { normalizeRecord } from '../normalization'
import type {
  ConnectionTestResult,
  DataCollection,
  DataQuerySnapshot,
  DataSourceConfig,
  DataSourceSecret,
  GetRecordInput,
  NormalizedRecord,
  RunDataQueryInput,
} from '../types'
import type { DataSourceAdapter } from './adapter'

type FetchLike = typeof fetch

interface ElasticsearchIndexRow {
  index?: string
  health?: string
  'docs.count'?: string
}

interface ElasticsearchSearchHit {
  _id?: string
  _index?: string
  _score?: number
  _source?: unknown
}

interface ElasticsearchSearchResponse {
  hits?: {
    total?: number | { value?: number }
    hits?: ElasticsearchSearchHit[]
  }
}

const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_MAX_ROWS = 100
const MAX_ROWS_LIMIT = 500
const RESPONSE_BYTE_LIMIT = 2 * 1024 * 1024
const FORBIDDEN_COLLECTION_PATTERNS = [
  '_bulk',
  '_delete_by_query',
  '_update_by_query',
  '_reindex',
  '_tasks',
  '_cluster/settings',
]

function clampRows(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value) || !value) return Math.min(fallback, MAX_ROWS_LIMIT)
  return Math.max(1, Math.min(Math.floor(value), MAX_ROWS_LIMIT))
}

function normalizeEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim().replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new DataSourceError(
      'DATA_SOURCE_QUERY_INVALID',
      '数据源 endpoint 必须以 http:// 或 https:// 开头',
    )
  }
  return trimmed
}

function assertSafeCollection(collection: string): void {
  const trimmed = collection.trim()
  if (!trimmed) {
    throw new DataSourceError('DATA_SOURCE_COLLECTION_NOT_FOUND', '缺少 index / collection')
  }
  if (
    trimmed.includes('/') ||
    trimmed.includes('\\') ||
    trimmed.includes('..') ||
    trimmed.includes('?') ||
    trimmed.includes('#')
  ) {
    throw new DataSourceError('DATA_SOURCE_QUERY_REJECTED', 'collection 不能包含路径或 URL 片段')
  }
  const lower = trimmed.toLowerCase()
  if (FORBIDDEN_COLLECTION_PATTERNS.some((pattern) => lower.includes(pattern))) {
    throw new DataSourceError('DATA_SOURCE_QUERY_REJECTED', '拒绝访问高风险 Elasticsearch API')
  }
}

function authHeaders(secret: DataSourceSecret | null): Record<string, string> {
  if (!secret || secret.authType === 'none') return {}
  if (secret.authType === 'apiKey' && secret.apiKey) {
    return { Authorization: `ApiKey ${secret.apiKey}` }
  }
  if (secret.authType === 'bearer' && secret.token) {
    return { Authorization: `Bearer ${secret.token}` }
  }
  if (secret.authType === 'basic' && secret.username && secret.password) {
    const encoded = Buffer.from(`${secret.username}:${secret.password}`).toString('base64')
    return { Authorization: `Basic ${encoded}` }
  }
  throw new DataSourceError('DATA_SOURCE_SECRET_MISSING', '数据源凭证不完整')
}

function mapFetchError(error: unknown): DataSourceError {
  if (error instanceof DataSourceError) return error
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new DataSourceError('DATA_SOURCE_TIMEOUT', '数据源请求超时', error)
  }
  const code =
    (error as { cause?: { code?: string }; code?: string } | null)?.cause?.code ??
    (error as { code?: string } | null)?.code
  if (typeof code === 'string' && (code.includes('CERT') || code.includes('TLS'))) {
    return new DataSourceError('DATA_SOURCE_TLS_ERROR', 'TLS 证书错误', error)
  }
  return new DataSourceError('DATA_SOURCE_NETWORK_ERROR', '无法连接数据源', error)
}

function totalFromResponse(response: ElasticsearchSearchResponse): number {
  const total = response.hits?.total
  if (typeof total === 'number') return total
  if (total && typeof total === 'object' && typeof total.value === 'number') return total.value
  return 0
}

function ensureObjectQuery(query: unknown): Record<string, unknown> {
  if (!query || typeof query !== 'object' || Array.isArray(query)) {
    throw new DataSourceError('DATA_SOURCE_QUERY_INVALID', 'Elasticsearch 查询必须是对象')
  }
  return { ...(query as Record<string, unknown>) }
}

export class ElasticsearchAdapter implements DataSourceAdapter {
  readonly type = 'elasticsearch' as const

  constructor(private readonly fetchImpl: FetchLike = fetch) {}

  async test(
    config: DataSourceConfig,
    secret: DataSourceSecret | null,
  ): Promise<ConnectionTestResult> {
    const json = await this.requestJson<Record<string, unknown>>(config, secret, '/')
    const version =
      json.version && typeof json.version === 'object'
        ? (json.version as Record<string, unknown>).number
        : undefined
    return {
      ok: true,
      sourceId: config.id,
      clusterName: typeof json.cluster_name === 'string' ? json.cluster_name : undefined,
      version: typeof version === 'string' ? version : undefined,
    }
  }

  async listCollections(
    config: DataSourceConfig,
    secret: DataSourceSecret | null,
  ): Promise<DataCollection[]> {
    const rows = await this.requestJson<ElasticsearchIndexRow[]>(
      config,
      secret,
      '/_cat/indices?format=json&h=index,health,docs.count',
    )
    if (!Array.isArray(rows)) return []
    return rows
      .filter((row) => typeof row.index === 'string' && row.index)
      .map((row) => ({
        sourceId: config.id,
        name: row.index!,
        kind: 'index' as const,
        docsCount: row['docs.count'] ? Number(row['docs.count']) : undefined,
        health:
          row.health === 'green' || row.health === 'yellow' || row.health === 'red'
            ? row.health
            : 'unknown',
      }))
  }

  async query(
    input: RunDataQueryInput,
    config: DataSourceConfig,
    secret: DataSourceSecret | null,
  ): Promise<DataQuerySnapshot> {
    const collection = input.collection ?? config.defaultCollection
    assertSafeCollection(collection ?? '')
    const maxRows = clampRows(input.maxRows, config.maxRows || DEFAULT_MAX_ROWS)
    const query = ensureObjectQuery(input.query)
    const body = { ...query, size: maxRows }
    const response = await this.requestJson<ElasticsearchSearchResponse>(
      config,
      secret,
      `/${encodeURIComponent(collection!)}/_search`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    )
    const hits = Array.isArray(response.hits?.hits) ? response.hits!.hits! : []
    const records = hits.map((hit) =>
      normalizeRecord({
        id: hit._id ?? '',
        sourceId: config.id,
        collection: hit._index ?? collection!,
        score: hit._score,
        source: hit._source ?? {},
        fieldMapping: config.fieldMapping,
        includeRaw: input.includeRaw,
      }),
    )
    const total = totalFromResponse(response)
    return {
      id: `data-query-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sourceId: config.id,
      collection: collection!,
      query,
      executedAt: new Date().toISOString(),
      total,
      returned: records.length,
      truncated: total > records.length,
      records,
    }
  }

  async getRecord(
    input: GetRecordInput,
    config: DataSourceConfig,
    secret: DataSourceSecret | null,
  ): Promise<NormalizedRecord> {
    assertSafeCollection(input.collection)
    const response = await this.requestJson<ElasticsearchSearchHit>(
      config,
      secret,
      `/${encodeURIComponent(input.collection)}/_doc/${encodeURIComponent(input.id)}`,
    )
    return normalizeRecord({
      id: response._id ?? input.id,
      sourceId: config.id,
      collection: response._index ?? input.collection,
      score: response._score,
      source: response._source ?? {},
      fieldMapping: config.fieldMapping,
      includeRaw: input.includeRaw,
    })
  }

  private async requestJson<T>(
    config: DataSourceConfig,
    secret: DataSourceSecret | null,
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const endpoint = normalizeEndpoint(config.endpoint)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs || DEFAULT_TIMEOUT_MS)
    try {
      const response = await this.fetchImpl(`${endpoint}${path}`, {
        ...init,
        method: init.method ?? 'GET',
        headers: {
          Accept: 'application/json',
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...authHeaders(secret),
        },
        signal: controller.signal,
      })
      if (response.status === 401 || response.status === 403) {
        throw new DataSourceError('DATA_SOURCE_AUTH_FAILED', '数据源认证失败')
      }
      if (response.status === 404) {
        throw new DataSourceError('DATA_SOURCE_COLLECTION_NOT_FOUND', '数据源 index 不存在')
      }
      if (!response.ok) {
        throw new DataSourceError(
          'DATA_SOURCE_INTERNAL_ERROR',
          `数据源请求失败: HTTP ${response.status}`,
        )
      }
      const text = await response.text()
      if (Buffer.byteLength(text, 'utf-8') > RESPONSE_BYTE_LIMIT) {
        throw new DataSourceError('DATA_SOURCE_RESULT_TOO_LARGE', '数据源响应过大')
      }
      return JSON.parse(text) as T
    } catch (error) {
      throw mapFetchError(error)
    } finally {
      clearTimeout(timeout)
    }
  }
}
