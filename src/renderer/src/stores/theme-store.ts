import { create } from 'zustand'

export type Theme = 'dark' | 'light' | 'system'

interface ThemeState {
  /** 用户选择的主题 */
  theme: Theme
  /** 实际生效的主题（system 模式下根据系统偏好解析） */
  resolvedTheme: 'dark' | 'light'

  // --- Actions ---
  setTheme: (theme: Theme) => void
}

/** 从 localStorage 读取保存的主题 */
function loadSavedTheme(): Theme {
  try {
    if (typeof localStorage === 'undefined') return 'dark'
    const saved = localStorage.getItem('cclink-studio-theme')
    if (saved === 'dark' || saved === 'light' || saved === 'system') return saved
  } catch {
    // localStorage 不可用
  }
  return 'dark'
}

/** 根据系统偏好解析实际主题 */
function resolveTheme(theme: Theme): 'dark' | 'light' {
  if (theme !== 'system') return theme
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** 应用主题到 DOM */
function applyTheme(resolved: 'dark' | 'light'): void {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-theme', resolved)
}

export const useThemeStore = create<ThemeState>((set) => {
  const initial = loadSavedTheme()
  const resolved = resolveTheme(initial)

  // 初始化时应用主题
  applyTheme(resolved)

  // 监听系统主题变化（仅在 system 模式下生效）
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    mediaQuery.addEventListener('change', () => {
      const current = useThemeStore.getState().theme
      if (current === 'system') {
        const newResolved = resolveTheme('system')
        applyTheme(newResolved)
        set({ resolvedTheme: newResolved })
      }
    })
  }

  return {
    theme: initial,
    resolvedTheme: resolved,

    setTheme: (theme) => {
      const resolved = resolveTheme(theme)
      applyTheme(resolved)
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('cclink-studio-theme', theme)
        }
      } catch {
        // localStorage 不可用
      }
      set({ theme, resolvedTheme: resolved })
    },
  }
})
