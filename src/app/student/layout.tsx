import NavBar from '@/components/NavBar'

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <NavBar role="Student" />
      <main className="max-w-sm mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  )
}
