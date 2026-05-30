import NavBar from '@/components/NavBar'
import { AuthProvider } from '@/components/AuthProvider'
import { getSessionHandoff } from '@/lib/supabase/sessionHandoff'

export default async function FacultyLayout({ children }: { children: React.ReactNode }) {
  const handoff = await getSessionHandoff()
  return (
    <AuthProvider {...handoff}>
      <div className="min-h-screen bg-slate-50">
        <NavBar role="Faculty" />
        <main className="max-w-2xl mx-auto px-4 py-8">
          {children}
        </main>
      </div>
    </AuthProvider>
  )
}
