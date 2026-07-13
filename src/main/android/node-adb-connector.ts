/**
 * Node.js ADB Server 连接器
 *
 * 将 Node.js net.Socket 桥接到 @yume-chan/adb 的 AdbServerClient.ServerConnector 接口。
 * 使 @yume-chan/adb 可以通过本地 adb server（端口 5037）与 Android 设备通信。
 *
 * 这是 scrcpy 视频流的关键桥梁：
 *   @yume-chan/adb (pure TS) → NodeAdbServerConnector → net.Socket → adb server → 设备
 */

import { createConnection, type Socket } from 'net'
import { AdbServerClient } from '@yume-chan/adb'
import type { MaybeConsumable } from '@yume-chan/stream-extra'
import { Consumable, PushReadableStream, WritableStream } from '@yume-chan/stream-extra'

/**
 * 将 Node.js Socket 包装为 AdbServerClient.ServerConnection
 *
 * ServerConnection 是一个 ReadableWritablePair<Uint8Array, MaybeConsumable<Uint8Array>>
 * 加上一个 close() 方法和 closed Promise。
 */
class NodeSocketConnection implements AdbServerClient.ServerConnection {
  private socket: Socket
  private _closed!: Promise<undefined>
  private resolveClosed!: (value: undefined) => void

  /** 从 socket 读取数据的 ReadableStream */
  readable: PushReadableStream<Uint8Array>
  /** 向 socket 写入数据的 WritableStream */
  writable: WritableStream<MaybeConsumable<Uint8Array>>

  get closed(): Promise<undefined> {
    return this._closed
  }

  constructor(socket: Socket) {
    this.socket = socket
    this._closed = new Promise<undefined>((resolve) => {
      this.resolveClosed = resolve
    })

    // 读方向：socket data 事件 → PushReadableStream
    this.readable = new PushReadableStream<Uint8Array>((controller) => {
      socket.on('data', (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength))
      })
      socket.on('end', () => {
        controller.close()
      })
      socket.on('error', (err) => {
        controller.error(err)
      })
    })

    // 写方向：WritableStream → socket.write
    this.writable = new WritableStream<MaybeConsumable<Uint8Array>>({
      write: async (chunk) => {
        // MaybeConsumable<Uint8Array> = Uint8Array | Consumable<Uint8Array>
        // Consumable.consume() 返回 void（不是 Uint8Array），正确做法是读 .value
        // 然后调用 .consume() 通知"已 access"，让生产者继续推下一块
        let data: Uint8Array
        if (chunk instanceof Uint8Array) {
          data = chunk
        } else if (chunk instanceof Consumable) {
          data = chunk.value
          chunk.consume()
        } else {
          throw new Error(`Unknown chunk type: ${typeof chunk}`)
        }
        const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength)
        return new Promise<void>((resolve, reject) => {
          socket.write(buf, (err) => {
            if (err) reject(err)
            else resolve()
          })
        })
      },
    })

    socket.on('close', () => {
      this.resolveClosed(undefined)
    })
  }

  async close(): Promise<void> {
    this.socket.destroy()
  }
}

/**
 * Node.js ADB Server 连接器
 *
 * 实现 AdbServerClient.ServerConnector 接口，
 * 通过 TCP 连接到本地 adb server（默认 127.0.0.1:5037）。
 *
 * tunnelForward 模式下不需要 reverse tunnel，因此
 * addReverseTunnel/removeReverseTunnel/clearReverseTunnels 为空实现。
 */
export class NodeAdbServerConnector implements AdbServerClient.ServerConnector {
  private host: string
  private port: number

  constructor(host = '127.0.0.1', port = 5037) {
    this.host = host
    this.port = port
  }

  connect(): Promise<AdbServerClient.ServerConnection> {
    return new Promise<AdbServerClient.ServerConnection>((resolve, reject) => {
      const socket = createConnection({ host: this.host, port: this.port }, () => {
        resolve(new NodeSocketConnection(socket))
      })
      socket.on('error', reject)
      socket.setTimeout(30_000)
    })
  }

  addReverseTunnel(): string {
    // tunnelForward 模式不需要 reverse tunnel
    return ''
  }

  removeReverseTunnel(): void {
    // 空实现
  }

  clearReverseTunnels(): void {
    // 空实现
  }
}
