/**
 * Android 共享常量
 *
 * MCP 工具模块和 IPC 处理器共用，
 * 避免在两处重复定义相同的按键码映射。
 */

/**
 * Android 按键码映射（常用按键）
 *
 * key 为友好名称（小写），value 为 Android KeyEvent keycode。
 * 用于 MCP 工具和 IPC 的 pressKey 操作。
 */
export const KEYCODE_MAP: Record<string, number> = {
  home: 3,
  back: 4,
  recent: 187,
  volume_up: 24,
  volume_down: 25,
  power: 26,
  enter: 66,
  delete: 67,
  tab: 61,
  escape: 111,
  menu: 82,
} as const
