import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/types'

export interface SessionHandoff {
  initialProfile: Profile | null
  initialUserId: string | null
}

// Reads the server-validated session + profile so a section layout can hand
// it off to the client <AuthProvider>. Middleware has already enforced auth
// and the role for these routes, so this is a straight read.
// Raw tokens are intentionally NOT passed down as props to avoid leaking them in RSC flight payloads.
export async function getSessionHandoff(): Promise<SessionHandoff> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { initialProfile: null, initialUserId: null }
  }

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()

  return {
    initialProfile: (profile as Profile) ?? null,
    initialUserId: user.id,
  }
}
