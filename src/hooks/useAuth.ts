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

    const failsafe = setTimeout(() => {
      if (active) setLoading(false)
    }, 8000)

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!active) return
        clearTimeout(failsafe)
        try {
          if (event === 'INITIAL_SESSION') {
            if (session?.user) {
              // Fast path: client-side session readable
              await fetchProfile(session.user.id)
            } else {
              // Refresh path: client can't read cookie — ask the server
              try {
                const res = await fetch('/api/auth/me')
                const { userId } = await res.json()
                if (userId && active) await fetchProfile(userId)
              } catch {}
            }
          } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
            if (session?.user) await fetchProfile(session.user.id)
          } else if (event === 'SIGNED_OUT') {
            setProfile(null)
          }
        } finally {
          if (active) setLoading(false)
        }
      }
    )

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

