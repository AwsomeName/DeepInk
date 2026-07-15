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

export interface DataSourceAdapter {
  readonly type: DataSourceConfig['type']
  test(config: DataSourceConfig, secret: DataSourceSecret | null): Promise<ConnectionTestResult>
  listCollections(config: DataSourceConfig, secret: DataSourceSecret | null): Promise<DataCollection[]>
  query(
    input: RunDataQueryInput,
    config: DataSourceConfig,
    secret: DataSourceSecret | null,
  ): Promise<DataQuerySnapshot>
  getRecord(
    input: GetRecordInput,
    config: DataSourceConfig,
    secret: DataSourceSecret | null,
  ): Promise<NormalizedRecord>
}
