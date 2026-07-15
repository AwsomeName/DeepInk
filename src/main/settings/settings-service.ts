/**
 * SettingsService — 应用设置持久化服务
 *
 * 将 AppSettings 保存到 {userData}/settings.json。
 * 参照 SyncService 的 JSON 文件读写模式。
 */

import { app } from 'electron'
import { join } from 'path'
import { readFile, writeFile } from 'fs/promises'
import { DEFAULT_SETTINGS, type AppSettings } from './types'

/** AppSettings 的合法 key 集合，用于过滤 IPC 传入的未知字段 */
const SETTINGS_KEYS = new Set<string>(Object.keys(DEFAULT_SETTINGS))

/** 每个 key 的合法值集合（用于校验 IPC 传入的数据；数值/字符串字段不在此列） */
const VALID_VALUES: Record<string, Set<string>> = {
  backendType: new Set<string>(['claude-code', 'http-api']),
  permissionMode: new Set<string>(['auto', 'categorized', 'strict']),
  defaultZoomMode: new Set<string>(['fit', 'manual']),
  defaultDeviceMode: new Set<string>(['desktop', 'mobile']),
  agentEngine: new Set<string>(['local-claude-code']),
  provider: new Set<string>(['anthropic', 'deepseek', 'glm', 'qwen', 'moonshot', 'siliconflow', 'openai', 'custom']),
  apiFormat: new Set<string>(['anthropic', 'openai']),
}

export class SettingsService {
  private storeFilePath: string
  private store: AppSettings

  constructor() {
    this.storeFilePath = join(app.getPath('userData'), 'settings.json')
    this.store = { ...DEFAULT_SETTINGS }
  }

  /**
   * 从磁盘加载设置
   *
   * 合并策略：以 DEFAULT_SETTINGS 为基底，用文件中读到的值覆盖。
   * 这样未来新增字段时，旧文件不会缺少新字段的值。
   */
  async loadState(): Promise<void> {
    try {
      const raw = await readFile(this.storeFilePath, 'utf-8')
      const parsed = JSON.parse(raw)
      this.store = { ...DEFAULT_SETTINGS }

      // 防御性校验：只取合法值覆盖默认值，丢弃文件中的非法枚举值
      for (const key of Object.keys(parsed) as Array<keyof AppSettings>) {
        const val = (parsed as unknown as Record<string, unknown>)[key]
        const validSet = VALID_VALUES[key]
        if (validSet && typeof val === 'string' && !validSet.has(val)) {
          console.warn(`[SettingsService] 加载配置时忽略无效值: ${key}=${val}`)
          continue
        }
        ;(this.store as unknown as Record<string, unknown>)[key] = val
      }

      console.log('[SettingsService] 设置已加载')
    } catch (err: unknown) {
      // 文件不存在或 JSON 损坏 → 使用默认值
      const isEnoent = err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT'
      if (!isEnoent) {
        console.warn('[SettingsService] 设置文件读取失败，使用默认值:', err)
      }
      this.store = { ...DEFAULT_SETTINGS }
    }
  }

  /** 保存当前设置到磁盘 */
  private async saveState(): Promise<void> {
    const json = JSON.stringify(this.store, null, 2)
    await writeFile(this.storeFilePath, json, 'utf-8')
  }

  /** 获取所有设置（浅拷贝） */
  getAll(): AppSettings {
    return { ...this.store }
  }

  /**
   * 更新部分设置并持久化
   *
   * @param partial - 要更新的字段
   * @returns 更新后的完整设置
   */
  async set(partial: Partial<AppSettings>): Promise<AppSettings> {
    // 只保留合法 key + 合法值，过滤掉 IPC 传入的无关字段和无效值
    const filtered: Partial<AppSettings> = {}
    for (const key of Object.keys(partial)) {
      if (!SETTINGS_KEYS.has(key)) continue
      const val = (partial as Record<string, unknown>)[key]
      // 对有枚举约束的字段做值校验；数值字段（如 maxBudgetUsd）跳过枚举检查
      const validSet = VALID_VALUES[key]
      if (validSet && typeof val === 'string' && !validSet.has(val)) {
        console.warn(`[SettingsService] 忽略无效值: ${key}=${val}`)
        continue
      }
      ;(filtered as Record<string, unknown>)[key] = val
    }
    this.store = { ...this.store, ...filtered }
    await this.saveState()
    return this.getAll()
  }

  /**
   * 恢复所有设置到默认值
   *
   * @returns 默认设置
   */
  async reset(): Promise<AppSettings> {
    this.store = { ...DEFAULT_SETTINGS }
    await this.saveState()
    return this.getAll()
  }

  /**
   * 重置单个设置到默认值
   *
   * @param key - 要重置的设置 key
   * @returns 更新后的完整设置
   */
  async resetKey(key: keyof AppSettings): Promise<AppSettings> {
    if (!SETTINGS_KEYS.has(key)) {
      throw new Error(`Unknown setting key: ${key}`)
    }
    this.store = { ...this.store, [key]: DEFAULT_SETTINGS[key] }
    await this.saveState()
    return this.getAll()
  }
}
