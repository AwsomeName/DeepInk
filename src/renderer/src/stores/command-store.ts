import { create } from 'zustand'

/** 命令定义 */
export interface Command {
  id: string
  label: string
  /** 快捷键（显示用） */
  shortcut?: string
  /** 执行函数 */
  action: () => void
  /** 分组 */
  category?: string
}

interface CommandState {
  /** 所有已注册的命令 */
  commands: Command[]
  /** Command Palette 是否打开 */
  paletteOpen: boolean
  /** 当前搜索关键词 */
  query: string
  /** 最近执行命令 ID（最近在前） */
  recentCommandIds: string[]

  // --- Actions ---
  /** 注册命令 */
  registerCommand: (command: Command) => void
  /** 批量注册命令 */
  registerCommands: (commands: Command[]) => void
  /** 注销命令 */
  unregisterCommand: (id: string) => void
  /** 打开/关闭 Palette */
  togglePalette: () => void
  /** 关闭 Palette */
  closePalette: () => void
  /** 设置搜索词 */
  setQuery: (query: string) => void
  /** 标记命令已执行 */
  markCommandUsed: (id: string) => void
  /** 获取过滤后的命令 */
  getFilteredCommands: () => Command[]
}

const COMMAND_STORAGE_KEY = 'cclink-studio-command-state'

function loadRecentCommandIds(): string[] {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem(COMMAND_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as { recentCommandIds?: string[] }
    return Array.isArray(parsed.recentCommandIds) ? parsed.recentCommandIds.filter(Boolean) : []
  } catch {
    return []
  }
}

function saveRecentCommandIds(ids: string[]): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(
      COMMAND_STORAGE_KEY,
      JSON.stringify({ recentCommandIds: ids.slice(0, 12) }),
    )
  } catch {
    // localStorage 可能不可用，忽略持久化失败。
  }
}

export const useCommandStore = create<CommandState>((set, get) => ({
  commands: [],
  paletteOpen: false,
  query: '',
  recentCommandIds: loadRecentCommandIds(),

  registerCommand: (command) =>
    set((state) => ({
      commands: [...state.commands.filter((c) => c.id !== command.id), command],
    })),

  registerCommands: (commands) =>
    set((state) => {
      const existingIds = new Set(commands.map((c) => c.id))
      const filtered = state.commands.filter((c) => !existingIds.has(c.id))
      return { commands: [...filtered, ...commands] }
    }),

  unregisterCommand: (id) =>
    set((state) => ({
      commands: state.commands.filter((c) => c.id !== id),
    })),

  togglePalette: () =>
    set((state) => ({
      paletteOpen: !state.paletteOpen,
      query: '',
    })),

  closePalette: () => set({ paletteOpen: false, query: '' }),

  setQuery: (query) => set({ query }),

  markCommandUsed: (id) =>
    set((state) => {
      const recentCommandIds = [id, ...state.recentCommandIds.filter((item) => item !== id)].slice(
        0,
        12,
      )
      saveRecentCommandIds(recentCommandIds)
      return { recentCommandIds }
    }),

  getFilteredCommands: () => {
    const { commands, query, recentCommandIds } = get()
    if (!query.trim()) {
      const recent = recentCommandIds
        .map((id) => commands.find((cmd) => cmd.id === id))
        .filter((cmd): cmd is Command => Boolean(cmd))
      const recentIds = new Set(recent.map((cmd) => cmd.id))
      return [...recent, ...commands.filter((cmd) => !recentIds.has(cmd.id))]
    }

    /** 简单模糊匹配：query 中的字符按顺序出现在 target 中即匹配 */
    const fuzzyMatch = (query: string, target: string): boolean => {
      let qi = 0
      for (let ti = 0; ti < target.length && qi < query.length; ti++) {
        if (target[ti] === query[qi]) qi++
      }
      return qi === query.length
    }

    const q = query.toLowerCase().trim()
    return commands.filter((c) => {
      const label = c.label.toLowerCase()
      const id = c.id.toLowerCase()
      const category = (c.category || '').toLowerCase()
      // 模糊匹配 OR 子串匹配（保证常用场景能命中）
      return (
        fuzzyMatch(q, label) ||
        fuzzyMatch(q, id) ||
        fuzzyMatch(q, category) ||
        label.includes(q) ||
        id.includes(q)
      )
    })
  },
}))
