import type { DataSourceConfig } from './types'
import { DataSourceError } from './errors'
import type { DataSourceAdapter } from './adapters/adapter'

export class DataSourceAdapterRegistry {
  private readonly adapters = new Map<DataSourceConfig['type'], DataSourceAdapter>()

  register(adapter: DataSourceAdapter): void {
    this.adapters.set(adapter.type, adapter)
  }

  get(type: DataSourceConfig['type']): DataSourceAdapter {
    const adapter = this.adapters.get(type)
    if (!adapter) {
      throw new DataSourceError('DATA_SOURCE_ADAPTER_UNSUPPORTED', `不支持的数据源类型: ${type}`)
    }
    return adapter
  }
}
