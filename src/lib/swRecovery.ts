/**
 * hardRecover — last-resort self-heal for the "Application error: client-side
 * exception" crash caused by a stale service worker serving deleted JS chunk
 * hashes after a deploy. Affects any client on the origin (regular browser
 * tabs included, not just iOS Home Screen installs), since skipWaiting is
 * disabled and a wedged SW only hands off once every client closes — see
 * SwUpdateReloader. Unregisters all service workers, drops the Cache Storage
 * entries they populated, and reloads so the next load re-fetches everything
 * fresh.
 */
export async function hardRecover(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((r) => r.unregister()))
    }
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
  } catch {
    // best-effort — fall through to reload regardless
  } finally {
    window.location.reload()
  }
}
