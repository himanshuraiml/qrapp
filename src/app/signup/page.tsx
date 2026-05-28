'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { studentEmail } from '@/lib/utils'

type RoleTab = 'student' | 'faculty'

export default function SignupPage() {
  const router = useRouter()
  const supabase = createClient()
  const [role, setRole] = useState<RoleTab>('student')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  // Common fields
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')

  // Student specific
  const [rollNo, setRollNo] = useState('')
  const [department, setDepartment] = useState('')
  const [year, setYear] = useState('1')
  const [section, setSection] = useState('')

  // Faculty specific
  const [email, setEmail] = useState('')

  async function handleSignup(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess(false)

    const authEmail = role === 'student' ? studentEmail(rollNo) : email
    
    // Register the user
    const { data: authData, error: signupErr } = await supabase.auth.signUp({
      email: authEmail,
      password: password,
      options: {
        data: {
          name: name,
        }
      }
    })

    if (signupErr || !authData.user) {
      setError(signupErr?.message ?? 'Signup failed. Please try again.')
      setLoading(false)
      return
    }

    // Insert user into profiles table
    const profileData = {
      id: authData.user.id,
      name: name,
      role: role === 'student' ? 'Student' : 'Faculty',
      student_id: role === 'student' ? rollNo.toUpperCase() : null,
      department: department || null,
      year: role === 'student' ? parseInt(year, 10) : null,
      section: section.toUpperCase() || null,
      status: 'Active',
    }

    const { error: profileErr } = await supabase
      .from('profiles')
      .insert(profileData)

    if (profileErr) {
      setError(profileErr.message ?? 'Profile creation failed. Contact admin.')
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)
    setTimeout(() => {
      router.push('/login')
    }, 2000)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 relative overflow-hidden p-6">
      {/* Background Mesh */}
      <div className="absolute top-[-10%] left-[-10%] w-[550px] h-[550px] bg-brand-600/30 rounded-full filter blur-[120px] animate-pulse"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[550px] h-[550px] bg-indigo-600/25 rounded-full filter blur-[120px] animate-pulse" style={{ animationDelay: '3s' }}></div>

      <div className="w-full max-w-lg relative z-10 animate-slide-up">
        {/* Branding */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-600 to-indigo-600 shadow-xl shadow-brand-500/20 mb-3 transform hover:scale-105 transition-all duration-300">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight font-heading">Join QR Attendance</h1>
          <p className="text-brand-300 text-xs font-semibold mt-1 tracking-widest uppercase">Create Your Account</p>
        </div>

        {/* Card */}
        <div className="glass-dark rounded-[2rem] overflow-hidden border border-white/10 shadow-2xl transition-all duration-500">
          {/* Custom Tabs */}
          <div className="flex border-b border-white/5 bg-slate-950/40 p-2 gap-1">
            {(['student', 'faculty'] as RoleTab[]).map((r) => (
              <button
                key={r}
                onClick={() => { setRole(r); setError(''); setSuccess(false) }}
                className={`flex-1 py-3 text-sm font-semibold rounded-2xl transition-all duration-500
                  ${role === r
                    ? 'text-white bg-gradient-to-r from-brand-600/90 to-indigo-600/90 shadow-lg shadow-brand-500/10'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  }`}
              >
                {r === 'student' ? 'Student Registration' : 'Faculty / Staff'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSignup} className="p-8 space-y-5">
            {success ? (
              <div className="text-center py-6 space-y-3">
                <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center text-3xl mx-auto animate-bounce">
                  ✓
                </div>
                <h3 className="text-lg font-bold text-white">Registration Successful!</h3>
                <p className="text-sm text-slate-400">Redirecting to login portal...</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Name */}
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                      Full Name
                    </label>
                    <input
                      type="text" required
                      value={name} onChange={(e) => setName(e.target.value)}
                      placeholder="Dr. Himanshu Rai"
                      className="w-full border border-white/10 rounded-xl px-4 py-3 text-sm bg-slate-950/40 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all duration-300"
                    />
                  </div>

                  {role === 'student' ? (
                    <>
                      {/* Roll Number */}
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                          Roll Number
                        </label>
                        <input
                          type="text" required
                          value={rollNo} onChange={(e) => setRollNo(e.target.value)}
                          placeholder="RA2311003010001"
                          className="w-full border border-white/10 rounded-xl px-4 py-3 text-sm bg-slate-950/40 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all duration-300 uppercase"
                        />
                      </div>
                      {/* Department */}
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                          Department
                        </label>
                        <input
                          type="text" required
                          value={department} onChange={(e) => setDepartment(e.target.value)}
                          placeholder="CSE"
                          className="w-full border border-white/10 rounded-xl px-4 py-3 text-sm bg-slate-950/40 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all duration-300 uppercase"
                        />
                      </div>
                      {/* Year */}
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                          Year
                        </label>
                        <select
                          value={year} onChange={(e) => setYear(e.target.value)}
                          className="w-full border border-white/10 rounded-xl px-4 py-3 text-sm bg-slate-900 text-white focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all duration-300"
                        >
                          <option value="1">1st Year</option>
                          <option value="2">2nd Year</option>
                          <option value="3">3rd Year</option>
                          <option value="4">4th Year</option>
                        </select>
                      </div>
                      {/* Section */}
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                          Section
                        </label>
                        <input
                          type="text" required
                          value={section} onChange={(e) => setSection(e.target.value)}
                          placeholder="A"
                          className="w-full border border-white/10 rounded-xl px-4 py-3 text-sm bg-slate-950/40 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all duration-300 uppercase"
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Faculty Email */}
                      <div className="md:col-span-2">
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                          Academic Email
                        </label>
                        <input
                          type="email" required
                          value={email} onChange={(e) => setEmail(e.target.value)}
                          placeholder="faculty@srmist.edu.in"
                          className="w-full border border-white/10 rounded-xl px-4 py-3 text-sm bg-slate-950/40 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all duration-300"
                        />
                      </div>
                    </>
                  )}

                  {/* Password */}
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                      Password
                    </label>
                    <input
                      type="password" required
                      value={password} onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full border border-white/10 rounded-xl px-4 py-3 text-sm bg-slate-950/40 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all duration-300"
                    />
                  </div>
                </div>

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
                      <span>Creating Account...</span>
                    </>
                  ) : (
                    <span>Register Now</span>
                  )}
                </button>
              </>
            )}
          </form>

          {/* Footer */}
          <div className="p-6 bg-slate-950/30 border-t border-white/5 text-center text-xs text-slate-400">
            Already have an account?{' '}
            <Link href="/login" className="font-bold text-brand-400 hover:text-brand-300 transition-colors">
              Sign in here
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
