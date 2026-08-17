'use client'

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { clearCache } from '@/lib/cache'
import { saveOfflineAuthSession, getOfflineAuthSession, clearOfflineAuthSession } from '@/lib/offlineAuth'
import { safeStorage } from '@/lib/safeStorage'
import { ModuleProvider } from '@/context/ModuleContext'
import type { Profile } from '@/types'

interface AuthContextValue {
  profile: Profile | null
  loading: boolean
  isOffline: boolean
  isSessionExpired: boolean
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

interface AuthProviderProps {
  initialProfile: Profile | null
  initialUserId: string | null
  children: React.ReactNode
}

export function AuthProvider({
  initialProfile,
  initialUserId,
  children,
}: AuthProviderProps) {
  const supabase = createClient()
  const [profile, setProfile] = useState<Profile | null>(initialProfile)
  const [loading, setLoading] = useState(true)
  const [isOffline, setIsOffline] = useState(false)
  const [isSessionExpired, setIsSessionExpired] = useState(false)

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()
      if (data) {
        setProfile(data as Profile)
        // Refresh local offline cache
        saveOfflineAuthSession(userId, { access_token: null, refresh_token: null }, data as Profile)
      }
    } catch {
      // Network error — keep whatever profile we already have
    }
  }, [supabase])

  // Track physical online/offline status
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsOffline(!navigator.onLine)
      const handleOnline = () => setIsOffline(false)
      const handleOffline = () => setIsOffline(true)
      window.addEventListener('online', handleOnline)
      window.addEventListener('offline', handleOffline)
      return () => {
        window.removeEventListener('online', handleOnline)
        window.removeEventListener('offline', handleOffline)
      }
    }
  }, [])

  // Hand the server-issued session to the browser client & handle offline hydration
  const seeded = useRef(false)
  useEffect(() => {
    if (seeded.current) return
    seeded.current = true
    let cancelled = false

    ;(async () => {
      try {
        if (initialUserId && initialProfile) {
          // Store authenticated profile in offline vault
          await saveOfflineAuthSession(
            initialUserId,
            { access_token: null, refresh_token: null },
            initialProfile
          )
        } else if (!initialProfile) {
          // Server could not resolve user (e.g. offline load) — check offline vault for matching user
          const cached = await getOfflineAuthSession(initialUserId)
          if (cached && cached.profile) {
            if (cached.isExpired) {
              setIsSessionExpired(true)
            } else {
              setProfile(cached.profile)
            }
          }
        }
      } catch {
        // ignore — fall through
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [initialUserId, initialProfile])

  // React to auth changes (token refresh, sign-out)
  useEffect(() => {
    let active = true
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!active) return
        if (event === 'SIGNED_OUT') {
          setProfile(null)
          clearOfflineAuthSession()
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
    await clearOfflineAuthSession()

    try {
      if (typeof window !== 'undefined') {
        safeStorage.keys()
          .filter((k) => k.startsWith('sb-') || k.startsWith('faculty_') || k.startsWith('student_') || k.startsWith('qr_') || k.startsWith('scan_'))
          .forEach((k) => safeStorage.removeItem(k))
        document.cookie.split(';').forEach((c) => {
          const key = c.split('=')[0].trim()
          if (key.startsWith('sb-')) {
            document.cookie = `${key}=; max-age=0; path=/`
          }
        })
      }
    } catch {}

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
    let profileChannel: ReturnType<typeof supabase.channel> | null = null

    try {
      profileChannel = supabase
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
    } catch (e) {
      // Realtime is a nice-to-have (instant deactivation logout); a WebSocket
      // failure (blocked connection, restrictive network) must never crash
      // the app for a feature that otherwise degrades silently.
      console.warn('Realtime profile subscription failed', e)
    }

    return () => {
      active = false
      if (profileChannel) supabase.removeChannel(profileChannel)
    }
  }, [profile?.id, supabase, logout])

  return (
    <AuthContext.Provider value={{ profile, loading, isOffline, isSessionExpired, logout }}>
      {isSessionExpired && (
        <div className="bg-rose-600 text-white text-xs py-2 px-4 text-center font-medium shadow-md">
          Your offline session expired (24h limit). Please connect to the internet to sign in.
        </div>
      )}
      <ModuleProvider>{children}</ModuleProvider>
    </AuthContext.Provider>
  )
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    return { profile: null, loading: false, isOffline: false, isSessionExpired: false, logout: async () => {} }
  }
  return ctx
}

