import { app } from 'electron'
import { dirname, join } from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import type { DataSourceAuditEvent } from './types'

export type DataSourceAuditEventInput = Omit<DataSourceAuditEvent, 'id' | 'timestamp'> & {
  id?: string
  timestamp?: string
}

function newAuditId(): string {
  return `data-source-audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export class DataSourceAuditLog {
  private readonly filePath: string

  constructor(filename = 'data-source/audit-log.jsonl') {
    this.filePath = join(app.getPath('userData'), filename)
  }

  async record(input: DataSourceAuditEventInput): Promise<DataSourceAuditEvent> {
    const event: DataSourceAuditEvent = {
      ...input,
      id: input.id ?? newAuditId(),
      timestamp: input.timestamp ?? new Date().toISOString(),
    }
    await mkdir(dirname(this.filePath), { recursive: true })
    const previous = await this.readExisting()
    await writeFile(this.filePath, `${previous}${JSON.stringify(event)}\n`, 'utf-8')
    return event
  }

  private async readExisting(): Promise<string> {
    try {
      return await readFile(this.filePath, 'utf-8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('[DataSourceAuditLog] 读取失败:', (error as Error).message)
      }
      return ''
    }
  }
}
