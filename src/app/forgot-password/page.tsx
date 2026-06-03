'use client'

import { useState, FormEvent } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { studentEmail } from '@/lib/utils'

type Mode = 'staff' | 'student'

export default function ForgotPasswordPage() {
  const supabase = createClient()
  const [mode, setMode] = useState<Mode>('student')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  // Fields
  const [email, setEmail] = useState('')
  const [rollNo, setRollNo] = useState('')

  async function handleReset(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess(false)

    const resetEmail = mode === 'student' ? studentEmail(rollNo) : email

    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/auth/callback?next=/shared/change-password`,
    })

    if (resetErr) {
      setError(resetErr.message ?? 'Failed to send password reset request.')
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 relative overflow-hidden p-6">
      {/* Background Mesh */}
      <div className="absolute top-[-10%] left-[-10%] w-[550px] h-[550px] bg-brand-600/30 rounded-full filter blur-[120px] animate-pulse"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[550px] h-[550px] bg-indigo-600/25 rounded-full filter blur-[120px] animate-pulse" style={{ animationDelay: '3s' }}></div>

      <div className="w-full max-w-md relative z-10 animate-slide-up">
        {/* Branding */}
        <div className="text-center mb-6 flex flex-col items-center">
          <img
            src="https://www.facultyplus.com/wp-content/uploads/2024/01/cropped-srm-trp-logo.png"
            alt="SRMIST Logo"
            className="h-16 w-auto object-contain mb-3 bg-white/10 backdrop-blur-sm p-2 rounded-2xl border border-white/10 hover:scale-105 transition-transform duration-300"
          />
          <h1 className="text-3xl font-extrabold text-white tracking-tight font-heading">Reset Password</h1>
          <p className="text-brand-300 text-xs font-semibold mt-1 tracking-widest uppercase">SRMIST Tiruchirappalli Campus</p>
        </div>

        {/* Card */}
        <div className="glass-dark rounded-[2rem] overflow-hidden border border-white/10 shadow-2xl transition-all duration-500">
          <div className="p-8 space-y-6">
            {success ? (
              <div className="text-center space-y-4 py-4 animate-fade-in">
                <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center text-3xl mx-auto mb-2">
                  ✓
                </div>
                <h3 className="text-lg font-bold text-white">Reset Link Sent</h3>
                <p className="text-sm text-slate-400">
                  If an account exists for that email or roll number, a password reset link has been dispatched.
                </p>
                <div className="pt-4">
                  <Link href="/login" className="btn-primary inline-block w-full py-3.5 text-center text-sm">
                    Back to Login
                  </Link>
                </div>
              </div>
            ) : (
              <form onSubmit={handleReset} className="space-y-6">
                <div className="flex border-b border-white/5 bg-slate-950/40 p-2 gap-1 rounded-2xl">
                  <button
                    type="button"
                    onClick={() => setMode('student')}
                    className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all duration-300
                      ${mode === 'student' ? 'bg-white/10 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    Student
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('staff')}
                    className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all duration-300
                      ${mode === 'staff' ? 'bg-white/10 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    Staff / Admin
                  </button>
                </div>

                <p className="text-xs text-slate-400 text-center font-medium leading-relaxed">
                  Enter your credentials below and we will send a password reset verification link to your registered email account.
                </p>

                {mode === 'student' ? (
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
                ) : (
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
                      <span>Requesting link...</span>
                    </>
                  ) : (
                    <span>Send Reset Instructions</span>
                  )}
                </button>
              </form>
            )}
          </div>

          {/* Footer */}
          <div className="p-6 bg-slate-950/30 border-t border-white/5 text-center text-xs text-slate-400">
            Remembered your credentials?{' '}
            <Link href="/login" className="font-bold text-brand-400 hover:text-brand-300 transition-colors">
              Sign in here
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
