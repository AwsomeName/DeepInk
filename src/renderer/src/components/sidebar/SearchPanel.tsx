import { useEffect, useState, useCallback } from 'react'
import { useFsStore, useTabStore } from '../../stores'
import type { FileTreeNode } from '../../stores/fs-store'
import { IconSearch } from '../common/Icons'
import { getModelFileIcon, getTabTypeForFile, isModelFileExtension } from '../../utils/model-files'
import { isGerberFileExtension } from '../../utils/hardware-files'

const SEARCH_PANEL_STORAGE_KEY = 'deepink-search-panel-state'

function loadSearchState(): { query: string; results: FileTreeNode[] } {
  try {
    if (typeof localStorage === 'undefined') return { query: '', results: [] }
    const raw = localStorage.getItem(SEARCH_PANEL_STORAGE_KEY)
    if (!raw) return { query: '', results: [] }
    const parsed = JSON.parse(raw) as { query?: string; results?: FileTreeNode[] }
    return {
      query: parsed.query ?? '',
      results: Array.isArray(parsed.results) ? parsed.results : [],
    }
  } catch {
    return { query: '', results: [] }
  }
}

function saveSearchState(query: string, results: FileTreeNode[]): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(SEARCH_PANEL_STORAGE_KEY, JSON.stringify({ query, results: results.slice(0, 100) }))
  } catch {
    // localStorage 可能不可用，忽略持久化失败。
  }
}

export function SearchPanel(): React.ReactElement {
  const initial = useState(loadSearchState)[0]
  const [query, setQuery] = useState(initial.query)
  const [results, setResults] = useState<FileTreeNode[]>(initial.results)
  const [searching, setSearching] = useState(false)
  const searchFiles = useFsStore((s) => s.searchFiles)
  const openTab = useTabStore((s) => s.openTab)
  const workspacePath = useFsStore((s) => s.workspacePath)

  const handleSearch = useCallback(async () => {
    if (!query.trim() || !workspacePath) return
    setSearching(true)
    try {
      const found = await searchFiles(query.trim())
      setResults(found)
    } finally {
      setSearching(false)
    }
  }, [query, searchFiles, workspacePath])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleSearch()
    },
    [handleSearch],
  )

  const handleFileClick = (node: FileTreeNode): void => {
    if (node.type === 'file') {
      if (workspacePath && isGerberFileExtension(node.extension)) {
        openTab({
          type: 'hardware-gerber',
          title: node.name,
          icon: '🧩',
          filePath: node.path,
          hardwareGerber: {
            workspacePath,
            packagePath: node.path,
            entry: node.name,
          },
        })
        return
      }
      openTab({
        type: getTabTypeForFile(node.extension),
        title: node.name,
        icon: isModelFileExtension(node.extension) ? getModelFileIcon(node.extension) : '📄',
        filePath: node.path,
      })
    }
  }

  useEffect(() => {
    saveSearchState(query, results)
  }, [query, results])

  return (
    <div className="search-panel">
      <div className="search-panel-input">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="搜索文件名..."
          className="sidebar-search-input"
        />
        <button className="search-panel-btn" onClick={handleSearch} disabled={searching}>
          <IconSearch size={14} />
        </button>
      </div>

      {searching && <div className="search-panel-status">搜索中...</div>}

      {results.length > 0 && (
        <div className="search-panel-results">
          {results.map((r) => (
            <div
              key={r.path}
              className="sidebar-item file"
              onClick={() => handleFileClick(r)}
            >
              <span style={{ fontSize: 14 }}>
                {r.type === 'directory' ? '📁' : isGerberFileExtension(r.extension) ? '🧩' : '📄'}
              </span>
              <span className="file-tree-name">{r.name}</span>
            </div>
          ))}
        </div>
      )}

      {!searching && query && results.length === 0 && (
        <div className="search-panel-empty">未找到匹配的文件</div>
      )}
    </div>
  )
}
