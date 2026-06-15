import { createClient } from '@supabase/supabase-js'

// Uses the service role key — only call from API Routes / Server Actions.
// NEVER import this file in client components or pages.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function getAuthUserByEmail(admin: any, email: string) {
  let page = 1
  const perPage = 1000
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage,
    })
    if (error) throw error
    if (!data.users || data.users.length === 0) break
    const user = data.users.find(
      (u: any) => u.email?.toLowerCase() === email.toLowerCase()
    )
    if (user) return user
    if (data.users.length < perPage) break
    page++
  }
  return null
}

