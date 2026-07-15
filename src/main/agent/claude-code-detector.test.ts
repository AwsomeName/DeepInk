import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { detectClaudeCode } from './claude-code-detector'

let tempDir = ''

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'deepink-claude-detector-'))
})

afterEach(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true })
})

describe('detectClaudeCode', () => {
  it('accepts a configured executable path', async () => {
    const cliPath = join(tempDir, 'claude')
    await writeFile(cliPath, '#!/bin/sh\nexit 0\n', 'utf-8')
    await chmod(cliPath, 0o755)

    const status = await detectClaudeCode(cliPath)

    expect(status).toMatchObject({
      installed: true,
      path: cliPath,
      source: 'configured',
    })
  })

  it('rejects a configured path that is missing', async () => {
    const cliPath = join(tempDir, 'missing-claude')

    const status = await detectClaudeCode(cliPath)

    expect(status.installed).toBe(false)
    expect(status.path).toBe(cliPath)
    expect(status.source).toBe('configured')
  })
})
