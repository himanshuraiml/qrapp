import { AuthProvider } from '@/components/AuthProvider'
import { getSessionHandoff } from '@/lib/supabase/sessionHandoff'

export default async function ChangePasswordLayout({ children }: { children: React.ReactNode }) {
  const handoff = await getSessionHandoff()
  return <AuthProvider {...handoff}>{children}</AuthProvider>
}
