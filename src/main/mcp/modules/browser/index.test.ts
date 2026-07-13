import { describe, it, expect } from 'vitest'
import { toolNameToActionType, BrowserToolModule } from './index'
import { PLAYWRIGHT_ACTION_TYPES } from '../../../playwright/playwright-actions'

// ─── toolNameToActionType ────────────────────────────

describe('toolNameToActionType', () => {
  it('简单工具名：去掉 browser_ 前缀', () => {
    expect(toolNameToActionType('browser_navigate')).toBe('navigate')
  })

  it('多段 snake_case 转为 camelCase', () => {
    expect(toolNameToActionType('browser_wait_for_selector')).toBe('waitForSelector')
  })

  it('单段工具名：直接去掉前缀', () => {
    expect(toolNameToActionType('browser_screenshot')).toBe('screenshot')
  })

  it('已经是 camelCase（goBack）保持不变', () => {
    expect(toolNameToActionType('browser_goBack')).toBe('goBack')
  })

  it('没有 browser_ 前缀时不报错', () => {
    expect(toolNameToActionType('navigate')).toBe('navigate')
  })

  it('空字符串返回空字符串', () => {
    expect(toolNameToActionType('')).toBe('')
  })
})

// ─── BrowserToolModule 工具定义校验 ──────────────────

// BrowserToolModule 的 tools 属性暴露了 BROWSER_TOOL_DEFINITIONS
// 需要传入 mock PlaywrightBridge（只读操作不需要真正连接）
const mockBridge = { getPage: () => null } as any
const module = new BrowserToolModule(mockBridge)
const TOOLS = module.tools

describe('BrowserToolModule 工具定义', () => {
  it('应该有 46 个工具定义', () => {
    expect(TOOLS).toHaveLength(46)
  })

  it('所有工具名以 browser_ 开头', () => {
    for (const def of TOOLS) {
      expect(def.name).toMatch(/^browser_/)
    }
  })

  it('工具名没有重复', () => {
    const names = TOOLS.map((d) => d.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('每个工具都有必需字段', () => {
    for (const def of TOOLS) {
      expect(def).toHaveProperty('name')
      expect(def).toHaveProperty('description')
      expect(def).toHaveProperty('inputSchema')
      expect(def).toHaveProperty('annotations')
      expect(def.inputSchema).toHaveProperty('type', 'object')
      expect(def.inputSchema).toHaveProperty('properties')
    }
  })

  it('annotations 的 readOnlyHint 和 destructiveHint 都是布尔值', () => {
    for (const def of TOOLS) {
      expect(typeof def.annotations.readOnlyHint).toBe('boolean')
      expect(typeof def.annotations.destructiveHint).toBe('boolean')
    }
  })

  it('每个工具名都能映射到有效的 action type', () => {
    for (const def of TOOLS) {
      const actionType = toolNameToActionType(def.name)
      expect(PLAYWRIGHT_ACTION_TYPES).toContain(actionType)
    }
  })
})
