import { useEffect, useState } from 'react'
import { setWorkspaceStateOwnerKey } from '../utils/workspace-state'

/** 初始化本地身份；开源壳不依赖 CCLink 登录/订阅 session。 */
export function useAppSession(cclinkStudioApiAvailable: boolean): boolean {
  const [ready, setReady] = useState(!cclinkStudioApiAvailable)

  useEffect(() => {
    let cancelled = false

    if (!cclinkStudioApiAvailable) {
      setWorkspaceStateOwnerKey(null)
      setReady(true)
      return () => {
        cancelled = true
      }
    }

    setReady(false)

    async function bootstrapLocalIdentity(): Promise<void> {
      try {
        const localIdentity = await window.cclinkStudio.identity.getLocalIdentity()
        setWorkspaceStateOwnerKey(`local:${localIdentity.localId}`)
      } catch (error) {
        setWorkspaceStateOwnerKey(null)
        console.warn('[AppSession] 初始化本地身份失败:', error)
      } finally {
        if (!cancelled) setReady(true)
      }
    }

    void bootstrapLocalIdentity()

    return () => {
      cancelled = true
    }
  }, [cclinkStudioApiAvailable])

  return ready
}
