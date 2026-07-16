import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActiveDeviceManager } from './active-device-manager'
import type { AdbBridge } from './adb-bridge'
import { AgentDeviceManager } from './agent-device-manager'

const appsOpenMock = vi.hoisted(() => vi.fn())
const sessionsCloseMock = vi.hoisted(() => vi.fn())

vi.mock('agent-device', () => ({
  createAgentDeviceClient: () => ({
    apps: {
      open: appsOpenMock,
    },
    sessions: {
      close: sessionsCloseMock,
    },
    capture: {
      snapshot: vi.fn(),
    },
    interactions: {
      click: vi.fn(),
      swipe: vi.fn(),
      fill: vi.fn(),
      type: vi.fn(),
    },
  }),
}))

function createFixture(options: {
  serial?: string | null
  discoverAdb: ReturnType<typeof vi.fn>
}): {
  manager: AgentDeviceManager
  activeDeviceManager: ActiveDeviceManager
  adbBridge: AdbBridge
} {
  const activeDeviceManager = {
    getSerial: vi.fn(() => options.serial ?? null),
    onChanged: vi.fn(() => vi.fn()),
  } as unknown as ActiveDeviceManager
  const adbBridge = {
    discoverAdb: options.discoverAdb,
    addSerialReboundListener: vi.fn(() => vi.fn()),
  } as unknown as AdbBridge

  return {
    manager: new AgentDeviceManager(activeDeviceManager, adbBridge),
    activeDeviceManager,
    adbBridge,
  }
}

describe('AgentDeviceManager availability', () => {
  beforeEach(() => {
    appsOpenMock.mockReset()
    sessionsCloseMock.mockReset()
  })

  it('does not report available when agent-device loads but adb is missing', async () => {
    const discoverAdb = vi.fn().mockRejectedValue(new Error('adb missing'))
    const { manager } = createFixture({ discoverAdb })

    await manager.init()

    expect(manager.isAvailable()).toBe(false)
    expect(discoverAdb).toHaveBeenCalledTimes(1)
    expect(appsOpenMock).not.toHaveBeenCalled()
  })

  it('retries adb discovery on first session use and binds a cclink-studio session', async () => {
    const discoverAdb = vi
      .fn()
      .mockRejectedValueOnce(new Error('adb missing'))
      .mockResolvedValueOnce('/opt/android-sdk/platform-tools/adb')
    const { manager } = createFixture({ serial: 'device-123', discoverAdb })

    await manager.init()
    expect(manager.isAvailable()).toBe(false)

    await expect(manager.ensureSession()).resolves.toBe(true)

    expect(discoverAdb).toHaveBeenCalledTimes(2)
    expect(manager.isAvailable()).toBe(true)
    expect(appsOpenMock).toHaveBeenCalledWith({
      session: 'cclink-studio-device-123',
      platform: 'android',
      serial: 'device-123',
    })
  })

  it('runtime flag disables the semantic layer even when adb is available', async () => {
    const discoverAdb = vi.fn().mockResolvedValue('/opt/android-sdk/platform-tools/adb')
    const { manager } = createFixture({ serial: 'device-123', discoverAdb })

    await manager.init()
    expect(manager.isAvailable()).toBe(true)

    manager.setEnabled(false)

    expect(manager.isAvailable()).toBe(false)
  })
})
