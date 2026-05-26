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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-900 via-slate-900 to-slate-800 p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-600 mb-4">
            <svg className="w-9 h-9 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">QR Attendance</h1>
          <p className="text-slate-400 text-sm mt-1">SRMIST Trichy</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-slate-100">
            {(['staff', 'student'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setError('') }}
                className={`flex-1 py-3.5 text-sm font-semibold transition-colors
                  ${tab === t
                    ? 'text-brand-600 border-b-2 border-brand-600'
                    : 'text-slate-500 hover:text-slate-700'
                  }`}
              >
                {t === 'staff' ? 'Staff / Admin' : 'Student'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="p-8 space-y-5">
            {tab === 'staff' ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Email address
                  </label>
                  <input
                    type="email" required
                    value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@srmist.ac.in"
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Password
                  </label>
                  <input
                    type="password" required
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="input"
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Roll Number
                  </label>
                  <input
                    type="text" required
                    value={rollNo} onChange={(e) => setRollNo(e.target.value)}
                    placeholder="RA2311003010001"
                    className="input uppercase"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Password
                  </label>
                  <input
                    type="password" required
                    value={stuPass} onChange={(e) => setStuPass(e.target.value)}
                    placeholder="••••••••"
                    className="input"
                  />
                </div>
              </>
            )}

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                {error}
              </p>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
