import { describe, expect, it } from 'vitest'
import { classifyRemoteError, explainRemoteError } from './remote-error'

describe('remote-error', () => {
  it('识别账号层错误', () => {
    expect(classifyRemoteError('USER_NOT_FOUND：当前身份不是旧 CCLink 历史账号', 'conversation')).toBe(
      'account',
    )
  })

  it('识别实时链路错误', () => {
    expect(classifyRemoteError('CCLink 文件浏览尚未接入实时 transport', 'file-tree')).toBe(
      'transport',
    )
  })

  it('识别远端 Agent / 设备错误', () => {
    expect(classifyRemoteError('远程设备当前离线，无法读取文件树', 'file-tree')).toBe(
      'remote-agent',
    )
  })

  it('识别远程工作空间错误', () => {
    expect(classifyRemoteError('远程工作空间不存在或尚未同步', 'file-read')).toBe('workspace')
  })

  it('按区域给未知错误提供默认来源', () => {
    expect(explainRemoteError('目录打不开', 'file-tree')).toMatchObject({
      layer: 'file-provider',
      title: '文件 Provider异常',
    })
    expect(explainRemoteError('发送失败', 'conversation')).toMatchObject({
      layer: 'execution-backend',
      title: '执行后端异常',
    })
  })
})
