import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    }
  )

  // Validate the user (refreshes token if needed) then return the session
  // so the browser client can re-hydrate via supabase.auth.setSession().
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ userId: null, accessToken: null, refreshToken: null })
  }
  const { data: { session } } = await supabase.auth.getSession()
  return NextResponse.json({
    userId: user.id,
    accessToken: session?.access_token ?? null,
    refreshToken: session?.refresh_token ?? null,
  })
}
