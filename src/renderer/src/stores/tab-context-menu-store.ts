/**
 * Tab 右键菜单状态管理
 *
 * 与文件树右键菜单（context-menu-store）解耦：Tab 菜单只关心 tabId。
 */

import { create } from 'zustand'

interface TabContextMenuState {
  open: boolean
  x: number
  y: number
  tabId: string | null
  show: (tabId: string, x: number, y: number) => void
  hide: () => void
}

export const useTabContextMenuStore = create<TabContextMenuState>((set) => ({
  open: false,
  x: 0,
  y: 0,
  tabId: null,

  show: (tabId, x, y) => set({ open: true, x, y, tabId }),
  hide: () => set({ open: false, x: 0, y: 0, tabId: null }),
}))
