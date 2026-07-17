import { describe, expect, it, vi } from 'vitest'
import type { BrowserWindow } from 'electron'
import { EditorToolModule, type EditorFileAccess } from './index'

function createFixture() {
  const send = vi.fn()
  const mainWindow = {
    isDestroyed: () => false,
    webContents: { send },
  } as unknown as BrowserWindow
  const fileAccess: EditorFileAccess = {
    readFile: vi.fn().mockResolvedValue({ content: 'project text', encoding: 'utf-8' }),
    readDir: vi.fn().mockResolvedValue([
      { name: 'docs', path: '/project/docs', type: 'directory' },
      { name: 'package.json', path: '/project/package.json', type: 'file', extension: '.json' },
    ]),
  }
  return { module: new EditorToolModule(mainWindow, fileAccess), fileAccess, send }
}

describe('EditorToolModule file access', () => {
  it('指定 filePath 时直接读取磁盘，不依赖已挂载的编辑器组件', async () => {
    const { module, fileAccess, send } = createFixture()

    await expect(
      module.execute('editor_read', { filePath: '/project/package.json' }),
    ).resolves.toEqual({ content: 'project text' })
    expect(fileAccess.readFile).toHaveBeenCalledWith('/project/package.json')
    expect(send).not.toHaveBeenCalled()
  })

  it('磁盘读取失败时立即返回原始错误', async () => {
    const { module, fileAccess, send } = createFixture()
    vi.mocked(fileAccess.readFile).mockRejectedValueOnce(new Error('ENOENT: file not found'))

    await expect(
      module.execute('editor_read', { filePath: '/project/missing.md' }),
    ).rejects.toThrow('ENOENT: file not found')
    expect(send).not.toHaveBeenCalled()
  })

  it('可以先列出目录，再选择真实存在的项目文件', async () => {
    const { module, fileAccess } = createFixture()

    await expect(
      module.execute('editor_list', { dirPath: '/project', showHiddenFiles: true }),
    ).resolves.toEqual({
      dirPath: '/project',
      entries: [
        { name: 'docs', path: '/project/docs', type: 'directory' },
        {
          name: 'package.json',
          path: '/project/package.json',
          type: 'file',
          extension: '.json',
        },
      ],
    })
    expect(fileAccess.readDir).toHaveBeenCalledWith('/project', { showHiddenFiles: true })
  })

  it('读取二进制文件时给出明确错误', async () => {
    const { module, fileAccess } = createFixture()
    vi.mocked(fileAccess.readFile).mockResolvedValueOnce({ content: 'AA==', encoding: 'base64' })

    await expect(
      module.execute('editor_read', { filePath: '/project/archive.zip' }),
    ).rejects.toThrow('不支持把二进制文件作为文本读取')
  })
})
