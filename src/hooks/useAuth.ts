'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { clearCache, CACHE_TTL } from '@/lib/cache'
import type { Profile } from '@/types'

// Module-level cache — shared across every useAuth() instance on the same page
// (NavBar + page component both call useAuth(), so without this they'd each hit the DB)
const _cache = new Map<string, { profile: Profile; ts: number }>()

function getCached(userId: string): Profile | null {
  const entry = _cache.get(userId)
  if (!entry || Date.now() - entry.ts > CACHE_TTL.profile) {
    _cache.delete(userId)
    return null
  }
  return entry.profile
}

export function useAuth() {
  const supabase = createClient()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = useCallback(async (userId: string) => {
    const cached = getCached(userId)
    if (cached) { setProfile(cached); return }
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()
      if (data) _cache.set(userId, { profile: data, ts: Date.now() })
      setProfile(data ?? null)
    } catch {
      // Network error — leave profile null, loading is cleared by the caller's finally
    }
  }, [supabase])

  useEffect(() => {
    let active = true

    // Hard failsafe: if auth doesn't resolve in 8s (e.g. token refresh hangs),
    // clear loading and redirect to login so the user is never stuck.
    const failsafe = setTimeout(() => {
      if (!active) return
      setLoading(false)
      window.location.replace('/login')
    }, 8000)

    // Initialize session state on mount
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

    // onAuthStateChange is the primary signal — INITIAL_SESSION fires on every page load
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!active) return
        try {
          if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
            if (session?.user) {
              await fetchProfile(session.user.id)
            }
          } else if (event === 'SIGNED_OUT') {
            setProfile(null)
            _cache.clear()
          }
        } finally {
          // Always clear loading, even if fetchProfile throws/hangs
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
    // Clear in-memory caches immediately so the UI reflects logged-out state
    _cache.clear()
    clearCache()

    // Proactively wipe Supabase auth keys from localStorage so the user is
    // locally signed out even if the network call hangs or the SW intercepts it.
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith('sb-'))
        .forEach((k) => localStorage.removeItem(k))
    } catch {}

    // 2-second race: don't let signOut block the redirect
    const makeTimeout = () => new Promise<void>((resolve) => setTimeout(resolve, 2000))
    try {
      await Promise.race([supabase.auth.signOut(), makeTimeout()])
    } catch {
      // Fallback: local-only sign-out (clears the session cookie without a network call)
      try { await Promise.race([supabase.auth.signOut({ scope: 'local' }), makeTimeout()]) } catch {}
    } finally {
      window.location.href = '/login'
    }
  }, [supabase])

  return { profile, loading, logout }
}

