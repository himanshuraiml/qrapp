'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import type { UserRole } from '@/types'

const NAV_LINKS: Record<UserRole, Array<{ label: string; href: string }>> = {
  Admin: [
    { label: 'Dashboard', href: '/admin' },
    { label: 'Reports',   href: '/admin/reports' },
    { label: 'Students',  href: '/admin/students' },
    { label: 'Faculty',   href: '/admin/faculty' },
    { label: 'Settings',  href: '/admin/settings' },
  ],
  Faculty: [
    { label: 'Dashboard', href: '/faculty' },
    { label: 'Scan QR',   href: '/faculty/scan' },
  ],
  Student: [
    { label: 'My QR & Attendance', href: '/student' },
  ],
}

const ROLE_COLORS: Record<UserRole, string> = {
  Admin:   'bg-brand-600',
  Faculty: 'bg-emerald-600',
  Student: 'bg-amber-600',
}

export default function NavBar({ role }: { role: UserRole }) {
  const { profile, logout } = useAuth()
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const links = NAV_LINKS[role]

  // Automatic logout on tab-switch inactivity (5 min)
  useEffect(() => {
    if (!profile) return

    // Detect tab-switch inactivity
    let visibilityTimeoutId: NodeJS.Timeout | null = null

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // Start 5-minute logout timer (300,000 ms)
        visibilityTimeoutId = setTimeout(() => {
          logout()
        }, 5 * 60 * 1000)
      } else if (document.visibilityState === 'visible') {
        // Returned before timeout -> cancel logout timer
        if (visibilityTimeoutId) {
          clearTimeout(visibilityTimeoutId)
          visibilityTimeoutId = null
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (visibilityTimeoutId) {
        clearTimeout(visibilityTimeoutId)
      }
    }
  }, [profile, logout])

  return (
    <nav className="bg-white/80 backdrop-blur-xl border-b border-white/40 shadow-sm sticky top-0 z-30 transition-all duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">

          {/* Logo + role badge */}
          <div className="flex items-center gap-3">
            <Link href={`/${role.toLowerCase()}`} className="flex items-center gap-2">
              <img
                src="https://www.facultyplus.com/wp-content/uploads/2024/01/cropped-srm-trp-logo.png"
                alt="SRMIST Logo"
                className="h-7 w-auto object-contain filter drop-shadow-sm hover:scale-105 transition-transform duration-300"
              />
              <span className="font-semibold text-slate-800 text-sm hidden sm:block">QR Attendance</span>
            </Link>
            <span className={cn('badge text-white text-xs hidden sm:inline-flex', ROLE_COLORS[role])}>
              {role}
            </span>
          </div>

          {/* Desktop nav links */}
          <div className="hidden sm:flex items-center gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-300',
                  pathname === l.href
                    ? 'bg-brand-600 text-white shadow-md shadow-brand-500/20 font-bold'
                    : 'text-slate-600 hover:bg-brand-50 hover:text-brand-600 font-semibold'
                )}
              >
                {l.label}
              </Link>
            ))}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-slate-700 hidden sm:block truncate max-w-[160px]">
              {profile?.name}
            </span>
            <Link
              href="/change-password"
              className="text-xs font-bold text-brand-600 hover:text-brand-700 px-3 py-1.5 rounded-lg bg-brand-50 hover:bg-brand-100 transition-all duration-300"
            >
              🔑 Password
            </Link>
            <button
              onClick={logout}
              className="text-xs font-bold text-slate-500 hover:text-slate-800 px-3 py-1.5
                         rounded-lg hover:bg-slate-100 transition-all duration-300 border border-slate-200/50"
            >
              Sign out
            </button>
            {/* Mobile menu toggle */}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="sm:hidden p-2 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <div className="w-5 h-4 flex flex-col justify-between">
                <span className={cn('block h-0.5 bg-slate-600 transition-all', menuOpen && 'rotate-45 translate-y-1.5')} />
                <span className={cn('block h-0.5 bg-slate-600 transition-all', menuOpen && 'opacity-0')} />
                <span className={cn('block h-0.5 bg-slate-600 transition-all', menuOpen && '-rotate-45 -translate-y-1.5')} />
              </div>
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        {menuOpen && (
          <div className="sm:hidden border-t border-slate-100 py-2 space-y-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setMenuOpen(false)}
                className={cn(
                  'block px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  pathname === l.href
                    ? 'bg-brand-600 text-white font-bold'
                    : 'text-slate-600 hover:bg-brand-50 hover:text-brand-600 font-semibold'
                )}
              >
                {l.label}
              </Link>
            ))}
            <div className="border-t border-slate-100 pt-2 mt-2 space-y-1">
              <p className="px-3 py-1 text-xs text-slate-400 font-bold">{profile?.name}</p>
              <Link
                href="/change-password"
                onClick={() => setMenuOpen(false)}
                className="block px-3 py-2 rounded-lg text-xs font-bold text-brand-600 bg-brand-50 hover:bg-brand-100 transition-colors mx-3"
              >
                🔑 Change Password
              </Link>
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
