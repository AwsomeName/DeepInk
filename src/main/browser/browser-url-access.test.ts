import { mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { assertBrowserUrlAccess, isSupportedBrowserUrl } from './browser-url-access'

describe('browser URL resource access', () => {
  it('allows HTTP(S) and exact about:blank while rejecting executable schemes', async () => {
    await expect(assertBrowserUrlAccess('https://example.com', null)).resolves.toBeUndefined()
    await expect(assertBrowserUrlAccess('about:blank', null)).resolves.toBeUndefined()
    await expect(assertBrowserUrlAccess('javascript:alert(1)', null)).rejects.toThrow(
      '不允许的浏览器协议',
    )
    expect(isSupportedBrowserUrl('data:text/html,test')).toBe(false)
  })

  it('allows only real HTML files contained by the bound workspace', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'cclink-browser-access-'))
    const workspace = path.join(root, 'workspace')
    const outside = path.join(root, 'outside.html')
    const inside = path.join(workspace, 'preview.html')
    await mkdir(workspace)
    await writeFile(inside, '<h1>ok</h1>')
    await writeFile(outside, '<h1>secret</h1>')

    await expect(
      assertBrowserUrlAccess(pathToFileURL(inside).href, workspace),
    ).resolves.toBeUndefined()
    await expect(assertBrowserUrlAccess(pathToFileURL(outside).href, workspace)).rejects.toThrow(
      '不在当前工作空间内',
    )
    await expect(assertBrowserUrlAccess(pathToFileURL(inside).href, null)).rejects.toThrow(
      '必须绑定',
    )
  })

  it('rejects a workspace symlink that resolves outside the project', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'cclink-browser-symlink-'))
    const workspace = path.join(root, 'workspace')
    const outside = path.join(root, 'outside.html')
    const link = path.join(workspace, 'linked.html')
    await mkdir(workspace)
    await writeFile(outside, '<h1>secret</h1>')
    await symlink(outside, link)

    await expect(assertBrowserUrlAccess(pathToFileURL(link).href, workspace)).rejects.toThrow(
      '不在当前工作空间内',
    )
  })
})
