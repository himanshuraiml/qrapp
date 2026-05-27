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
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    if (data) _cache.set(userId, { profile: data, ts: Date.now() })
    setProfile(data ?? null)
  }, [supabase])

  useEffect(() => {
    let active = true

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
    })

    // Listen for auth changes (INITIAL_SESSION covers session restoration after refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!active) return

        if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
          if (session?.user) {
            await fetchProfile(session.user.id)
          }
        } else if (event === 'SIGNED_OUT') {
          setProfile(null)
          _cache.clear()
        }

        setLoading(false)
      }
    )

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [fetchProfile, supabase])

  const logout = useCallback(async () => {
    _cache.clear()
    clearCache()
    try {
      await supabase.auth.signOut()
    } catch {
      // Global signOut threw (e.g. lock timeout) — clear local session so
      // middleware won't find cookies and redirect us back to the dashboard
      try { await supabase.auth.signOut({ scope: 'local' }) } catch {}
    }
    window.location.href = '/login'
  }, [supabase])

  return { profile, loading, logout }
}

