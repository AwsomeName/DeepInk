import type { FieldMapping, NormalizedRecord } from './types'

const DEFAULT_FIELD_MAPPING: Required<FieldMapping> = {
  title: ['title', 'name', 'headline'],
  content: ['content', 'text', 'body', 'summary'],
  sourceUrl: ['sourceUrl', 'url', 'link'],
  author: ['author', 'creator'],
  publishedAt: ['publishedAt', 'publishTime', 'date'],
  collectedAt: ['collectedAt', 'crawlTime', 'createdAt'],
  updatedAt: ['updatedAt', 'modifiedAt'],
  tags: ['tags', 'keywords', 'labels'],
}

function getByPath(source: unknown, path: string): unknown {
  const parts = path.split('.').filter(Boolean)
  let current = source
  for (const part of parts) {
    if (!current || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

function firstString(source: unknown, paths: string[] | undefined): string | undefined {
  for (const path of paths ?? []) {
    const value = getByPath(source, path)
    if (typeof value === 'string' && value.trim()) return value
    if (typeof value === 'number') return String(value)
  }
  return undefined
}

function firstStringArray(source: unknown, paths: string[] | undefined): string[] | undefined {
  for (const path of paths ?? []) {
    const value = getByPath(source, path)
    if (Array.isArray(value)) {
      const strings = value
        .filter((item): item is string | number => typeof item === 'string' || typeof item === 'number')
        .map(String)
        .filter(Boolean)
      if (strings.length > 0) return strings
    }
    if (typeof value === 'string' && value.trim()) {
      return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    }
  }
  return undefined
}

export function normalizeRecord(input: {
  id: string
  sourceId: string
  collection: string
  score?: number
  source: unknown
  fieldMapping?: FieldMapping
  includeRaw?: boolean
}): NormalizedRecord {
  const mapping = {
    title: input.fieldMapping?.title ?? DEFAULT_FIELD_MAPPING.title,
    content: input.fieldMapping?.content ?? DEFAULT_FIELD_MAPPING.content,
    sourceUrl: input.fieldMapping?.sourceUrl ?? DEFAULT_FIELD_MAPPING.sourceUrl,
    author: input.fieldMapping?.author ?? DEFAULT_FIELD_MAPPING.author,
    publishedAt: input.fieldMapping?.publishedAt ?? DEFAULT_FIELD_MAPPING.publishedAt,
    collectedAt: input.fieldMapping?.collectedAt ?? DEFAULT_FIELD_MAPPING.collectedAt,
    updatedAt: input.fieldMapping?.updatedAt ?? DEFAULT_FIELD_MAPPING.updatedAt,
    tags: input.fieldMapping?.tags ?? DEFAULT_FIELD_MAPPING.tags,
  }

  return {
    id: input.id,
    sourceId: input.sourceId,
    collection: input.collection,
    title: firstString(input.source, mapping.title),
    content: firstString(input.source, mapping.content),
    sourceUrl: firstString(input.source, mapping.sourceUrl),
    author: firstString(input.source, mapping.author),
    publishedAt: firstString(input.source, mapping.publishedAt),
    collectedAt: firstString(input.source, mapping.collectedAt),
    updatedAt: firstString(input.source, mapping.updatedAt),
    tags: firstStringArray(input.source, mapping.tags),
    score: input.score,
    raw: input.includeRaw ? input.source : undefined,
  }
}
