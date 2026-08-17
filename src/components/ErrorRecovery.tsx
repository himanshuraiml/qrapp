'use client'

import { useEffect, useState } from 'react'
import { hardRecover } from '@/lib/swRecovery'
import { safeSessionStorage } from '@/lib/safeStorage'

const AUTO_RECOVER_GUARD_KEY = 'sw_hard_recover_at'

/**
 * Fallback UI for Next.js error boundaries (error.tsx / global-error.tsx).
 * Styled with inline styles, not Tailwind classes — this screen must still
 * render correctly even if the crash is caused by a CSS/JS chunk that failed
 * to load in the first place.
 */
export default function ErrorRecovery({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset?: () => void
}) {
  const [recovering, setRecovering] = useState(false)

  useEffect(() => {
    console.error('[ErrorRecovery]', error)

    // Most uncaught crashes here trace back to a wedged service worker
    // serving a stale shell/chunks from before the last deploy — this
    // affects plain browser tabs too, not just Home Screen installs, since
    // the SW is scoped to the origin either way. We don't rely on matching
    // the error message (real-world crash text varies too much); instead,
    // attempt one silent hard-recover per session, guarded so a genuine
    // repeated bug falls through to the manual UI instead of reload-looping.
    const lastAttempt = safeSessionStorage.getItem(AUTO_RECOVER_GUARD_KEY)
    if (lastAttempt) return

    safeSessionStorage.setItem(AUTO_RECOVER_GUARD_KEY, String(Date.now()))
    setRecovering(true)
    hardRecover()
  }, [error])

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1rem',
        padding: '2rem',
        textAlign: 'center',
        background: '#0f172a',
        color: '#e2e8f0',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <h1 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>
        {recovering ? 'Updating app…' : 'Something went wrong'}
      </h1>
      <p style={{ fontSize: '0.9rem', color: '#94a3b8', maxWidth: '28rem', margin: 0 }}>
        {recovering
          ? 'A newer version is available. Reloading automatically.'
          : 'Tap Reload app. If it keeps happening and you added this to your Home Screen, remove that icon and add it again.'}
      </p>
      {!recovering && (
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
          {reset && (
            <button
              onClick={reset}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '0.5rem',
                border: '1px solid #334155',
                background: 'transparent',
                color: '#e2e8f0',
                fontSize: '0.875rem',
              }}
            >
              Try again
            </button>
          )}
          <button
            onClick={() => {
              setRecovering(true)
              hardRecover()
            }}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '0.5rem',
              border: 'none',
              background: '#6366f1',
              color: 'white',
              fontSize: '0.875rem',
              fontWeight: 500,
            }}
          >
            Reload app
          </button>
        </div>
      )}
    </div>
  )
}
