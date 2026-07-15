import type { DataSourceErrorCode } from '../../shared/data-source'

export class DataSourceError extends Error {
  readonly code: DataSourceErrorCode
  readonly cause?: unknown

  constructor(code: DataSourceErrorCode, message: string, cause?: unknown) {
    super(message)
    this.name = 'DataSourceError'
    this.code = code
    this.cause = cause
  }
}

export function isDataSourceError(error: unknown): error is DataSourceError {
  return error instanceof DataSourceError
}

export function toDataSourceError(error: unknown): DataSourceError {
  if (isDataSourceError(error)) return error
  if (error instanceof Error) {
    return new DataSourceError('DATA_SOURCE_INTERNAL_ERROR', error.message, error)
  }
  return new DataSourceError('DATA_SOURCE_INTERNAL_ERROR', '未知数据源错误', error)
}
