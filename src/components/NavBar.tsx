'use client'

import { useState } from 'react'
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

  return (
    <nav className="bg-white border-b border-slate-100 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">

          {/* Logo + role badge */}
          <div className="flex items-center gap-3">
            <Link href={`/${role.toLowerCase()}`} className="flex items-center gap-2">
              <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold', ROLE_COLORS[role])}>
                QR
              </div>
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
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                  pathname === l.href
                    ? 'bg-brand-50 text-brand-600'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                )}
              >
                {l.label}
              </Link>
            ))}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500 hidden sm:block truncate max-w-[160px]">
              {profile?.name}
            </span>
            <button
              onClick={logout}
              className="text-sm text-slate-500 hover:text-slate-900 px-3 py-1.5
                         rounded-lg hover:bg-slate-100 transition-colors"
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
                    ? 'bg-brand-50 text-brand-600'
                    : 'text-slate-600 hover:bg-slate-50'
                )}
              >
                {l.label}
              </Link>
            ))}
            <div className="border-t border-slate-100 pt-2 mt-2">
              <p className="px-3 py-1 text-xs text-slate-400">{profile?.name}</p>
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
