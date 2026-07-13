import { describe, it, expect } from 'vitest'
import { ANDROID_ACTION_TYPES } from './android-actions'

describe('ANDROID_ACTION_TYPES', () => {
  it('应该有 15 个 action type', () => {
    expect(ANDROID_ACTION_TYPES).toHaveLength(15)
  })

  it('包含所有预期的 action type', () => {
    const expected = [
      'screenshot', 'dumpUi', 'deviceInfo', 'listPackages', 'currentActivity',
      'tap', 'swipe', 'pressKey', 'typeText', 'launchPackage', 'goHome',
      'installApk', 'uninstallPackage', 'pushFile', 'shell',
    ]
    for (const action of expected) {
      expect(ANDROID_ACTION_TYPES).toContain(action)
    }
  })

  it('没有重复', () => {
    expect(new Set(ANDROID_ACTION_TYPES).size).toBe(ANDROID_ACTION_TYPES.length)
  })
})
