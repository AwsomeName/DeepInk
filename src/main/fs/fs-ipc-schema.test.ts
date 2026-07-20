import { describe, expect, it } from 'vitest'
import {
  fsMarkdownSaveAsSchema,
  fsPathSchema,
  fsSaveDocumentAssetSchema,
  fsSaveTextDocumentSchema,
} from './fs-ipc-schema'

describe('filesystem IPC runtime schema', () => {
  it('accepts declared document operations', () => {
    expect(
      fsSaveTextDocumentSchema.parse({
        filePath: '/workspace/note.md',
        content: '# Note',
        force: true,
      }),
    ).toMatchObject({ filePath: '/workspace/note.md', force: true })
    expect(
      fsMarkdownSaveAsSchema.parse({ targetPath: '/workspace/copy.md', content: '# Copy' }),
    ).toMatchObject({ targetPath: '/workspace/copy.md' })
  })

  it('rejects empty or NUL paths, unknown fields and malformed hashes', () => {
    expect(() => fsPathSchema.parse('')).toThrow()
    expect(() => fsPathSchema.parse('/workspace/bad\0path')).toThrow()
    expect(() =>
      fsSaveTextDocumentSchema.parse({
        filePath: '/workspace/note.md',
        content: 'text',
        expectedHash: 'not-a-sha256',
      }),
    ).toThrow()
    expect(() =>
      fsMarkdownSaveAsSchema.parse({
        targetPath: '/workspace/copy.md',
        content: 'text',
        extra: true,
      }),
    ).toThrow()
  })

  it('rejects non-image and non-base64 asset contracts', () => {
    expect(() =>
      fsSaveDocumentAssetSchema.parse({
        documentPath: '/workspace/note.md',
        fileName: 'payload.txt',
        mimeType: 'text/plain',
        content: 'payload',
        encoding: 'utf-8',
      }),
    ).toThrow()
  })
})
