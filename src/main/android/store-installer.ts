import { app } from 'electron'
import { createWriteStream, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from 'fs'
import { readFile } from 'fs/promises'
import { join } from 'path'
import * as https from 'https'
import * as http from 'http'
import type { AdbBridge } from './adb-bridge'
import type { StoreInstallResult } from '../../shared/ipc/android'

/**
 * Android 应用商店引导安装器
 *
 * 对应决策文档 docs/features/android-app-store.md 的「方案 A」：
 * 运行时从官方源下载商店 APK → adb install → 靠 userdata 持久化 +
 * 开机幂等自检保持常驻。无快照、不烧镜像。
 *
 * 设计要点：
 * - 多源解析：按 store-sources.json 的 source 顺序逐个尝试，任一成功即停。
 * - 缓存抗失效：下载成功的 APK 保留在本地，源全挂时仍能用缓存装上。
 * - 幂等自检：pm list packages 检测，已装则跳过；wipe-data 丢后下次补回。
 * - 不阻塞：ensureStoreInstalled 返回 Promise，调用方可不 await（fire-and-forget）。
 */

// ─── 配置类型（对应 resources/store-sources.json） ─────────────

export interface DirectSource {
  type: 'direct'
  url: string
  note?: string
}

export interface DetailPageSource {
  type: 'detail_page'
  /** 详情页 URL */
  url: string
  /** 从页面 HTML 提取 APK 直链的正则（字符串形式） */
  linkPattern: string
  note?: string
}

export type StoreSource = DirectSource | DetailPageSource

export interface StoreEntry {
  id: string
  displayName: string
  packageName: string
  cacheFileName: string
  officialSite: string
  sources: StoreSource[]
}

interface StoreConfig {
  defaultStoreId: string
  stores: StoreEntry[]
}

export type { StoreInstallResult, StoreInstallStatus } from '../../shared/ipc/android'

// ─── 路径工具 ─────────────────────────────────────────

/** resources 目录：dev 下项目根，打包后 process.resourcesPath */
function getResourcesPath(): string {
  return app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources')
}

/** APK 缓存目录：userData/apk-cache/，下载成功的 APK 留此抗源失效 */
function getApkCacheDir(): string {
  const dir = join(app.getPath('userData'), 'apk-cache')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

// ─── 主入口 ───────────────────────────────────────────

/**
 * 确保默认应用商店已安装（幂等）
 *
 * 流程：检测包是否存在 → 未装则取 APK（缓存优先 → 多源下载）→ adb install。
 * 调用方通常在真机连接完成后触发，结果用 onProgress/返回值回调处理。
 *
 * @param adbBridge 已连接的 AdbBridge
 * @param onProgress 进度回调（下载/安装阶段提示），可选
 */
export async function ensureStoreInstalled(
  adbBridge: AdbBridge,
  onProgress?: (msg: string) => void,
): Promise<StoreInstallResult> {
  // 1. 加载配置，取默认商店
  const config = await loadStoreConfig()
  const store =
    config.stores.find((s) => s.id === config.defaultStoreId) ?? config.stores[0]
  if (!store) {
    return { status: 'failed', storeId: '', displayName: '', message: 'store-sources.json 未配置商店' }
  }

  // 2. 已装则跳过
  if (await isPackageInstalled(adbBridge, store.packageName)) {
    return { status: 'already-installed', storeId: store.id, displayName: store.displayName }
  }

  // 3. 取 APK：缓存优先，否则多源下载
  const apkPath = join(getApkCacheDir(), store.cacheFileName)
  // 校验缓存：文件存在但为空/损坏则删除，避免坏缓存永久阻塞后续安装
  if (existsSync(apkPath)) {
    try {
      const stat = statSync(apkPath)
      if (stat.size < 1024) {
        console.warn(`[StoreInstaller] 缓存 APK 过小 (${stat.size}B)，可能是损坏文件，删除重新下载`)
        unlinkSync(apkPath)
      }
    } catch {
      // stat 失败（权限等）也删掉重下
      try { unlinkSync(apkPath) } catch { /* 忽略 */ }
    }
  }
  if (!existsSync(apkPath)) {
    onProgress?.(`正在下载 ${store.displayName}…`)
    const sourceNote = await downloadStoreApk(store, apkPath, onProgress)
    if (!sourceNote) {
      return {
        status: 'failed',
        storeId: store.id,
        displayName: store.displayName,
        message: `所有下载源均失败，可手动从 ${store.officialSite} 下载后拖入安装`,
      }
    }
    onProgress?.(`下载完成（${sourceNote}）`)
  }

  // 4. 安装：失败重试 1 次（adb 偶发 INSTALL_FAILED，重试通常可恢复）
  onProgress?.(`正在安装 ${store.displayName}…`)
  try {
    await adbBridge.installApk(apkPath)
    return { status: 'installed', storeId: store.id, displayName: store.displayName }
  } catch (firstErr) {
    onProgress?.('安装失败，重试一次…')
    try {
      await adbBridge.installApk(apkPath)
      return { status: 'installed', storeId: store.id, displayName: store.displayName }
    } catch (secondErr) {
      return {
        status: 'failed',
        storeId: store.id,
        displayName: store.displayName,
        message: `安装失败：${(secondErr as Error).message}（首次：${(firstErr as Error).message}）`,
      }
    }
  }
}

// ─── 包检测 ───────────────────────────────────────────

/** 检测指定包是否已安装（pm list packages 过滤） */
async function isPackageInstalled(adbBridge: AdbBridge, pkg: string): Promise<boolean> {
  try {
    const list = await adbBridge.listPackages(pkg)
    return list.some((p) => p === pkg)
  } catch {
    // 设备暂时不可达或命令失败，按「未装」处理，让后续流程继续
    return false
  }
}

// ─── 多源下载 ─────────────────────────────────────────

/**
 * 按 store.sources 顺序逐个尝试下载 APK
 *
 * @returns 成功时返回来源说明；全部失败返回 null
 */
async function downloadStoreApk(
  store: StoreEntry,
  dest: string,
  onProgress?: (msg: string) => void,
): Promise<string | null> {
  for (const [index, source] of store.sources.entries()) {
    const tag = `源${index + 1}(${source.type})`
    try {
      const url = await resolveApkUrl(source)
      if (!url) {
        onProgress?.(`${tag}：未解析出下载链接，跳过`)
        continue
      }
      await downloadTo(url, dest)
      return tag
    } catch (err) {
      onProgress?.(`${tag} 失败：${(err as Error).message}，尝试下一个源`)
      // 失败的半成品清理掉，避免下次误用残文件
      try {
        if (existsSync(dest)) renameSync(dest, dest + '.failed') // 保留以排查，不直接删
      } catch {
        // 忽略清理失败
      }
    }
  }
  return null
}

/** 根据源类型解析出最终 APK 下载 URL */
async function resolveApkUrl(source: StoreSource): Promise<string | null> {
  if (source.type === 'direct') {
    return source.url
  }
  // detail_page：抓 HTML，用 linkPattern 正则提取第一个 .apk 直链
  const html = await fetchText(source.url)
  const re = new RegExp(source.linkPattern, 'i')
  const match = re.exec(html)
  return match ? match[0] : null
}

// ─── HTTP 工具（重定向跟随 + 超时 + 大小上限） ─────────

/**
 * 抓取 URL 内容为 Buffer，自动跟随重定向（最多 5 次）
 *
 * downloadTo / fetchText 共用此底层，重定向逻辑只写一遍。
 * 32MB 级 APK 进 Buffer 无压力（与 sdk-setup maxBuffer 50MB 同量级）。
 */
function fetchBuffer(url: string, maxBytes: number, timeoutMs: number): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const visit = (currentUrl: string, redirects: number): void => {
      if (redirects > 5) {
        reject(new Error('重定向次数过多'))
        return
      }
      const mod = currentUrl.startsWith('https') ? https : http
      const req = mod.get(currentUrl, {
        timeout: timeoutMs,
        headers: {
          // 部分 CDN/应用商店（APKPure 等）会拒绝无 UA 的请求
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        },
      }, (res) => {
        const status = res.statusCode ?? 0
        if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
          res.resume()
          visit(resolveUrl(currentUrl, res.headers.location), redirects + 1)
          return
        }
        if (status !== 200) {
          res.resume()
          reject(new Error(`HTTP ${status}`))
          return
        }
        const chunks: Buffer[] = []
        let size = 0
        res.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > maxBytes) {
            res.destroy()
            reject(new Error(`超过大小上限 ${maxBytes} 字节`))
            return
          }
          chunks.push(chunk)
        })
        res.on('end', () => resolve(Buffer.concat(chunks)))
        res.on('error', reject)
      })
      req.on('timeout', () => req.destroy(new Error(`请求超时 ${timeoutMs}ms`)))
      req.on('error', reject)
    }
    visit(url, 0)
  })
}

/** 处理相对重定向：把 location 基于 base 解析成绝对 URL */
function resolveUrl(base: string, location: string): string {
  try {
    return new URL(location, base).toString()
  } catch {
    return location
  }
}

/** 下载 APK 到 dest（先写 .downloading 临时文件，成功后原子改名） */
async function downloadTo(url: string, dest: string): Promise<void> {
  const buf = await fetchBuffer(url, 100 * 1024 * 1024, 90_000)
  const tmp = dest + '.downloading'
  await new Promise<void>((resolve, reject) => {
    const ws = createWriteStream(tmp)
    ws.on('error', reject)
    ws.on('finish', () => resolve())
    ws.end(buf)
  })
  renameSync(tmp, dest)
}

/** 抓取页面文本（限 2MB，超时 20s），用于详情页解析 */
async function fetchText(url: string): Promise<string> {
  const buf = await fetchBuffer(url, 2 * 1024 * 1024, 20_000)
  return buf.toString('utf-8')
}

// ─── 配置加载 ─────────────────────────────────────────

/** 读取 resources/store-sources.json */
async function loadStoreConfig(): Promise<StoreConfig> {
  const configPath = join(getResourcesPath(), 'store-sources.json')
  const raw = await readFile(configPath, 'utf-8')
  return JSON.parse(raw) as StoreConfig
}
