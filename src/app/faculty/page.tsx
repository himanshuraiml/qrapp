'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { todayIST, formatTime, sessionColor } from '@/lib/utils'
import { readCache, writeCache, CACHE_TTL } from '@/lib/cache'
import type { AttendanceRecord } from '@/types'

export default function FacultyDashboard() {
  const { profile } = useAuth()
  const supabase = createClient()
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile) return
    const cacheKey = `faculty_scans_${profile.id}_${todayIST()}`
    const cached = readCache<AttendanceRecord[]>(cacheKey, CACHE_TTL.scans)
    if (cached) { setRecords(cached); setLoading(false); return }
    supabase
      .from('attendance')
      .select('*')
      .eq('marked_by', profile.id)
      .eq('date', todayIST())
      .order('timestamp', { ascending: false })
      .then(({ data }) => {
        const rows = data ?? []
        writeCache(cacheKey, rows)
        setRecords(rows)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [profile])

  const fnCount = records.filter((r) => r.session.startsWith('FN')).length
  const anCount = records.filter((r) => r.session.startsWith('AN')).length

  const words = profile?.name?.split(' ') ?? []
  const greeting = /^(Dr|Prof|Mr|Mrs|Ms)\.?$/i.test(words[0] ?? '')
    ? `${words[0]} ${words[1] ?? ''}`.trim()
    : words[0] ?? ''

  return (
    <div className="space-y-8 animate-fade-in pb-10">
      <div className="glass p-6 rounded-2xl">
        <h1 className="text-3xl font-bold text-slate-900">Welcome, {greeting}</h1>
        <p className="text-sm font-medium text-slate-500 mt-1">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' })}</p>
      </div>

      {/* Scan CTA */}
      <Link
        href="/faculty/scan"
        className="flex items-center justify-between card bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500
                   text-white transition-all duration-300 transform hover:-translate-y-1 hover:shadow-xl cursor-pointer border-0 p-8 shadow-brand-500/20"
      >
        <div>
          <p className="font-bold text-2xl tracking-tight">Scan QR Codes</p>
          <p className="text-brand-100 text-sm mt-1 font-medium">Tap to open camera scanner</p>
        </div>
        <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md">
          <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
              d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
          </svg>
        </div>
      </Link>

      {/* Today's counts */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card text-center p-4">
          <p className="text-2xl font-bold text-slate-900">{records.length}</p>
          <p className="text-xs text-slate-500 mt-1">Total Today</p>
        </div>
        <div className="card text-center p-4">
          <p className="text-2xl font-bold text-blue-600">{fnCount}</p>
          <p className="text-xs text-slate-500 mt-1">FN Scans</p>
        </div>
        <div className="card text-center p-4">
          <p className="text-2xl font-bold text-amber-600">{anCount}</p>
          <p className="text-xs text-slate-500 mt-1">AN Scans</p>
        </div>
      </div>

      {/* Recent scans */}
      <div className="card">
        <h2 className="text-base font-semibold text-slate-800 mb-4">Today's Scans</h2>
        {loading ? (
          <p className="text-sm text-slate-400 text-center py-6">Loading…</p>
        ) : records.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">No scans yet today.</p>
        ) : (
          <div className="space-y-2">
            {records.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                <div>
                  <p className="text-sm font-medium text-slate-800">{r.student_name}</p>
                  <p className="text-xs text-slate-400">{r.student_id} · {r.department} {r.year}{r.section}</p>
                </div>
                <div className="text-right">
                  <span className={`badge ${sessionColor(r.session)}`}>{r.session}</span>
                  <p className="text-xs text-slate-400 mt-1">{formatTime(r.timestamp)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
