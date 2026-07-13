import { useEffect } from 'react'
import { useAuthStore } from '../stores/auth-store'
import { useSubscriptionStore } from '../stores/subscription-store'

/** 初始化认证 session，并监听主进程 session 变化。 */
export function useAppSession(deepinkApiAvailable: boolean): void {
  useEffect(() => {
    if (!deepinkApiAvailable) return

    window.deepink.auth.checkSession().then((session) => {
      useAuthStore.getState().setLoggedIn(session.loggedIn, session.user)
    }).catch(() => {
      useAuthStore.getState().setLoggedIn(false, null)
    })

    window.deepink.auth.onSessionChanged((session) => {
      useAuthStore.getState().setLoggedIn(session.loggedIn, session.user)
      if (session.loggedIn) {
        useSubscriptionStore.getState().loadStatus()
      }
    })
  }, [deepinkApiAvailable])
}
