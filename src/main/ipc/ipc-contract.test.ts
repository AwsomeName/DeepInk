import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { defineIpcInvoke, defineNoArgsIpc } from '../../shared/ipc/contract'

describe('IPC invoke contracts', () => {
  it('rejects unexpected arguments for no-argument channels', () => {
    const contract = defineNoArgsIpc<{ success: boolean }>('test:no-args')

    expect(contract.parseArgs([])).toEqual([])
    expect(() => contract.parseArgs(['unexpected'])).toThrow('不接受参数')
  })

  it('uses the declared parser as the runtime argument boundary', () => {
    const contract = defineIpcInvoke<[number], string>('test:number', (args) => {
      if (args.length !== 1 || typeof args[0] !== 'number') throw new Error('expected number')
      return [args[0]]
    })

    expect(contract.parseArgs([42])).toEqual([42])
    expect(() => contract.parseArgs(['42'])).toThrow('expected number')
  })

  it('keeps migrated channel literals in shared declarations only', () => {
    const productionFiles = [
      'src/main/ipc/window-ipc.ts',
      'src/main/identity/identity-ipc.ts',
      'src/main/ipc/official-ipc.ts',
      'src/preload/renderer-support-api.ts',
      'src/preload/index.ts',
    ]
    const source = productionFiles
      .map((file) => readFileSync(resolve(process.cwd(), file), 'utf8'))
      .join('\n')

    expect(source).not.toMatch(/['"](?:window|identity|official):[A-Za-z]/)
  })
})
