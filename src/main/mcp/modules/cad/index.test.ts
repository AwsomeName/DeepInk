import { describe, expect, it, vi } from 'vitest'
import { CadToolModule } from './index'

describe('CadToolModule', () => {
  it('exposes CAD diagnostic tools', () => {
    const module = new CadToolModule({} as any)

    expect(module.tools.map((tool) => tool.name)).toEqual([
      'cad_get_backend_status',
      'cad_get_model_support',
      'cad_inspect_model',
      'cad_get_cache_status',
      'cad_clear_cache',
    ])
  })

  it('requires inputPath for model support checks', async () => {
    const module = new CadToolModule({} as any)

    await expect(module.execute('cad_get_model_support', {})).rejects.toThrow('缺少 inputPath')
  })

  it('delegates model support checks to the CAD service', async () => {
    const getModelSupport = vi.fn().mockResolvedValue({ canPreview: true })
    const module = new CadToolModule({ getModelSupport } as any)

    await expect(
      module.execute('cad_get_model_support', { inputPath: '/project/model.step' }),
    ).resolves.toEqual({ canPreview: true })
    expect(getModelSupport).toHaveBeenCalledWith('/project/model.step')
  })

  it('delegates model inspection to the CAD service', async () => {
    const inspectModel = vi.fn().mockResolvedValue({ cacheHit: true })
    const module = new CadToolModule({ inspectModel } as any)

    await expect(
      module.execute('cad_inspect_model', { inputPath: '/project/model.step' }),
    ).resolves.toEqual({ cacheHit: true })
    expect(inspectModel).toHaveBeenCalledWith('/project/model.step')
  })
})
