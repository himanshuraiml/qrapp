import Link from 'next/link'

// Public self-registration was removed as part of a security fix: every
// account (Student and Faculty) is provisioned by an Admin via the admin
// portal, which creates the Supabase Auth user and profile row atomically.
// The old self-signup form let anyone create a bare auth.users account with
// no profile — profile creation always failed under RLS, but the orphan
// auth account was still valid and had a real UUID, which was exactly the
// foothold used in the reported VAPT (Vulnerability 3: "Self-Registration
// UUID Bypass"). Removing this page closes that door entirely.
export default function SignupPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 relative overflow-hidden p-6">
      <div className="absolute top-[-10%] left-[-10%] w-[550px] h-[550px] bg-brand-600/30 rounded-full filter blur-[120px] animate-pulse"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[550px] h-[550px] bg-indigo-600/25 rounded-full filter blur-[120px] animate-pulse" style={{ animationDelay: '3s' }}></div>

      <div className="w-full max-w-md relative z-10 animate-slide-up">
        <div className="glass-dark rounded-[2rem] overflow-hidden border border-white/10 shadow-2xl p-8 text-center space-y-4">
          <h1 className="text-2xl font-extrabold text-white tracking-tight font-heading">Registration is managed by your Admin</h1>
          <p className="text-sm text-slate-400">
            Student and Faculty accounts are created by the administrator. Please contact your department admin to get your login credentials.
          </p>
          <Link
            href="/login"
            className="inline-block w-full py-3.5 rounded-2xl text-white font-bold bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 transition-all duration-300 shadow-xl shadow-brand-500/20 active:scale-[0.98]"
          >
            Go to Login
          </Link>
        </div>
      </div>
    </div>
  )
}
