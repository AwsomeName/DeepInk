import { create } from 'zustand'
import type { BrowserActionLog, BrowserTaskRun } from '@shared/ipc/browser'

const FINAL_TASK_STATUSES = new Set<BrowserTaskRun['status']>(['completed', 'failed', 'cancelled'])

interface BrowserTaskState {
  tasks: Record<string, BrowserTaskRun>
  actionLogs: Record<string, BrowserActionLog[]>
  upsertTask: (task: BrowserTaskRun) => void
  upsertActionLog: (log: BrowserActionLog) => void
  refresh: () => Promise<void>
  getLatestTaskForTab: (tabId: string) => BrowserTaskRun | null
}

export const useBrowserTaskStore = create<BrowserTaskState>((set, get) => ({
  tasks: {},
  actionLogs: {},

  upsertTask: (task) => set((state) => ({
    tasks: {
      ...state.tasks,
      [task.id]: task,
    },
  })),

  upsertActionLog: (log) => set((state) => {
    const existing = state.actionLogs[log.taskRunId] ?? []
    const next = existing.some((item) => item.id === log.id)
      ? existing.map((item) => (item.id === log.id ? log : item))
      : [...existing, log]
    return {
      actionLogs: {
        ...state.actionLogs,
        [log.taskRunId]: next,
      },
    }
  }),

  refresh: async () => {
    const tasks = await window.cclinkStudio.browser.listTasks()
    const actionLogs: Record<string, BrowserActionLog[]> = {}
    await Promise.all(tasks.map(async (task) => {
      actionLogs[task.id] = await window.cclinkStudio.browser.listActionLogs(task.id)
    }))
    set({
      tasks: Object.fromEntries(tasks.map((task) => [task.id, task])),
      actionLogs,
    })
  },

  getLatestTaskForTab: (tabId) => {
    const tasks = Object.values(get().tasks)
      .filter((task) => task.tabId === tabId)
      .sort((a, b) => b.startedAt - a.startedAt)
    const active = tasks.find((task) => !FINAL_TASK_STATUSES.has(task.status))
    return active ?? tasks[0] ?? null
  },
}))

