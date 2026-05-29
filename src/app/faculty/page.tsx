'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { todayIST, formatTime, sessionColor } from '@/lib/utils'
import type { AttendanceRecord } from '@/types'
import AboutApp from '@/components/AboutApp'

export default function FacultyDashboard() {
  const { profile, loading: authLoading } = useAuth()
  const supabase = createClient()
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    if (authLoading) return
    if (!profile) { setLoading(false); return }
    setLoading(true)
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('attendance')
          .select('*')
          .eq('marked_by', profile.id)
          .eq('date', todayIST())
          .order('timestamp', { ascending: false })
        if (error) console.error('Faculty fetch error:', error)
        setRecords(data ?? [])
      } finally {
        setLoading(false)
      }
    })()
  }, [profile, authLoading, supabase])

  const fnCount = records.filter((r) => r.session.startsWith('FN')).length
  const anCount = records.filter((r) => r.session.startsWith('AN')).length

  const words = profile?.name?.split(' ') ?? []
  const greeting = /^(Dr|Prof|Mr|Mrs|Ms)\.?$/i.test(words[0] ?? '')
    ? `${words[0]} ${words[1] ?? ''}`.trim()
    : words[0] ?? ''

  const initials = profile?.name
    ? profile.name
        .split(' ')
        .filter(Boolean)
        .map((w) => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'FC'

  // Filter records based on search query
  const filteredRecords = records.filter(r => 
    r.student_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.student_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.department.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="space-y-8 animate-fade-in pb-12 max-w-4xl mx-auto px-4 md:px-0">
      {/* Faculty Welcoming Header */}
      <div className="card-premium relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 border border-white/10 shadow-2xl p-6 sm:p-8 rounded-[2rem]">
        <div className="absolute top-[-50%] right-[-10%] w-[350px] h-[350px] bg-brand-500/10 rounded-full blur-[80px] pointer-events-none"></div>
        <div className="absolute bottom-[-50%] left-[-10%] w-[300px] h-[300px] bg-indigo-500/10 rounded-full blur-[70px] pointer-events-none"></div>
        
        <div className="relative z-10 flex flex-col sm:flex-row items-center sm:items-start md:items-center justify-between gap-6">
          {/* Left Side: Avatar + Info */}
          <div className="flex flex-col sm:flex-row items-center sm:items-start md:items-center gap-5 text-center sm:text-left">
            {/* Avatar Initials Circle */}
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br from-indigo-600/20 to-brand-600/30 border-2 border-white/15 flex items-center justify-center text-white text-2xl sm:text-3xl font-extrabold shadow-inner shadow-brand-500/20 transition-all duration-300 hover:scale-105 select-none">
              {initials}
            </div>
            
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/10 border border-brand-500/25 text-brand-300 text-[10px] sm:text-xs font-bold uppercase tracking-wider">
                <span>🏫</span> SRMIST Tiruchirappalli Campus Faculty Control
              </div>
              
              <div className="space-y-1">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight font-heading leading-tight">Welcome, {greeting}</h1>
                
                {/* Responsive Badges */}
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-2">
                  <span className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/5 text-[10px] sm:text-xs font-bold text-slate-300">
                    {profile?.department ?? 'Department of CSE'}
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/5 text-[10px] sm:text-xs font-bold text-brand-300">
                    📅 {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}
                  </span>
                </div>
              </div>
            </div>
          </div>
          
          {/* Right Side: Status Badge */}
          <div className="w-full sm:w-auto text-center sm:text-right flex flex-col items-center sm:items-end justify-center">
            <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 px-4 py-2.5 rounded-2xl shadow-lg shadow-emerald-500/5">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span className="text-xs font-bold text-emerald-400 tracking-wide uppercase">Scans Online</span>
            </div>
          </div>
        </div>
      </div>

      {/* Large Neon Scan CTA Banner */}
      <Link
        href="/faculty/scan"
        className="block relative overflow-hidden rounded-[2rem] p-8 bg-gradient-to-br from-brand-600 via-brand-500 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 shadow-xl shadow-brand-500/20 text-white group cursor-pointer transition-all duration-500 transform hover:-translate-y-1"
      >
        {/* Decorative elements */}
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-white/10 to-transparent skew-x-12 transform group-hover:translate-x-10 transition-transform duration-1000"></div>
        <div className="absolute -bottom-16 -left-16 w-32 h-32 bg-white/10 rounded-full blur-xl group-hover:scale-125 transition-transform duration-700"></div>

        <div className="flex items-center justify-between relative z-10">
          <div className="space-y-1">
            <h3 className="font-extrabold text-2xl tracking-tight font-heading">Mark Live Attendance</h3>
            <p className="text-brand-100 text-sm font-medium">Launch the high-speed camera scanner to read student QR codes</p>
          </div>
          <div className="w-16 h-16 bg-white/10 border border-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md group-hover:scale-110 transition-transform duration-500 shadow-lg">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
          </div>
        </div>
      </Link>

      {/* Quick Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="card text-center p-6 space-y-2 flex flex-col justify-between">
          <div className="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center mx-auto text-lg">📁</div>
          <div>
            <p className="text-3xl font-extrabold text-slate-800 font-heading">{records.length}</p>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Total Today</p>
          </div>
        </div>
        <div className="card text-center p-6 space-y-2 flex flex-col justify-between">
          <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center mx-auto text-lg">🌅</div>
          <div>
            <p className="text-3xl font-extrabold text-blue-600 font-heading">{fnCount}</p>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Forenoon Scans</p>
          </div>
        </div>
        <div className="card text-center p-6 space-y-2 flex flex-col justify-between">
          <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center mx-auto text-lg">🌇</div>
          <div>
            <p className="text-3xl font-extrabold text-amber-600 font-heading">{anCount}</p>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Afternoon Scans</p>
          </div>
        </div>
      </div>

      {/* Today's scan search and records table */}
      <div className="card space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-sm font-extrabold text-slate-800 font-heading">Today's Scanned Students</h3>
            <p className="text-xs text-slate-400">Search and filter active classroom logs</p>
          </div>

          <div className="w-full sm:max-w-xs relative">
            <input
              type="text"
              placeholder="Search student or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-4 py-2 text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            />
            <span className="absolute right-3 top-2.5 text-xs text-slate-400">🔍</span>
          </div>
        </div>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center space-y-2">
            <span className="w-8 h-8 border-3 border-brand-600 border-t-transparent rounded-full animate-spin"></span>
            <span className="text-xs text-slate-400 font-medium">Fetching scanned lists...</span>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="text-center py-12 space-y-2">
            <span className="text-3xl">📭</span>
            <p className="text-xs font-bold text-slate-400">No scanned attendance logs matching filter</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 max-h-[350px] overflow-y-auto pr-2 space-y-3.5">
            {filteredRecords.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-3.5 first:pt-0 border-b border-slate-50 last:border-0 hover:bg-slate-50/50 px-2 rounded-xl transition-all duration-300">
                <div className="space-y-1">
                  <p className="text-xs font-bold text-slate-800">{r.student_name}</p>
                  <p className="text-[10px] text-slate-500 font-medium">
                    <span className="font-mono text-brand-600 bg-brand-50/60 px-1.5 py-0.5 rounded-md font-bold">{r.student_id}</span>
                    <span className="mx-1.5 text-slate-300">|</span>
                    <span>{r.department} · Year {r.year} · Sec {r.section}</span>
                  </p>
                </div>
                <div className="text-right space-y-1">
                  <span className={`badge ${sessionColor(r.session)} text-[10px]`}>{r.session}</span>
                  <p className="text-[10px] text-slate-400 font-semibold">{formatTime(r.timestamp)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AboutApp />
    </div>
  )
}
