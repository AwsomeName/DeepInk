/**
 * SyncHistoryStore — 同步历史持久化
 *
 * 记录每次同步的时间、方向、触发方式和结果摘要。
 * 持久化到 sync-history.json，保留最新 100 条。
 */

import { readFile, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import type { SyncHistoryEntry, SyncResult } from './types'

const MAX_HISTORY_ENTRIES = 100

export class SyncHistoryStore {
  private readonly filePath: string
  private entries: SyncHistoryEntry[] = []

  constructor() {
    this.filePath = join(app.getPath('userData'), 'sync-history.json')
  }

  /** 从磁盘加载历史 */
  async load(): Promise<void> {
    if (!existsSync(this.filePath)) return

    try {
      const raw = await readFile(this.filePath, 'utf-8')
      this.entries = JSON.parse(raw)
    } catch (err) {
      console.error('[SyncHistory] 加载历史失败:', err)
      this.entries = []
    }
  }

  /** 保存历史到磁盘 */
  async save(): Promise<void> {
    try {
      await writeFile(this.filePath, JSON.stringify(this.entries, null, 2), 'utf-8')
    } catch (err) {
      console.error('[SyncHistory] 保存历史失败:', err)
    }
  }

  /** 添加一条同步记录 */
  addEntry(
    direction: SyncHistoryEntry['direction'],
    trigger: SyncHistoryEntry['trigger'],
    result: SyncResult,
  ): SyncHistoryEntry {
    const entry: SyncHistoryEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      direction,
      trigger,
      summary: {
        uploaded: result.uploaded.length,
        downloaded: result.downloaded.length,
        conflicts: result.conflicts.length,
        deleted: result.deleted.length,
        errors: result.errors.length,
      },
      success: result.errors.length === 0,
      errorMessage: result.errors.length > 0
        ? result.errors.map((e) => e.error).join('; ')
        : undefined,
    }

    // 最新的在最前面
    this.entries.unshift(entry)

    // 保留上限
    if (this.entries.length > MAX_HISTORY_ENTRIES) {
      this.entries = this.entries.slice(0, MAX_HISTORY_ENTRIES)
    }

    return entry
  }

  /** 获取历史记录（默认全部） */
  getEntries(limit?: number): SyncHistoryEntry[] {
    return limit ? this.entries.slice(0, limit) : [...this.entries]
  }

  /** 清空历史 */
  clear(): void {
    this.entries = []
  }
}
