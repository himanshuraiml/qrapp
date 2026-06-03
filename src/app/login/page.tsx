'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { studentEmail } from '@/lib/utils'

type Tab = 'staff' | 'student'

const LABELS = {
  title: 'QR Attendance',
  subtitle: 'SRMIST Tiruchirappalli Campus',
  staffAdmin: 'Staff / Admin',
  student: 'Student',
  emailAddress: 'Email Address',
  password: 'Password',
  rollNumber: 'Roll Number',
  signIn: 'Sign In',
  signingIn: 'Signing in...',
  emailPlaceholder: 'name@srmist.edu.in',
  rollPlaceholder: 'RA2311003010001',
}

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const [tab, setTab] = useState<Tab>('student')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Staff fields
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // Student fields
  const [rollNo, setRollNo] = useState('')
  const [stuPass, setStuPass] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showStuPass, setShowStuPass] = useState(false)

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

    // Fast path: role stored in JWT metadata (new accounts)
    let role = data.user.user_metadata?.role as string | undefined

    // Fallback: DB query for accounts created before metadata was added
    if (!role) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .single()
      role = profile?.role
    }

    if (!role) {
      setError('Account not configured. Contact admin.')
      setLoading(false)
      return
    }

    router.push(`/${role.toLowerCase()}`)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 relative overflow-hidden p-6">
      {/* Dynamic Background Blur Mesh - Light Version */}
      <div className="absolute top-[-10%] left-[-10%] w-[550px] h-[550px] bg-brand-100/50 rounded-full filter blur-[120px] animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[550px] h-[550px] bg-indigo-100/40 rounded-full filter blur-[120px] animate-pulse" style={{ animationDelay: '3s' }} />

      <div className="w-full max-w-md relative z-10 animate-slide-up">
        {/* Logo / Branding */}
        <div className="text-center mb-8 flex flex-col items-center">
          <img
            src="https://www.facultyplus.com/wp-content/uploads/2024/01/cropped-srm-trp-logo.png"
            alt="SRMIST Logo"
            className="h-20 w-auto object-contain mb-4 filter drop-shadow-md hover:scale-105 transition-transform duration-300"
          />
          <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight font-heading">{LABELS.title}</h1>
          <p className="text-brand-600 text-xs font-semibold mt-1 tracking-widest uppercase">{LABELS.subtitle}</p>
        </div>

        {/* Light Glassmorphic Card */}
        <div className="bg-white/80 backdrop-blur-2xl rounded-[2rem] overflow-hidden border border-white/60 shadow-[0_20px_50px_rgba(0,0,0,0.04)] transition-all duration-500">
          {/* Custom Tabs with underline highlight */}
          <div className="flex border-b border-slate-100 bg-slate-50/50 p-2 gap-1">
            {(['staff', 'student'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTab(t)
                  setError('')
                  setShowPassword(false)
                  setShowStuPass(false)
                }}
                className={`flex-1 py-3 text-sm font-semibold rounded-2xl transition-all duration-500
                  ${tab === t
                    ? 'text-white bg-gradient-to-r from-brand-600 to-indigo-600 shadow-lg shadow-brand-500/10'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'
                  }`}
              >
                {t === 'staff' ? LABELS.staffAdmin : LABELS.student}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="p-8 space-y-6">
            {tab === 'staff' ? (
              <div className="space-y-5">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                    {LABELS.emailAddress}
                  </label>
                  <input
                    type="email" required
                    value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder={LABELS.emailPlaceholder}
                    className="w-full border border-slate-200/80 rounded-xl px-4 py-3.5 text-sm bg-slate-50/50 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all duration-300"
                  />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest">
                      {LABELS.password}
                    </label>
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'} required
                      value={password} onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full border border-slate-200/80 rounded-xl pl-4 pr-11 py-3.5 text-sm bg-slate-50/50 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all duration-300"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {showPassword ? (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                    {LABELS.rollNumber}
                  </label>
                  <input
                    type="text" required
                    value={rollNo} onChange={(e) => setRollNo(e.target.value)}
                    placeholder={LABELS.rollPlaceholder}
                    className="w-full border border-slate-200/80 rounded-xl px-4 py-3.5 text-sm bg-slate-50/50 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all duration-300 uppercase"
                  />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest">
                      {LABELS.password}
                    </label>
                  </div>
                  <div className="relative">
                    <input
                      type={showStuPass ? 'text' : 'password'} required
                      value={stuPass} onChange={(e) => setStuPass(e.target.value)}
                      placeholder="••••••••"
                      className="w-full border border-slate-200/80 rounded-xl pl-4 pr-11 py-3.5 text-sm bg-slate-50/50 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all duration-300"
                    />
                    <button
                      type="button"
                      onClick={() => setShowStuPass(!showStuPass)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {showStuPass ? (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="text-xs font-bold text-red-500 bg-red-50 border border-red-200 rounded-2xl px-4 py-3 flex items-start gap-2.5 shadow-sm animate-fade-in">
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
                  <span>{LABELS.signingIn}</span>
                </>
              ) : (
                <span>{LABELS.signIn}</span>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
