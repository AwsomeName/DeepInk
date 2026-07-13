/**
 * 右键菜单状态管理
 */

import { create } from 'zustand'
import type { FileTreeNode } from './fs-store'

interface ContextMenuState {
  open: boolean
  x: number
  y: number
  node: FileTreeNode | null
  show: (node: FileTreeNode, x: number, y: number) => void
  hide: () => void
}

export const useContextMenuStore = create<ContextMenuState>((set) => ({
  open: false,
  x: 0,
  y: 0,
  node: null,

  show: (node, x, y) => set({ open: true, x, y, node }),
  hide: () => set({ open: false, x: 0, y: 0, node: null }),
}))
