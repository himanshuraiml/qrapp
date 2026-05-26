'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types'

export function useAuth() {
  const supabase = createClient()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    setProfile(data ?? null)
  }, [supabase])

  useEffect(() => {
    let active = true

    // Fetch initial user state
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!active) return
      if (user) {
        fetchProfile(user.id).finally(() => {
          if (active) setLoading(false)
        })
      } else {
        setLoading(false)
      }
    })

    // Listen to subsequent auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!active) return
        if (session?.user) {
          await fetchProfile(session.user.id)
        } else {
          setProfile(null)
        }
        setLoading(false)
      }
    )

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [fetchProfile, supabase])

  async function logout() {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('tab_session_active')
    }
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return { profile, loading, logout }
}

