'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { clearCache } from '@/lib/cache'
import type { Profile } from '@/types'

export function useAuth() {
  const supabase = createClient()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()
      setProfile(data ?? null)
    } catch {
      // Network error — leave profile null
    }
  }, [supabase])

  useEffect(() => {
    let active = true

    // Hard failsafe: if auth doesn't resolve in 8s, just clear loading.
    // Never force-redirect here — middleware handles unauthenticated requests.
    const failsafe = setTimeout(() => {
      if (!active) return
      setLoading(false)
    }, 8000)

    // onAuthStateChange is the primary signal — INITIAL_SESSION fires on every page load.
    // We rely on this exclusively; getSession() is only a fallback.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!active) return
        clearTimeout(failsafe)
        try {
          if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
            if (session?.user) {
              await fetchProfile(session.user.id)
            }
          } else if (event === 'SIGNED_OUT') {
            setProfile(null)
          }
        } finally {
          if (active) setLoading(false)
        }
      }
    )

    // Fallback: if onAuthStateChange never fires (rare), getSession() catches it
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return
      if (session?.user) {
        fetchProfile(session.user.id).finally(() => {
          if (active) setLoading(false)
        })
      } else {
        setLoading(false)
      }
    }).catch(() => {
      if (active) setLoading(false)
    })

    return () => {
      active = false
      clearTimeout(failsafe)
      subscription.unsubscribe()
    }
  }, [fetchProfile, supabase])

  const logout = useCallback(async () => {
    clearCache()

    // Wipe session from every client-side storage so the middleware never
    // sees stale auth cookies and bounces the user back to the dashboard.
    try {
      // localStorage keys
      Object.keys(localStorage)
        .filter((k) => k.startsWith('sb-'))
        .forEach((k) => localStorage.removeItem(k))
      // Cookies set by @supabase/ssr (not httpOnly — safe to clear via JS)
      document.cookie.split(';').forEach((c) => {
        const key = c.split('=')[0].trim()
        if (key.startsWith('sb-')) {
          document.cookie = `${key}=; max-age=0; path=/`
        }
      })
    } catch {}

    // Best-effort network signOut — but don't let it block the redirect
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, 2000))
    try {
      await Promise.race([supabase.auth.signOut(), timeout])
    } catch {
      try { await Promise.race([supabase.auth.signOut({ scope: 'local' }), timeout]) } catch {}
    } finally {
      window.location.href = '/login'
    }
  }, [supabase])

  return { profile, loading, logout }
}

