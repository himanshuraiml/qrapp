'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { studentEmail } from '@/lib/utils'

type Tab = 'staff' | 'student'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const [tab, setTab] = useState<Tab>('staff')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Staff fields
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // Student fields
  const [rollNo, setRollNo] = useState('')
  const [stuPass, setStuPass] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const authEmail = tab === 'staff' ? email : studentEmail(rollNo)
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
    <div className="min-h-screen flex items-center justify-center bg-slate-900 relative overflow-hidden p-6">
      {/* Dynamic Background Blur Mesh */}
      <div className="absolute top-[-10%] left-[-10%] w-[550px] h-[550px] bg-brand-600/30 rounded-full filter blur-[120px] animate-pulse"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[550px] h-[550px] bg-indigo-600/25 rounded-full filter blur-[120px] animate-pulse" style={{ animationDelay: '3s' }}></div>

      <div className="w-full max-w-md relative z-10 animate-slide-up">
        {/* Logo / Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-600 to-indigo-600 shadow-xl shadow-brand-500/20 mb-4 transform hover:scale-105 transition-all duration-300">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight font-heading">QR Attendance</h1>
          <p className="text-brand-300 text-xs font-semibold mt-1 tracking-widest uppercase">SRMIST Trichy</p>
        </div>

        {/* glass-dark Card */}
        <div className="glass-dark rounded-[2rem] overflow-hidden border border-white/10 shadow-2xl transition-all duration-500">
          {/* Custom Tabs with underline highlight */}
          <div className="flex border-b border-white/5 bg-slate-950/40 p-2 gap-1">
            {(['staff', 'student'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setError('') }}
                className={`flex-1 py-3 text-sm font-semibold rounded-2xl transition-all duration-500
                  ${tab === t
                    ? 'text-white bg-gradient-to-r from-brand-600/90 to-indigo-600/90 shadow-lg shadow-brand-500/10'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  }`}
              >
                {t === 'staff' ? 'Staff / Admin' : 'Student'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="p-8 space-y-6">
            {tab === 'staff' ? (
              <div className="space-y-5">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                    Email Address
                  </label>
                  <input
                    type="email" required
                    value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@srmist.edu.in"
                    className="w-full border border-white/10 rounded-xl px-4 py-3.5 text-sm bg-slate-950/40 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all duration-300"
                  />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest">
                      Password
                    </label>
                    <Link href="/forgot-password" className="text-xs font-semibold text-brand-400 hover:text-brand-300 transition-colors">
                      Forgot?
                    </Link>
                  </div>
                  <input
                    type="password" required
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full border border-white/10 rounded-xl px-4 py-3.5 text-sm bg-slate-950/40 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all duration-300"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                    Roll Number
                  </label>
                  <input
                    type="text" required
                    value={rollNo} onChange={(e) => setRollNo(e.target.value)}
                    placeholder="RA2311003010001"
                    className="w-full border border-white/10 rounded-xl px-4 py-3.5 text-sm bg-slate-950/40 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all duration-300 uppercase"
                  />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest">
                      Password
                    </label>
                    <Link href="/forgot-password" className="text-xs font-semibold text-brand-400 hover:text-brand-300 transition-colors">
                      Forgot?
                    </Link>
                  </div>
                  <input
                    type="password" required
                    value={stuPass} onChange={(e) => setStuPass(e.target.value)}
                    placeholder="••••••••"
                    className="w-full border border-white/10 rounded-xl px-4 py-3.5 text-sm bg-slate-950/40 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all duration-300"
                  />
                </div>
              </div>
            )}

            {error && (
              <div className="text-sm text-red-400 bg-red-950/40 border border-red-500/20 rounded-2xl px-4 py-3 backdrop-blur-md animate-fade-in flex items-start gap-2.5">
                <span className="text-base mt-0.5">⚠️</span>
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 rounded-2xl text-white font-bold bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 transition-all duration-300 shadow-xl shadow-brand-500/20 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  <span>Signing in...</span>
                </>
              ) : (
                <span>Sign In</span>
              )}
            </button>
          </form>

          {/* Card Footer */}
          <div className="p-6 bg-slate-950/30 border-t border-white/5 text-center text-xs text-slate-400">
            Need an account?{' '}
            <Link href="/signup" className="font-bold text-brand-400 hover:text-brand-300 transition-colors">
              Sign up here
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
