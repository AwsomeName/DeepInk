import { create } from 'zustand'
import type { BrowserDownloadRecord } from '@shared/ipc/browser'

interface BrowserDownloadState {
  downloads: Record<string, BrowserDownloadRecord>
  upsertDownload: (download: BrowserDownloadRecord) => void
  refresh: () => Promise<void>
}

export const useBrowserDownloadStore = create<BrowserDownloadState>((set) => ({
  downloads: {},

  upsertDownload: (download) => set((state) => ({
    downloads: {
      ...state.downloads,
      [download.id]: download,
    },
  })),

  refresh: async () => {
    const downloads = await window.cclinkStudio.browser.listDownloads()
    set({
      downloads: Object.fromEntries(downloads.map((download) => [download.id, download])),
    })
  },
}))

