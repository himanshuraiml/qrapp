'use client'

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { clearCache } from '@/lib/cache'
import type { Profile } from '@/types'

interface AuthContextValue {
  profile: Profile | null
  loading: boolean
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

interface AuthProviderProps {
  initialProfile: Profile | null
  initialUserId: string | null
  initialAccessToken: string | null
  initialRefreshToken: string | null
  children: React.ReactNode
}

export function AuthProvider({
  initialProfile,
  initialUserId,
  initialAccessToken,
  initialRefreshToken,
  children,
}: AuthProviderProps) {
  const supabase = createClient()
  // Seed from the server-validated profile. `loading` stays true until the
  // server session has been handed to the browser client (setSession below),
  // so pages wait for an authenticated client before firing RPCs — but it is
  // ALWAYS cleared in the seed effect's finally, so the UI can never hang even
  // if the profile is null or setSession fails.
  const [profile, setProfile] = useState<Profile | null>(initialProfile)
  const [loading, setLoading] = useState(true)

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()
      setProfile((data as Profile) ?? null)
    } catch {
      // Network error — keep whatever profile we already have
    }
  }, [supabase])

  // Hand the server-issued session to the browser client once, so subsequent
  // client-side RPCs/queries are authenticated. Replaces the old INITIAL_SESSION
  // /api/auth/me fallback race.
  const seeded = useRef(false)
  useEffect(() => {
    if (seeded.current) return
    seeded.current = true
    let cancelled = false
    ;(async () => {
      try {
        if (initialAccessToken && initialRefreshToken) {
          await supabase.auth.setSession({
            access_token: initialAccessToken,
            refresh_token: initialRefreshToken,
          })
        }
      } catch {
        // ignore — fall through; pages fetch with whatever session exists
      } finally {
        // Always clear loading so the UI never hangs, even on null tokens/profile.
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [supabase, initialAccessToken, initialRefreshToken])

  // React only to later auth changes (token refresh, sign-out from another tab).
  useEffect(() => {
    let active = true
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!active) return
        if (event === 'SIGNED_OUT') {
          setProfile(null)
        } else if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
          if (session?.user) fetchProfile(session.user.id)
        }
      }
    )
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [supabase, fetchProfile])

  const logout = useCallback(async (errorType?: string) => {
    clearCache()

    // Wipe session from every client-side storage so the middleware never
    // sees stale auth cookies and bounces the user back to the dashboard.
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith('sb-'))
        .forEach((k) => localStorage.removeItem(k))
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
      const url = errorType ? `/login?error=${errorType}` : '/login'
      window.location.href = url
    }
  }, [supabase])

  // Listen to profile updates (e.g. status changed to Inactive → real-time logout)
  useEffect(() => {
    if (!profile?.id) return
    let active = true

    const profileChannel = supabase
      .channel(`user_profile_status_${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${profile.id}`,
        },
        (payload) => {
          if (!active) return
          if (payload.new && 'status' in payload.new && payload.new.status === 'Inactive') {
            logout('deactivated')
          } else if (payload.new) {
            setProfile(payload.new as Profile)
          }
        }
      )
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(profileChannel)
    }
  }, [profile?.id, supabase, logout])

  return (
    <AuthContext.Provider value={{ profile, loading, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    // Rendered outside a provider (e.g. /login) — return a safe default.
    return { profile: null, loading: false, logout: async () => {} }
  }
  return ctx
}
