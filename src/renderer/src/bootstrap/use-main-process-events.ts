import { useEffect } from 'react'
import { useAndroidStore } from '../stores/android-store'
import { useUpdateStore } from '../stores/update-store'

/** 订阅主进程推送事件，并写入 renderer stores。 */
export function useMainProcessEvents(): void {
  useEffect(() => {
    const setStoreInstall = useAndroidStore.getState().setStoreInstall
    const offProgress = window.deepink.android.onStoreInstallProgress((msg) => {
      setStoreInstall({ phase: 'installing', message: msg })
    })
    const offResult = window.deepink.android.onStoreInstallResult((result) => {
      if (result.status === 'failed') {
        setStoreInstall({ phase: 'failed', message: result.message })
      } else {
        setStoreInstall({
          phase: 'done',
          message: result.status === 'installed' ? `已安装 ${result.displayName}` : `${result.displayName} 已就绪`,
        })
        setTimeout(() => setStoreInstall({ phase: 'idle' }), 4000)
      }
    })
    return () => {
      offProgress()
      offResult()
    }
  }, [])

  useEffect(() => {
    const setUpdate = useUpdateStore.getState().setUpdate
    const offUpdate = window.deepink.update.onUpdateAvailable((info) => {
      if (info.latest) setUpdate(info.latest)
    })
    return () => { offUpdate() }
  }, [])
}
