'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { studentEmail } from '@/lib/utils'

type Tab = 'staff' | 'student'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const [tab, setTab]         = useState<Tab>('staff')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  // Staff fields
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  // Student fields
  const [rollNo, setRollNo]     = useState('')
  const [stuPass, setStuPass]   = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const authEmail    = tab === 'staff' ? email : studentEmail(rollNo)
    const authPassword = tab === 'staff' ? password : stuPass

    const { data, error: authErr } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password: authPassword,
    })

    if (authErr || !data.user) {
      setError(authErr?.message ?? 'Login failed. Check your credentials.')
      setLoading(false)
      return
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .single()

    if (!profile?.role) {
      setError('Account not configured. Contact admin.')
      setLoading(false)
      return
    }

    router.push(`/${profile.role.toLowerCase()}`)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 relative overflow-hidden p-4">
      {/* Decorative Background Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-brand-600 rounded-full mix-blend-screen filter blur-[100px] opacity-20 animate-pulse"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-indigo-600 rounded-full mix-blend-screen filter blur-[100px] opacity-20 animate-pulse" style={{ animationDelay: '2s' }}></div>

      <div className="w-full max-w-md relative z-10 animate-slide-up">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-lg shadow-brand-500/30 mb-5">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">QR Attendance</h1>
          <p className="text-slate-400 text-sm mt-2 font-medium tracking-wide uppercase">SRMIST Trichy</p>
        </div>

        {/* Card */}
        <div className="glass-dark rounded-3xl overflow-hidden shadow-2xl">
          {/* Tabs */}
          <div className="flex border-b border-white/10 bg-white/5">
            {(['staff', 'student'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setError('') }}
                className={`flex-1 py-4 text-sm font-semibold transition-all duration-300
                  ${tab === t
                    ? 'text-white border-b-2 border-brand-500 bg-white/10'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  }`}
              >
                {t === 'staff' ? 'Staff / Admin' : 'Student'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="p-8 space-y-6">
            {tab === 'staff' ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Email address
                  </label>
                  <input
                    type="email" required
                    value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@srmist.ac.in"
                    className="w-full border border-white/20 rounded-xl px-4 py-3 text-sm bg-black/20 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all duration-300"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Password
                  </label>
                  <input
                    type="password" required
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full border border-white/20 rounded-xl px-4 py-3 text-sm bg-black/20 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all duration-300"
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Roll Number
                  </label>
                  <input
                    type="text" required
                    value={rollNo} onChange={(e) => setRollNo(e.target.value)}
                    placeholder="RA2311003010001"
                    className="w-full border border-white/20 rounded-xl px-4 py-3 text-sm bg-black/20 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all duration-300 uppercase"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Password
                  </label>
                  <input
                    type="password" required
                    value={stuPass} onChange={(e) => setStuPass(e.target.value)}
                    placeholder="••••••••"
                    className="w-full border border-white/20 rounded-xl px-4 py-3 text-sm bg-black/20 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all duration-300"
                  />
                </div>
              </>
            )}

            {error && (
              <p className="text-sm text-red-400 bg-red-950/50 border border-red-900/50 rounded-xl px-4 py-3 backdrop-blur-md">
                {error}
              </p>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full py-3.5 text-base shadow-[0_0_20px_rgba(59,130,246,0.3)]">
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
