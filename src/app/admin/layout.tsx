import NavBar from '@/components/NavBar'
import { AuthProvider } from '@/components/AuthProvider'
import { getSessionHandoff } from '@/lib/supabase/sessionHandoff'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const handoff = await getSessionHandoff()
  return (
    <AuthProvider {...handoff}>
      <div className="min-h-screen bg-slate-50">
        <NavBar role="Admin" />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
      </div>
    </AuthProvider>
  )
}
