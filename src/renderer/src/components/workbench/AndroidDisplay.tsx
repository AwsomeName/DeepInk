import { useRef, useEffect, useCallback, useState } from 'react'
import { useAndroidStore, type EmulatorState } from '../../stores/android-store'
import type { StoreInstallPhase } from '../../stores/android-store'

/**
 * Android 画面显示 + 一键设置
 *
 * 未安装时显示一键设置向导，已安装时显示 scrcpy 实时画面。
 *
 * 视频流架构：
 *   [主进程 ScrcpyBridge] → IPC scrcpy:videoFrame → [此处]
 *     → ReadableStream<ScrcpyMediaStreamPacket>
 *     → WebCodecsVideoDecoder (from @yume-chan/scrcpy-decoder-webcodecs)
 *     → WebGLVideoFrameRenderer → <canvas>
 *
 * 触摸事件：
 *   <canvas> onMouseDown/Up → IPC scrcpy:touch → [主进程 injectTouch]
 */
export function AndroidDisplay(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  /** 保存 WebCodecsVideoDecoder 实例，用于清理 */
  const decoderRef = useRef<any>(null)
  /** 保存 stream controller，用于关闭 */
  const streamControllerRef = useRef<ReadableStreamDefaultController<any> | null>(null)
  const [mirrorStatus, setMirrorStatus] = useState<
    'disconnected' | 'connecting' | 'connected' | 'error'
  >('disconnected')
  const [mirrorError, setMirrorError] = useState<string | null>(null)

  // 安装状态
  const [setupStatus, setSetupStatus] = useState<{
    adb: boolean
    emulator: boolean
    systemImage: boolean
    avd: boolean
    licenseAccepted: boolean
    ready: boolean
  } | null>(null)
  const [setupInProgress, setSetupInProgress] = useState(false)
  const [setupStep, setSetupStep] = useState<string>('')
  const [setupProgress, setSetupProgress] = useState(0)
  const [setupError, setSetupError] = useState<string | null>(null)

  // License 同意流程
  const [showLicense, setShowLicense] = useState(false)
  const [licenseText, setLicenseText] = useState<string>('')
  const [licenseLoading, setLicenseLoading] = useState(false)
  const [licenseChecked, setLicenseChecked] = useState(false)

  // 应用商店引导状态（从 store 读取，IPC 监听在 App.tsx 注册，Tab 未挂载也不会漏事件）
  const storeInstall = useAndroidStore((s) => s.storeInstall)
  const setStoreInstall = useAndroidStore((s) => s.setStoreInstall)

  const emulatorState = useAndroidStore((s) => s.emulatorState)
  const setEmulatorState = useAndroidStore((s) => s.setEmulatorState)
  const deviceMode = useAndroidStore((s) => s.deviceMode)
  const setMirrorConnected = useAndroidStore((s) => s.setMirrorConnected)
  const [avdList, setAvdList] = useState<string[]>([])
  const [selectedAvd, setSelectedAvd] = useState('')
  const [emulatorLaunching, setEmulatorLaunching] = useState(false)
  const [emulatorActionError, setEmulatorActionError] = useState<string | null>(null)

  /** 刷新安装状态 */
  const refreshSetupStatus = useCallback(async () => {
    try {
      const status = await window.deepink.android.getSetupStatus()
      setSetupStatus(status)
    } catch {
      // IPC 可能还没注册
    }
  }, [])

  /** 真正执行下载安装 */
  const runSetup = useCallback(async () => {
    setSetupInProgress(true)
    setSetupError(null)
    setSetupStep('准备中...')

    // 监听进度
    window.deepink.android.onSetupProgress(({ step, progress }) => {
      setSetupStep(step)
      if (progress) {
        setSetupProgress(progress.percent)
      }
    })

    try {
      const result = await window.deepink.android.setup()
      if (result.success) {
        setSetupStep('设置完成！')
        setSetupProgress(100)
        await refreshSetupStatus()
      } else {
        setSetupError(result.error ?? '未知错误')
      }
    } catch (err: any) {
      setSetupError(err.message)
    } finally {
      setSetupInProgress(false)
    }
  }, [refreshSetupStatus])

  /** 点击「一键设置」：未接受协议则先展示协议 */
  const handleSetup = useCallback(async () => {
    if (setupStatus?.licenseAccepted) {
      await runSetup()
      return
    }
    setShowLicense(true)
    setLicenseChecked(false)
    setLicenseLoading(true)
    try {
      const license = await window.deepink.android.getLicense()
      setLicenseText(license.text)
    } catch (err: any) {
      setLicenseText(`无法加载协议正文：${err.message}`)
    } finally {
      setLicenseLoading(false)
    }
  }, [setupStatus, runSetup])

  /** 同意协议并开始安装 */
  const handleAcceptLicense = useCallback(async () => {
    await window.deepink.android.acceptLicense()
    setShowLicense(false)
    await refreshSetupStatus()
    await runSetup()
  }, [refreshSetupStatus, runSetup])

  /** 连接到 scrcpy 投屏（走主进程 reconcile + 重绑，不再裸拿 getDeviceId） */
  const connectMirror = useCallback(async () => {
    if (mirrorStatus === 'connecting' || mirrorStatus === 'connected') return
    setMirrorStatus('connecting')
    setMirrorError(null)

    try {
      // 1. 通过主进程 reconcile + 重绑 + scrcpy connect（替代裸 getDeviceId + connectMirror）
      await window.deepink.android.reconnect()

      // 3. 设置视频解码器（动态导入 @yume-chan/scrcpy-decoder-webcodecs）
      const canvas = canvasRef.current
      if (!canvas) throw new Error('Canvas 不可用')

      const { WebCodecsVideoDecoder } = await import('@yume-chan/scrcpy-decoder-webcodecs')
      const { WebGLVideoFrameRenderer } = await import('@yume-chan/scrcpy-decoder-webcodecs')
      const { ScrcpyVideoCodecId } = await import('@yume-chan/scrcpy')

      // WebGL 渲染器（高性能 GPU 渲染）
      const renderer = new WebGLVideoFrameRenderer(canvas)

      // 视频解码器
      const decoder = new WebCodecsVideoDecoder({
        codec: ScrcpyVideoCodecId.H264,
        renderer,
      })
      decoderRef.current = decoder

      // 4. 创建桥接 stream：IPC 帧 → ReadableStream → decoder.writable
      let controller: ReadableStreamDefaultController<any>
      const bridgeStream = new ReadableStream({
        start(c) {
          controller = c
        },
      })
      streamControllerRef.current = controller!

      // 将桥接 stream 管道连接到解码器的 writable
      bridgeStream.pipeTo(decoder.writable).catch(() => {
        // pipe 中断（断开连接时正常）
      })

      // 5. 监听视频帧并推送到 bridgeStream
      window.deepink.android.onVideoFrame(
        (frame: {
          type: 'configuration' | 'data'
          data: ArrayBuffer
          keyframe?: boolean
          pts?: string
        }) => {
          if (!streamControllerRef.current) return
          try {
            // 还原 IPC 序列化后的 ScrcpyMediaStreamPacket
            const packet =
              frame.type === 'configuration'
                ? { type: 'configuration' as const, data: new Uint8Array(frame.data) }
                : {
                    type: 'data' as const,
                    data: new Uint8Array(frame.data),
                    keyframe: frame.keyframe,
                    pts: frame.pts ? BigInt(frame.pts) : undefined,
                  }
            streamControllerRef.current!.enqueue(packet)
          } catch {
            // stream 可能已关闭
          }
        },
      )

      // 6. 监听尺寸变化，调整 canvas
      decoder.sizeChanged(({ width, height }: { width: number; height: number }) => {
        if (canvasRef.current) {
          canvasRef.current.width = width
          canvasRef.current.height = height
        }
      })

      // 7. 监听 scrcpy 错误
      window.deepink.android.onMirrorError((error: string) => {
        setMirrorStatus('error')
        setMirrorError(error)
        setMirrorConnected(false)
      })

      setMirrorStatus('connected')
      setMirrorConnected(true)
    } catch (err: any) {
      console.error('[AndroidDisplay] 连接失败:', err)
      setMirrorStatus('error')
      setMirrorError(err.message)
      setMirrorConnected(false)
    }
  }, [mirrorStatus, setMirrorConnected])

  /** 断开投屏 */
  const disconnectMirror = useCallback(async () => {
    // 关闭 stream controller
    try {
      streamControllerRef.current?.close()
    } catch {
      /* ignore */
    }
    streamControllerRef.current = null

    // 释放解码器
    try {
      decoderRef.current?.dispose()
    } catch {
      /* ignore */
    }
    decoderRef.current = null

    // 通知主进程断开
    try {
      await window.deepink.android.disconnectMirror()
    } catch {
      /* ignore */
    }

    setMirrorStatus('disconnected')
    setMirrorConnected(false)
  }, [setMirrorConnected])

  // ─── 触摸事件处理 ───

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (mirrorStatus !== 'connected') return
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width) * canvas.width
      const y = ((e.clientY - rect.top) / rect.height) * canvas.height
      window.deepink.android.sendTouch({ action: 0, x, y, pressure: 1.0 })
    },
    [mirrorStatus],
  )

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (mirrorStatus !== 'connected') return
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width) * canvas.width
      const y = ((e.clientY - rect.top) / rect.height) * canvas.height
      window.deepink.android.sendTouch({ action: 1, x, y, pressure: 0.0 })
    },
    [mirrorStatus],
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      // 仅在鼠标按下时发送 move 事件（拖拽操作）
      if (mirrorStatus !== 'connected' || !(e.buttons & 1)) return
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width) * canvas.width
      const y = ((e.clientY - rect.top) / rect.height) * canvas.height
      window.deepink.android.sendTouch({ action: 2, x, y, pressure: 1.0 })
    },
    [mirrorStatus],
  )

  // 初始化：获取安装状态
  useEffect(() => {
    refreshSetupStatus()
  }, [refreshSetupStatus])

  useEffect(() => {
    if (!setupStatus?.ready || deviceMode === 'physical') return
    window.deepink.android
      .listAvds()
      .then((list) => {
        setAvdList(list)
        setSelectedAvd((current) => current || list[0] || '')
      })
      .catch((err: any) => {
        setEmulatorActionError(err.message ?? '读取 Android 虚拟设备失败')
      })
  }, [setupStatus?.ready, deviceMode])

  // 监听模拟器状态变化并同步到 store
  // 同时拉取一次当前状态，避免错过启动后才打开 tab 的情况
  useEffect(() => {
    const off = window.deepink.android.onStateChanged((state) => {
      setEmulatorState(state as EmulatorState)
      if (state === 'running') setEmulatorLaunching(false)
      if (state === 'error') {
        setEmulatorLaunching(false)
        setEmulatorActionError('模拟器启动失败')
      }
    })
    // 拉取初始状态（可能模拟器已经启动）
    window.deepink.android
      .getState()
      .then((state) => {
        setEmulatorState(state as EmulatorState)
      })
      .catch(() => {})
    return () => {
      off()
    }
  }, [setEmulatorState])

  const handleLaunchEmulator = useCallback(async () => {
    const avdName = selectedAvd || avdList[0]
    if (!avdName) {
      setEmulatorActionError('未检测到 Android 虚拟设备，请重新执行一键设置。')
      return
    }
    setEmulatorLaunching(true)
    setEmulatorActionError(null)
    try {
      await window.deepink.android.launch(avdName)
    } catch (err: any) {
      setEmulatorLaunching(false)
      setEmulatorActionError(err.message ?? '启动 Android 模拟器失败')
    }
  }, [selectedAvd, avdList])

  // ─── 应用商店引导（方案 A）───
  // IPC 监听已移至 App.tsx（全局注册，Tab 未挂载也不漏事件），此处仅消费 store 状态。

  // 监听设备丢失（reconcile 检测到 serial 不在线）
  useEffect(() => {
    const off = window.deepink.android.onDeviceLost(() => {
      setMirrorStatus('error')
      setMirrorError('设备已断开')
      setMirrorConnected(false)
    })
    return () => {
      off()
    }
  }, [])

  // 监听 scrcpy 断开连接（视频流结束）
  useEffect(() => {
    const off = window.deepink.android.onMirrorDisconnected(() => {
      setMirrorStatus('disconnected')
      setMirrorConnected(false)
    })
    return () => {
      off()
    }
  }, [])

  /** 重试商店引导安装（失败后点「重试」） */
  const handleRetryStoreInstall = useCallback(async () => {
    setStoreInstall({ phase: 'installing', message: '正在重试...' })
    try {
      const result = await window.deepink.android.retryStoreInstall()
      if (result.status === 'failed') {
        setStoreInstall({ phase: 'failed', message: result.message })
      } else {
        setStoreInstall({
          phase: 'done',
          message:
            result.status === 'installed'
              ? `已安装 ${result.displayName}`
              : `${result.displayName} 已就绪`,
        })
        setTimeout(() => setStoreInstall({ phase: 'idle' }), 4000)
      }
    } catch (err: any) {
      setStoreInstall({ phase: 'failed', message: err.message })
    }
  }, [])

  /** 手动选择 APK 安装商店（所有源失败时的兜底入口） */
  const handleManualInstallStore = useCallback(async () => {
    try {
      const picked = await window.deepink.dialog.showOpenDialog({
        title: '选择应用商店 APK',
        filters: [{ name: 'Android APK', extensions: ['apk'] }],
      })
      if (picked.canceled || picked.filePaths.length === 0) return
      const apkPath = picked.filePaths[0]
      if (!apkPath) return
      setStoreInstall({ phase: 'installing', message: '正在安装所选 APK...' })
      await window.deepink.android.installApk(apkPath)
      setStoreInstall({ phase: 'done', message: '应用商店已安装' })
      setTimeout(() => setStoreInstall({ phase: 'idle' }), 4000)
    } catch (err: any) {
      setStoreInstall({ phase: 'failed', message: `安装失败：${err.message}` })
    }
  }, [])

  // 活跃设备就绪后自动连接投屏（模拟器 running 或真机已连接）
  useEffect(() => {
    if (
      (emulatorState === 'running' || deviceMode === 'physical') &&
      mirrorStatus === 'disconnected'
    ) {
      connectMirror()
    }
  }, [emulatorState, deviceMode, mirrorStatus, connectMirror])

  // 清理：组件卸载时断开连接
  useEffect(() => {
    return () => {
      try {
        streamControllerRef.current?.close()
      } catch {
        /* ignore */
      }
      try {
        decoderRef.current?.dispose()
      } catch {
        /* ignore */
      }
      window.deepink.android.disconnectMirror().catch(() => {})
      setMirrorConnected(false)
    }
  }, [setMirrorConnected])

  // ─── 渲染 ───

  // 情况 1: 还没检查安装状态
  if (setupStatus === null) {
    return <CenterMessage>⏳ 正在检查 Android 环境...</CenterMessage>
  }

  // 情况 2a: 展示 Android SDK 许可协议（下载前必须同意）
  // 物理真机已连接时绕过 SDK 流程，直接投屏
  if (!setupStatus.ready && showLicense && deviceMode !== 'physical') {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#1e1e1e',
          padding: '24px',
          boxSizing: 'border-box',
        }}
      >
        <h2 style={{ color: '#e0e0e0', fontSize: '16px', fontWeight: 500, marginBottom: '4px' }}>
          Android SDK 许可协议
        </h2>
        <p style={{ color: '#888', fontSize: '12px', marginBottom: '12px' }}>
          模拟器与系统镜像由 Google 官方提供，下载前需同意以下条款。
        </p>
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            background: '#252526',
            borderRadius: '6px',
            padding: '12px',
            fontSize: '12px',
            color: '#bbb',
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            marginBottom: '12px',
          }}
        >
          {licenseLoading ? '⏳ 正在加载协议正文...' : licenseText}
        </div>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: '#ccc',
            fontSize: '13px',
            marginBottom: '12px',
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={licenseChecked}
            onChange={(e) => setLicenseChecked(e.target.checked)}
          />
          我已阅读并同意《Android Software Development Kit License Agreement》
        </label>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={() => setShowLicense(false)}
            style={{
              padding: '8px 20px',
              background: '#333',
              color: '#ccc',
              border: '1px solid #555',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            取消
          </button>
          <button
            onClick={handleAcceptLicense}
            disabled={!licenseChecked || licenseLoading}
            style={{
              padding: '8px 20px',
              background: licenseChecked && !licenseLoading ? '#0e639c' : '#333',
              color: licenseChecked && !licenseLoading ? '#fff' : '#666',
              border: 'none',
              borderRadius: '6px',
              cursor: licenseChecked && !licenseLoading ? 'pointer' : 'not-allowed',
              fontSize: '13px',
              fontWeight: 500,
            }}
          >
            同意并继续
          </button>
        </div>
      </div>
    )
  }

  // 情况 2: 未安装 → 显示一键设置向导（物理真机模式绕过，直接投屏）
  if (!setupStatus.ready && deviceMode !== 'physical') {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#1e1e1e',
        }}
      >
        <div style={{ textAlign: 'center', maxWidth: '400px', padding: '24px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📱</div>
          <h2 style={{ color: '#e0e0e0', fontSize: '18px', fontWeight: 500, marginBottom: '8px' }}>
            Android 模拟器
          </h2>
          <p style={{ color: '#888', fontSize: '13px', marginBottom: '20px', lineHeight: 1.5 }}>
            需要下载 Android 运行环境（约 1GB）。
            <br />
            安装完成后可直接在 DeepInk 中运行 Android 应用。
          </p>

          {/* 安装状态清单 */}
          <div
            style={{
              textAlign: 'left',
              marginBottom: '20px',
              background: '#252526',
              borderRadius: '6px',
              padding: '12px',
              fontSize: '12px',
              color: '#aaa',
            }}
          >
            <StatusLine done={setupStatus.adb} label="ADB 调试工具（~10MB）" />
            <StatusLine done={setupStatus.emulator} label="Android 模拟器（~300MB）" />
            <StatusLine done={setupStatus.systemImage} label="Android 14 系统镜像（~1GB）" />
            <StatusLine done={setupStatus.avd} label="默认虚拟设备配置" />
          </div>

          {/* 进度条 */}
          {setupInProgress && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ color: '#ccc', fontSize: '12px', marginBottom: '6px' }}>
                {setupStep}
              </div>
              <div
                style={{
                  width: '100%',
                  height: '4px',
                  background: '#333',
                  borderRadius: '2px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${setupProgress}%`,
                    height: '100%',
                    background: '#0e639c',
                    borderRadius: '2px',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
              <div style={{ color: '#666', fontSize: '11px', marginTop: '4px' }}>
                {setupProgress}%
              </div>
            </div>
          )}

          {/* 错误信息 */}
          {setupError && (
            <div
              style={{
                color: '#f48771',
                fontSize: '12px',
                marginBottom: '12px',
                background: 'rgba(244,135,113,0.1)',
                padding: '8px 12px',
                borderRadius: '4px',
                textAlign: 'left',
              }}
            >
              {setupError}
            </div>
          )}

          {/* 安装按钮 */}
          <button
            onClick={handleSetup}
            disabled={setupInProgress}
            style={{
              padding: '10px 32px',
              background: setupInProgress ? '#333' : '#0e639c',
              color: setupInProgress ? '#666' : '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: setupInProgress ? 'wait' : 'pointer',
              fontSize: '14px',
              fontWeight: 500,
            }}
          >
            {setupInProgress ? '安装中...' : '一键设置 Android'}
          </button>
        </div>
      </div>
    )
  }

  // 情况 3: 已安装，模拟器未启动（物理真机已连接时跳过，走投屏流程）
  if (emulatorState === 'stopped' && deviceMode !== 'physical') {
    return (
      <CenterMessage>
        <div style={{ marginBottom: '12px' }}>✅ Android 环境已就绪</div>
        <div style={{ fontSize: '12px', color: '#888', marginBottom: '16px' }}>
          启动模拟器后会自动连接画面
        </div>
        {avdList.length > 1 && (
          <select
            value={selectedAvd}
            onChange={(event) => setSelectedAvd(event.target.value)}
            disabled={emulatorLaunching}
            style={{
              width: '220px',
              padding: '6px 8px',
              marginBottom: '10px',
              background: '#252526',
              color: '#ccc',
              border: '1px solid #555',
              borderRadius: '4px',
              fontSize: '12px',
            }}
          >
            {avdList.map((avd) => (
              <option key={avd} value={avd}>
                {avd}
              </option>
            ))}
          </select>
        )}
        {emulatorActionError && (
          <div style={{ color: '#f48771', fontSize: '12px', marginBottom: '12px' }}>
            {emulatorActionError}
          </div>
        )}
        <button
          onClick={handleLaunchEmulator}
          disabled={emulatorLaunching || avdList.length === 0}
          style={{
            padding: '8px 24px',
            background: emulatorLaunching || avdList.length === 0 ? '#333' : '#0e639c',
            color: emulatorLaunching || avdList.length === 0 ? '#777' : '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: emulatorLaunching || avdList.length === 0 ? 'not-allowed' : 'pointer',
            fontSize: '13px',
          }}
        >
          {emulatorLaunching
            ? '启动中...'
            : avdList.length === 0
              ? '未检测到虚拟设备'
              : '启动 Android'}
        </button>
      </CenterMessage>
    )
  }

  // 情况 4: 模拟器启动中（物理真机模式不显示）
  if (emulatorState === 'booting' && deviceMode !== 'physical') {
    return <CenterMessage>⏳ Android 模拟器启动中（首次约 1-2 分钟）...</CenterMessage>
  }

  // 情况 5-8: 模拟器运行中
  //
  // 关键修复：<canvas> 必须「始终挂载」，否则 connectMirror() 运行时
  // canvasRef.current 为 null → 报「Canvas 不可用」。
  // 之前 canvas 只在 connected 状态渲染，而连接动作发生在 disconnected 状态，
  // 形成先有鸡还是先有蛋的死锁。这里让 canvas 常驻，未连接时 display:none，
  // 各状态用浮层叠加在上面。
  // 真机已连接（deviceMode='physical'）时同样进入此分支——canvas + scrcpy 对 serial 透明。
  if (emulatorState === 'running' || deviceMode === 'physical') {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#1e1e1e',
          position: 'relative',
        }}
      >
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseMove={handleMouseMove}
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
            cursor: 'pointer',
            display: mirrorStatus === 'connected' ? 'block' : 'none',
          }}
        />

        {/* 未连接：连接画面 */}
        {mirrorStatus === 'disconnected' && (
          <CenterOverlay>
            <div style={{ marginBottom: '12px' }}>📱 模拟器已就绪</div>
            <button
              onClick={connectMirror}
              style={{
                padding: '8px 24px',
                background: '#0e639c',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              连接画面
            </button>
          </CenterOverlay>
        )}

        {/* 连接中 */}
        {mirrorStatus === 'connecting' && (
          <CenterOverlay>⏳ 正在连接 Android 画面...</CenterOverlay>
        )}

        {/* 连接失败 */}
        {mirrorStatus === 'error' && (
          <CenterOverlay>
            <div style={{ color: '#f48771', marginBottom: '8px' }}>❌ 连接失败</div>
            <div style={{ fontSize: '12px', color: '#888', marginBottom: '12px' }}>
              {mirrorError}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={connectMirror}
                style={{
                  padding: '6px 16px',
                  background: '#0e639c',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
              >
                重试
              </button>
              <button
                onClick={disconnectMirror}
                style={{
                  padding: '6px 16px',
                  background: '#333',
                  color: '#ccc',
                  border: '1px solid #555',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
              >
                断开
              </button>
            </div>
          </CenterOverlay>
        )}

        {/* 已连接：右上角悬浮断开按钮 */}
        {mirrorStatus === 'connected' && (
          <button
            onClick={disconnectMirror}
            title="断开投屏"
            style={{
              position: 'absolute',
              top: '8px',
              right: '8px',
              padding: '4px 8px',
              background: 'rgba(0,0,0,0.6)',
              color: '#ccc',
              border: '1px solid #555',
              borderRadius: '3px',
              cursor: 'pointer',
              fontSize: '11px',
            }}
          >
            断开
          </button>
        )}

        {/* 应用商店引导状态（方案 A）：左上角浮层，与投屏连接无关 */}
        {storeInstall.phase !== 'idle' && (
          <div
            style={{
              position: 'absolute',
              top: '8px',
              left: '8px',
              maxWidth: '260px',
              padding: '8px 10px',
              borderRadius: '4px',
              fontSize: '11px',
              lineHeight: 1.4,
              textAlign: 'left',
              background:
                storeInstall.phase === 'failed' ? 'rgba(244,135,113,0.18)' : 'rgba(0,0,0,0.65)',
              border: `1px solid ${storeInstall.phase === 'failed' ? '#f48771' : '#555'}`,
              color: storeInstall.phase === 'failed' ? '#f48771' : '#ccc',
            }}
          >
            {storeInstall.phase === 'installing' && (
              <span>⏳ {storeInstall.message ?? '正在准备应用商店...'}</span>
            )}
            {storeInstall.phase === 'done' && (
              <span style={{ color: '#4ec9b0' }}>✓ {storeInstall.message}</span>
            )}
            {storeInstall.phase === 'failed' && (
              <>
                <div style={{ marginBottom: '4px' }}>⚠️ 应用商店获取失败</div>
                {storeInstall.message && (
                  <div style={{ color: '#999', marginBottom: '6px', fontSize: '10px' }}>
                    {storeInstall.message}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    onClick={handleRetryStoreInstall}
                    style={{
                      padding: '3px 10px',
                      background: '#0e639c',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      fontSize: '11px',
                    }}
                  >
                    重试
                  </button>
                  <button
                    onClick={handleManualInstallStore}
                    style={{
                      padding: '3px 10px',
                      background: '#333',
                      color: '#ccc',
                      border: '1px solid #555',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      fontSize: '11px',
                    }}
                  >
                    选择 APK
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    )
  }

  // 兜底：未覆盖的状态
  return <CenterMessage>⏳ 准备中...</CenterMessage>
}

/** 居中浮层（叠加在常驻 canvas 之上，不卸载 canvas） */
function CenterOverlay({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        textAlign: 'center',
        color: '#888',
        fontSize: '14px',
        background: '#1e1e1e',
      }}
    >
      {children}
    </div>
  )
}

/** 居中消息 */
function CenterMessage({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1e1e1e',
        color: '#888',
        fontSize: '14px',
        flexDirection: 'column',
        textAlign: 'center',
      }}
    >
      {children}
    </div>
  )
}

/** 安装状态行 */
function StatusLine({ done, label }: { done: boolean; label: string }): React.JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
      <span style={{ color: done ? '#4ec9b0' : '#666', fontSize: '14px' }}>{done ? '✓' : '○'}</span>
      <span>{label}</span>
    </div>
  )
}
