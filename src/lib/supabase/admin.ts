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
