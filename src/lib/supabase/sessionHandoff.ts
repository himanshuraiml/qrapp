import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/types'

export interface SessionHandoff {
  initialProfile: Profile | null
  initialUserId: string | null
  initialAccessToken: string | null
  initialRefreshToken: string | null
}

// Reads the server-validated session + profile so a section layout can hand
// it off to the client <AuthProvider>. Middleware has already enforced auth
// and the role for these routes, so this is a straight read.
export async function getSessionHandoff(): Promise<SessionHandoff> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { initialProfile: null, initialUserId: null, initialAccessToken: null, initialRefreshToken: null }
  }

  const [{ data: profile }, { data: { session } }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.auth.getSession(),
  ])

  return {
    initialProfile: (profile as Profile) ?? null,
    initialUserId: user.id,
    initialAccessToken: session?.access_token ?? null,
    initialRefreshToken: session?.refresh_token ?? null,
  }
}
