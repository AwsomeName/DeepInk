import { runShutdownStep } from './shutdown'

export interface RuntimeService {
  name: string
  start?: () => void | Promise<void>
  stop?: () => void | Promise<void>
}

export type ServiceRegistryState = 'idle' | 'starting' | 'started' | 'stopping'

export class ServiceRegistry {
  private readonly services: RuntimeService[] = []
  private readonly startedServices: RuntimeService[] = []
  private state: ServiceRegistryState = 'idle'
  private transition: Promise<void> | null = null

  register(service: RuntimeService): void {
    if (this.state !== 'idle' || this.transition) {
      throw new Error('运行时转换开始后不能再注册服务')
    }
    this.services.push(service)
  }

  async startAll(): Promise<void> {
    if (this.state === 'started') return
    if (this.state === 'starting') return this.transition!
    if (this.state === 'stopping') {
      await this.transition
      return this.startAll()
    }

    this.state = 'starting'
    this.transition = this.performStart()
    try {
      await this.transition
      this.state = 'started'
    } finally {
      this.transition = null
      if (this.state === 'starting') this.state = 'idle'
    }
  }

  async stopAll(): Promise<void> {
    if (this.state === 'idle') return
    if (this.state === 'stopping') return this.transition!
    if (this.state === 'starting') {
      await this.transition?.catch(() => undefined)
      return this.stopAll()
    }

    this.state = 'stopping'
    this.transition = this.performStop()
    try {
      await this.transition
    } finally {
      this.transition = null
      this.state = 'idle'
    }
  }

  async restartAll(): Promise<void> {
    await this.stopAll()
    await this.startAll()
  }

  getState(): ServiceRegistryState {
    return this.state
  }

  private async performStart(): Promise<void> {
    for (const service of this.services) {
      this.startedServices.push(service)
      try {
        await service.start?.()
      } catch (error) {
        console.error(`[CCLink Studio] ${service.name} 启动失败:`, error)
        await this.rollbackStartedServices()
        throw error
      }
    }
  }

  private async performStop(): Promise<void> {
    await this.rollbackStartedServices()
  }

  private async rollbackStartedServices(): Promise<void> {
    for (const service of [...this.startedServices].reverse()) {
      if (service.stop) await runShutdownStep(service.name, service.stop)
    }
    this.startedServices.length = 0
  }
}
