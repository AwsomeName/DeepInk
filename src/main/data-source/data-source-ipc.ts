import { ipcMain } from 'electron'
import { z } from 'zod'
import { DataSourceError, isDataSourceError } from './errors'
import type { DataSourceService } from './data-source-service'
import type { DataSourceOperationResult } from '../../shared/ipc/data-source'

const secretSchema = z.object({
  authType: z.enum(['apiKey', 'basic', 'bearer', 'none']),
  username: z.string().optional(),
  password: z.string().optional(),
  apiKey: z.string().optional(),
  token: z.string().optional(),
})

const fieldMappingSchema = z
  .object({
    title: z.array(z.string()).optional(),
    content: z.array(z.string()).optional(),
    sourceUrl: z.array(z.string()).optional(),
    author: z.array(z.string()).optional(),
    publishedAt: z.array(z.string()).optional(),
    collectedAt: z.array(z.string()).optional(),
    updatedAt: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
  })
  .optional()

const createSourceSchema = z.object({
  type: z.literal('elasticsearch'),
  scope: z.enum(['workspace', 'global']).optional(),
  name: z.string().min(1),
  endpoint: z.string().min(1),
  defaultCollection: z.string().optional(),
  timeoutMs: z.number().optional(),
  maxRows: z.number().optional(),
  fieldMapping: fieldMappingSchema,
  secret: secretSchema.optional(),
})

const updateSourceSchema = z.object({
  name: z.string().min(1).optional(),
  endpoint: z.string().min(1).optional(),
  defaultCollection: z.string().optional(),
  timeoutMs: z.number().optional(),
  maxRows: z.number().optional(),
  fieldMapping: fieldMappingSchema,
  secret: secretSchema.optional(),
})

const runQuerySchema = z.object({
  sourceId: z.string().min(1),
  collection: z.string().optional(),
  query: z.unknown(),
  maxRows: z.number().optional(),
  includeRaw: z.boolean().optional(),
  caller: z.string().optional(),
})

const getRecordSchema = z.object({
  sourceId: z.string().min(1),
  collection: z.string().min(1),
  id: z.string().min(1),
  includeRaw: z.boolean().optional(),
  caller: z.string().optional(),
})

const saveQuerySchema = z.object({
  id: z.string().optional(),
  sourceId: z.string().min(1),
  name: z.string().min(1),
  collection: z.string().min(1),
  query: z.unknown(),
  fieldMapping: fieldMappingSchema,
  maxRows: z.number().optional(),
})

function ok<T>(data: T): DataSourceOperationResult<T> {
  return { success: true, data }
}

function fail<T>(error: unknown): DataSourceOperationResult<T> {
  if (isDataSourceError(error)) {
    return { success: false, error: { code: error.code, message: error.message } }
  }
  if (error instanceof z.ZodError) {
    return {
      success: false,
      error: {
        code: 'DATA_SOURCE_QUERY_INVALID',
        message: error.issues.map((issue) => issue.message).join('; '),
      },
    }
  }
  if (error instanceof Error) {
    return {
      success: false,
      error: { code: 'DATA_SOURCE_INTERNAL_ERROR', message: error.message },
    }
  }
  return {
    success: false,
    error: { code: 'DATA_SOURCE_INTERNAL_ERROR', message: '未知数据源错误' },
  }
}

async function handle<T>(fn: () => Promise<T>): Promise<DataSourceOperationResult<T>> {
  try {
    return ok(await fn())
  } catch (error) {
    return fail(error)
  }
}

export function registerDataSourceIpc(dataSourceService: DataSourceService): void {
  ipcMain.handle('data-source:list', () => handle(() => dataSourceService.listSources()))

  ipcMain.handle('data-source:create', (_event, input: unknown) =>
    handle(() => dataSourceService.createSource(createSourceSchema.parse(input))),
  )

  ipcMain.handle('data-source:update', (_event, id: unknown, patch: unknown) =>
    handle(() => {
      if (typeof id !== 'string' || !id) {
        throw new DataSourceError('DATA_SOURCE_QUERY_INVALID', '缺少数据源 id')
      }
      return dataSourceService.updateSource(id, updateSourceSchema.parse(patch))
    }),
  )

  ipcMain.handle('data-source:delete', (_event, id: unknown) =>
    handle(async () => {
      if (typeof id !== 'string' || !id) {
        throw new DataSourceError('DATA_SOURCE_QUERY_INVALID', '缺少数据源 id')
      }
      await dataSourceService.deleteSource(id)
      return { deleted: true as const }
    }),
  )

  ipcMain.handle('data-source:test', (_event, id: unknown) =>
    handle(() => {
      if (typeof id !== 'string' || !id) {
        throw new DataSourceError('DATA_SOURCE_QUERY_INVALID', '缺少数据源 id')
      }
      return dataSourceService.testConnection(id)
    }),
  )

  ipcMain.handle('data-source:list-collections', (_event, id: unknown) =>
    handle(() => {
      if (typeof id !== 'string' || !id) {
        throw new DataSourceError('DATA_SOURCE_QUERY_INVALID', '缺少数据源 id')
      }
      return dataSourceService.listCollections(id)
    }),
  )

  ipcMain.handle('data-source:query', (_event, input: unknown) =>
    handle(() => dataSourceService.runQuery(runQuerySchema.parse(input))),
  )

  ipcMain.handle('data-source:get-record', (_event, input: unknown) =>
    handle(() => dataSourceService.getRecord(getRecordSchema.parse(input))),
  )

  ipcMain.handle('data-source:list-saved-queries', (_event, sourceId: unknown) =>
    handle(() => {
      if (sourceId !== undefined && typeof sourceId !== 'string') {
        throw new DataSourceError('DATA_SOURCE_QUERY_INVALID', 'sourceId 参数无效')
      }
      return dataSourceService.listSavedQueries(sourceId)
    }),
  )

  ipcMain.handle('data-source:save-query', (_event, input: unknown) =>
    handle(() => dataSourceService.saveQuery(saveQuerySchema.parse(input))),
  )
}
