'use client'

/**
 * SwUpdateReloader — listens for a new service worker taking control and
 * reloads the page automatically. This prevents the "Application error:
 * client-side exception" that happens on iOS Safari when a new SW activates
 * and starts serving new JS chunk hashes while the page still holds
 * references to old cached chunks.
 *
 * Mounted once in the root layout (layout.tsx).
 */
import { useEffect } from 'react'
import { safeSessionStorage } from '@/lib/safeStorage'

export default function SwUpdateReloader() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

    const handleControllerChange = () => {
      // A new service worker just took control. Reload to pick up fresh JS chunks.
      // Guard against reload loops: only reload if we haven't just reloaded.
      const lastReload = safeSessionStorage.getItem('sw_reload_at')
      const now = Date.now()
      if (!lastReload || now - parseInt(lastReload, 10) > 5000) {
        safeSessionStorage.setItem('sw_reload_at', String(now))
        window.location.reload()
      }
    }

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange)
    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange)
    }
  }, [])

  return null
}
