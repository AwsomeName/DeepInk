export type {
  ConnectionTestResult,
  CreateDataSourceInput,
  DataCollection,
  DataQuerySnapshot,
  DataSourceConfig,
  DataSourceErrorCode,
  DataSourceSecret,
  FieldMapping,
  GetRecordInput,
  NormalizedRecord,
  RunDataQueryInput,
  SaveDataQueryInput,
  SavedDataQuery,
  UpdateDataSourceInput,
} from '../data-source'

import type {
  ConnectionTestResult,
  CreateDataSourceInput,
  DataCollection,
  DataQuerySnapshot,
  DataSourceConfig,
  DataSourceErrorCode,
  GetRecordInput,
  NormalizedRecord,
  RunDataQueryInput,
  SaveDataQueryInput,
  SavedDataQuery,
  UpdateDataSourceInput,
} from '../data-source'

export interface DataSourceOperationError {
  code: DataSourceErrorCode
  message: string
}

export type DataSourceOperationResult<T> =
  | { success: true; data: T }
  | { success: false; error: DataSourceOperationError }

export interface DataSourceApiContract {
  listSources(): Promise<DataSourceOperationResult<DataSourceConfig[]>>
  createSource(input: CreateDataSourceInput): Promise<DataSourceOperationResult<DataSourceConfig>>
  updateSource(
    id: string,
    patch: UpdateDataSourceInput,
  ): Promise<DataSourceOperationResult<DataSourceConfig>>
  deleteSource(id: string): Promise<DataSourceOperationResult<{ deleted: true }>>
  testConnection(id: string): Promise<DataSourceOperationResult<ConnectionTestResult>>
  listCollections(id: string): Promise<DataSourceOperationResult<DataCollection[]>>
  runQuery(input: RunDataQueryInput): Promise<DataSourceOperationResult<DataQuerySnapshot>>
  getRecord(input: GetRecordInput): Promise<DataSourceOperationResult<NormalizedRecord>>
  listSavedQueries(sourceId?: string): Promise<DataSourceOperationResult<SavedDataQuery[]>>
  saveQuery(input: SaveDataQueryInput): Promise<DataSourceOperationResult<SavedDataQuery>>
}
