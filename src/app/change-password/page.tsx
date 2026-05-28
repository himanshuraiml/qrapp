'use client'

import { useState, FormEvent, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import NavBar from '@/components/NavBar'

export default function ChangePasswordPage() {
  const router = useRouter()
  const { profile, loading: authLoading } = useAuth()
  const supabase = createClient()
  
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  // Redirect to login if not authenticated after loading is done
  useEffect(() => {
    if (!authLoading && !profile) {
      router.push('/login')
    }
  }, [authLoading, profile, router])

  if (authLoading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <span className="w-8 h-8 border-3 border-brand-600 border-t-transparent rounded-full animate-spin"></span>
      </div>
    )
  }

  async function handlePasswordChange(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess(false)

    if (password !== confirmPassword) {
      setError('New passwords do not match.')
      setLoading(false)
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.')
      setLoading(false)
      return
    }

    const { error: updateErr } = await supabase.auth.updateUser({
      password: password,
    })

    if (updateErr) {
      setError(updateErr.message ?? 'Failed to update password.')
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)
    setPassword('')
    setConfirmPassword('')
    
    // Redirect back to role dashboard after 2 seconds
    setTimeout(() => {
      router.push(`/${profile.role.toLowerCase()}`)
    }, 2000)
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <NavBar role={profile.role} />
      
      <main className="max-w-md mx-auto px-4 py-12 animate-slide-up">
        {/* Change Password Card */}
        <div className="card-premium relative overflow-hidden bg-white border-slate-100 shadow-2xl p-8 rounded-[2rem]">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-brand-600 to-indigo-600"></div>
          
          <div className="space-y-1 mb-6 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 shadow-sm text-2xl mb-2">
              🔒
            </div>
            <h1 className="text-xl font-extrabold text-slate-800 font-heading">Update Password</h1>
            <p className="text-xs text-slate-400 font-medium">Keep your SRMIST attendance portal secure</p>
          </div>

          <form onSubmit={handlePasswordChange} className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                New Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 6 characters"
                className="w-full border border-slate-200/80 rounded-xl px-4 py-3 text-xs bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all duration-300"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                Confirm New Password
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat password"
                className="w-full border border-slate-200/80 rounded-xl px-4 py-3 text-xs bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all duration-300"
              />
            </div>

            {error && (
              <div className="text-xs font-bold text-red-500 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
                ⚠️ {error}
              </div>
            )}

            {success && (
              <div className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 text-center">
                ✓ Password updated successfully! Redirecting...
              </div>
            )}

            <div className="flex gap-3 pt-3 border-t border-slate-100">
              <button
                type="submit"
                disabled={loading}
                className="btn-primary flex-1 text-xs font-bold py-2.5 shadow-md shadow-brand-500/10 active:scale-95"
              >
                {loading ? 'Updating...' : 'Update Password'}
              </button>
              <button
                type="button"
                onClick={() => router.push(`/${profile.role.toLowerCase()}`)}
                className="btn-secondary text-xs font-bold py-2.5"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}
