/**
 * 编辑器 Store
 *
 * 管理打开的编辑器文件状态：内容、脏标记、Agent 推送队列。
 * Tiptap Editor 实例由 React 组件持有，Store 只管理 Markdown 文本和状态。
 */

import { create } from 'zustand'
import type { EditorContentUpdate } from '@shared/ipc/editor'
import { isWorkspaceStateRestoring, persistWorkspaceSection } from '../utils/workspace-state'

/** 单个文件的编辑器状态 */
export interface EditorFileState {
  /** 上次保存/加载时的 Markdown 内容 */
  savedContent: string
  /** 当前 Markdown 内容（与 savedContent 不同 = dirty） */
  currentContent: string
  /** 是否有未保存的修改 */
  dirty: boolean
  /** 是否正在加载 */
  loading: boolean
}

export type { EditorContentUpdate } from '@shared/ipc/editor'

interface EditorState {
  /** 打开的文件状态：filePath → EditorFileState */
  files: Record<string, EditorFileState>
  /** Agent 推送的内容更新队列 */
  pendingUpdates: EditorContentUpdate[]

  // --- Actions ---

  /** 打开文件：从磁盘读取，初始化状态 */
  openFile: (filePath: string) => Promise<void>

  /** 关闭文件：从状态中移除 */
  closeFile: (filePath: string) => void

  /** 更新内容（用户编辑时调用，标 dirty） */
  updateContent: (filePath: string, markdown: string) => void

  /** 保存文件：写入磁盘，清 dirty */
  saveFile: (filePath: string) => Promise<void>

  /** 判断文件是否有未保存修改 */
  isDirty: (filePath: string) => boolean

  /** 获取文件的已保存内容 */
  getSavedContent: (filePath: string) => string | undefined

  /** 应用 Agent 推送的内容更新 */
  applyAgentUpdate: (update: EditorContentUpdate) => void

  /** 确认一个更新已应用 */
  ackUpdate: (id: string) => void

  /** 获取并消费指定文件的待处理更新 */
  consumePendingUpdates: (filePath: string | undefined) => EditorContentUpdate[]

  /** 初始化虚拟文件（Agent 创建的无路径文档 / 复制 Tab 的种子内容） */
  initVirtualFile: (key: string, seed?: string) => void

  /** 从主进程 WorkspaceState 恢复编辑器草稿 */
  hydrateFromWorkspaceState: (value: unknown) => void
}

function normalizeEditorDrafts(value: unknown): Record<string, EditorFileState> | null {
  if (!value || typeof value !== 'object') return null
  const parsed = value as { files?: Record<string, EditorFileState> }
  if (parsed.files && Object.keys(parsed.files).length === 0) return {}
  const files: Record<string, EditorFileState> = {}
  for (const [key, file] of Object.entries(parsed.files ?? {})) {
    if (!file || typeof file.currentContent !== 'string') continue
    files[key] = {
      savedContent: typeof file.savedContent === 'string' ? file.savedContent : '',
      currentContent: file.currentContent,
      dirty: Boolean(file.dirty),
      loading: false,
    }
  }
  return Object.keys(files).length > 0 ? files : null
}

function getPersistableEditorFiles(files: Record<string, EditorFileState>): Record<string, EditorFileState> {
  const result: Record<string, EditorFileState> = {}
  for (const [key, file] of Object.entries(files)) {
    if (key.startsWith('virtual:') || file.dirty) {
      result[key] = { ...file, loading: false }
    }
  }
  return result
}

function saveStoredEditorFiles(state: EditorState): void {
  try {
    if (isWorkspaceStateRestoring()) return
    const files = getPersistableEditorFiles(state.files)
    persistWorkspaceSection('editorDrafts', { files })
  } catch {
    // WorkspaceState 镜像失败不应影响当前编辑器状态。
  }
}

export const useEditorStore = create<EditorState>((set, get) => ({
  // 编辑器草稿按工作空间恢复，避免全局 localStorage 把其他项目草稿带入当前项目。
  files: {},
  pendingUpdates: [],

  openFile: async (filePath) => {
    const existing = get().files[filePath]
    if (existing?.dirty) return

    // 先标记 loading
    set((state) => ({
      files: {
        ...state.files,
        [filePath]: {
          savedContent: '',
          currentContent: '',
          dirty: false,
          loading: true,
        },
      },
    }))

    try {
      const result = await window.deepink.fs.readFile(filePath)
      const content = typeof result === 'string' ? result : result.content
      set((state) => ({
        files: {
          ...state.files,
          [filePath]: {
            savedContent: content,
            currentContent: content,
            dirty: false,
            loading: false,
          },
        },
      }))
    } catch (err) {
      console.error('[EditorStore] 打开文件失败:', filePath, err)
      // 加载失败时创建空文件状态
      set((state) => ({
        files: {
          ...state.files,
          [filePath]: {
            savedContent: '',
            currentContent: '',
            dirty: false,
            loading: false,
          },
        },
      }))
    }
  },

  closeFile: (filePath) => {
    set((state) => {
      const { [filePath]: _, ...rest } = state.files
      return { files: rest }
    })
  },

  updateContent: (filePath, markdown) => {
    set((state) => {
      const file = state.files[filePath]
      if (!file) return state
      return {
        files: {
          ...state.files,
          [filePath]: {
            ...file,
            currentContent: markdown,
            dirty: markdown !== file.savedContent,
          },
        },
      }
    })
  },

  saveFile: async (filePath) => {
    const file = get().files[filePath]
    if (!file) return

    try {
      await window.deepink.fs.writeFile(filePath, file.currentContent)
      set((state) => ({
        files: {
          ...state.files,
          [filePath]: {
            ...state.files[filePath],
            savedContent: file.currentContent,
            dirty: false,
          },
        },
      }))
    } catch (err) {
      console.error('[EditorStore] 保存文件失败:', filePath, err)
      throw err
    }
  },

  isDirty: (filePath) => {
    return get().files[filePath]?.dirty ?? false
  },

  getSavedContent: (filePath) => {
    return get().files[filePath]?.savedContent
  },

  applyAgentUpdate: (update) => {
    set((state) => ({
      pendingUpdates: [...state.pendingUpdates, update],
    }))
  },

  ackUpdate: (id) => {
    set((state) => ({
      pendingUpdates: state.pendingUpdates.filter((u) => u.id !== id),
    }))
  },

  consumePendingUpdates: (filePath) => {
    const updates = get().pendingUpdates.filter(
      (u) => u.filePath === filePath || (!u.filePath && !filePath),
    )
    if (updates.length > 0) {
      // 移除已消费的更新：取 match filter 的反集
      const consumedIds = new Set(updates.map((u) => u.id))
      set((state) => ({
        pendingUpdates: state.pendingUpdates.filter((u) => !consumedIds.has(u.id)),
      }))
    }
    return updates
  },

  initVirtualFile: (key, seed = '') => {
    set((state) => {
      if (state.files[key]) return state
      // 虚拟文档从未落盘：savedContent 固定为 ''，dirty 反映「有未保存内容」
      return {
        files: {
          ...state.files,
          [key]: {
            savedContent: '',
            currentContent: seed,
            dirty: seed !== '',
            loading: false,
          },
        },
      }
    })
  },

  hydrateFromWorkspaceState: (value) => {
    const files = normalizeEditorDrafts(value)
    if (!files) return
    set({ files })
  },
}))

useEditorStore.subscribe((state) => {
  saveStoredEditorFiles(state)
})
