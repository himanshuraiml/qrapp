'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { todayIST, formatTime, sessionColor } from '@/lib/utils'
import type { AttendanceRecord } from '@/types'
import AboutApp from '@/components/AboutApp'
import { useRouter } from 'next/navigation'
import { useModule } from '@/context/ModuleContext'
import CdcDashboard from '@/modules/cdc/components/CdcDashboard'
import PlacementsDashboard from '@/modules/placements/components/PlacementsDashboard'
import ModuleShell from '@/components/shell/ModuleShell'

function FacultyTrainingView() {
  const { profile, loading: authLoading } = useAuth()
  const supabase = createClient()

  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  // Batch & Restriction states
  const [facultyProfile, setFacultyProfile] = useState<any>(null)
  const [restrictFaculty, setRestrictFaculty] = useState(false)
  const [batchVenue, setBatchVenue] = useState<string | null>(null)
  const [batchesList, setBatchesList] = useState<string[]>([])
  const [updatingBatch, setUpdatingBatch] = useState(false)

  const fetchVenue = useCallback(async (batchName: string) => {
    const { data } = await supabase
      .from('batch_venues')
      .select('venue')
      .eq('batch', batchName)
      .maybeSingle()
    if (data) setBatchVenue(data.venue)
    else setBatchVenue(null)
  }, [supabase])

  useEffect(() => {
    if (authLoading || !profile) return

    // Load faculty profile details
    supabase
      .from('profiles')
      .select('id, name, department, status, role, batch, special_login')
      .eq('id', profile.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setFacultyProfile(data)
          if (data.batch) {
            fetchVenue(data.batch)
          }
        }
      })

    // Load restrict faculty batch setting
    supabase
      .from('session_settings')
      .select('restrict_faculty_batch')
      .eq('id', 1)
      .single()
      .then(({ data }) => {
        if (data) setRestrictFaculty(!!data.restrict_faculty_batch)
      })

    // Load distinct student batches
    supabase
      .from('profiles')
      .select('batch')
      .eq('role', 'Student')
      .not('batch', 'is', null)
      .neq('batch', '')
      .then(({ data }) => {
        if (data) {
          const unique = Array.from(new Set(data.map((p: any) => p.batch))).filter(Boolean).sort() as string[]
          setBatchesList(unique)
        }
      })
  }, [profile, authLoading, supabase, fetchVenue])

  async function handleAssignBatch(newBatch: string) {
    if (!profile) return
    setUpdatingBatch(true)
    const { error } = await supabase
      .from('profiles')
      .update({ batch: newBatch || null })
      .eq('id', profile.id)

    if (error) {
      alert('Failed to assign batch: ' + error.message)
    } else {
      setFacultyProfile((prev: any) => prev ? { ...prev, batch: newBatch || null } : prev)
      if (newBatch) {
        await fetchVenue(newBatch)
      } else {
        setBatchVenue(null)
      }
    }
    setUpdatingBatch(false)
  }

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
    <div className="relative space-y-8 animate-fade-in pb-16 max-w-4xl mx-auto px-4 md:px-0">
      {/* Soft Ambient Clay Background Spheres */}
      <div className="absolute inset-0 z-[-1] pointer-events-none opacity-60 overflow-hidden">
        <div className="absolute top-[-5%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-indigo-200/40 blur-[120px] mix-blend-multiply animate-pulse" style={{ animationDuration: '8s' }}></div>
        <div className="absolute top-[35%] right-[-10%] w-[45vw] h-[45vw] rounded-full bg-purple-200/40 blur-[120px] mix-blend-multiply animate-pulse" style={{ animationDuration: '10s' }}></div>
        <div className="absolute bottom-[-5%] left-[15%] w-[40vw] h-[40vw] rounded-full bg-blue-200/40 blur-[120px] mix-blend-multiply animate-pulse" style={{ animationDuration: '12s' }}></div>
      </div>

      {/* Flagship Claymorphic Faculty Header */}
      <div className="clay-card-indigo relative overflow-hidden p-6 sm:p-8 rounded-[2.5rem]">
        <div className="absolute top-[-40%] right-[-10%] w-[320px] h-[320px] bg-white/10 rounded-full blur-[60px] pointer-events-none"></div>
        <div className="absolute bottom-[-40%] left-[-10%] w-[300px] h-[300px] bg-purple-500/20 rounded-full blur-[60px] pointer-events-none"></div>

        <div className="relative z-10 flex flex-col sm:flex-row items-center sm:items-start md:items-center justify-between gap-6">
          {/* Left Side: Avatar Emblem + Info */}
          <div className="flex flex-col sm:flex-row items-center sm:items-start md:items-center gap-5 text-center sm:text-left">
            {/* Raised 3D Clay Avatar Badge */}
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-[2.25rem] bg-white/20 border-2 border-white/30 flex items-center justify-center text-white text-2xl sm:text-3xl font-black clay-badge-dark shadow-2xl transition-all duration-300 hover:scale-105 select-none tracking-wider">
              {initials}
            </div>

            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-white/15 border border-white/25 text-white text-[10px] sm:text-xs font-extrabold uppercase tracking-wider clay-badge-dark">
                <span>🏫</span> Faculty Dashboard
              </div>

              <div className="space-y-1.5">
                <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight font-heading leading-tight">Welcome, {greeting}</h1>

                {/* Clay Attribute Badges */}
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-2">
                  <span className="px-3 py-1 rounded-full bg-white/15 border border-white/20 text-[10px] sm:text-xs font-bold text-white/90 clay-badge-dark">
                    {profile?.department ?? 'Department of CSE'}
                  </span>
                  <span className="px-3 py-1 rounded-full bg-white/15 border border-white/20 text-[10px] sm:text-xs font-extrabold text-amber-200 clay-badge-dark">
                    📅 {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side: Online Status Badge */}
          <div className="w-full sm:w-auto text-center sm:text-right flex flex-col items-center sm:items-end justify-center">
            <div className="flex items-center gap-3 bg-white/20 border border-white/30 px-4 py-2.5 rounded-2xl clay-badge-dark">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span className="text-xs font-extrabold text-white tracking-wide uppercase">Scans Online</span>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile-Optimized Batch Assignment Panel */}
      <div className="clay-card p-6 sm:p-8 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-black text-slate-800 tracking-tight font-heading">Assigned Training Batch</h3>
            <p className="text-xs text-slate-500 font-medium">
              {restrictFaculty
                ? "Select your assigned batch to unlock live QR scanning."
                : "Optional: Assign a batch to filter student scans and view classroom venue."}
            </p>
          </div>

          <div className="w-full sm:w-auto">
            {facultyProfile?.special_login ? (
              <span className="clay-badge bg-purple-100 text-purple-900 border border-purple-200 px-4 py-2.5 text-xs font-black inline-flex items-center gap-1.5 w-full justify-center sm:w-auto">
                ⭐️ Special Login (All Batches Allowed)
              </span>
            ) : (
              <div className="w-full sm:w-auto">
                <select
                  disabled={updatingBatch}
                  value={facultyProfile?.batch || ''}
                  onChange={(e) => handleAssignBatch(e.target.value)}
                  className="clay-input w-full sm:w-56 min-h-[48px] px-4 py-3 text-xs font-extrabold text-slate-800 cursor-pointer"
                >
                  <option value="">Unassigned (None)</option>
                  {batchesList.map((b) => (
                    <option key={b} value={b}>Batch {b}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {facultyProfile?.batch && (
          <div className="p-4 bg-gradient-to-r from-indigo-50/80 to-purple-50/80 border border-indigo-100/80 rounded-2xl flex items-center gap-3 clay-badge">
            <span className="text-lg">📍</span>
            <p className="text-xs font-bold text-slate-700">
              Batch {facultyProfile.batch} Venue: <span className="text-brand-700 font-black">{batchVenue || 'No Venue Set'}</span>
            </p>
          </div>
        )}

        {restrictFaculty && !facultyProfile?.batch && !facultyProfile?.special_login && (
          <div className="p-4 bg-amber-100/80 border border-amber-300 text-amber-950 rounded-2xl flex items-center gap-3 clay-badge animate-pulse">
            <span className="text-lg">⚠️</span>
            <p className="text-xs font-extrabold">
              Restricted Mode Active: Please choose a batch above to start live attendance scanning.
            </p>
          </div>
        )}
      </div>

      {/* Thumb-Friendly Mobile Scanner CTA Banner */}
      {restrictFaculty && !facultyProfile?.batch && !facultyProfile?.special_login ? (
        <div
          onClick={() => alert("Please assign a batch to yourself first.")}
          className="clay-card p-6 sm:p-8 bg-slate-200/80 text-slate-500 opacity-60 cursor-not-allowed min-h-[72px] flex items-center justify-between"
        >
          <div className="space-y-1">
            <h3 className="font-black text-xl sm:text-2xl tracking-tight font-heading">Scanner Restricted</h3>
            <p className="text-slate-500 text-xs font-semibold">Select a batch above to enable live camera QR scanner</p>
          </div>
          <div className="w-14 h-14 bg-slate-300 rounded-2xl flex items-center justify-center clay-badge">
            <svg className="w-7 h-7 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
        </div>
      ) : (
        <Link
          href="/faculty/scan"
          className="clay-button block p-6 sm:p-8 min-h-[72px] group cursor-pointer transition-all duration-300 transform active:translate-y-1"
        >
          <div className="flex items-center justify-between relative z-10">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-white/20 text-white text-[10px] font-black uppercase tracking-wider clay-badge-dark mb-1">
                <span>⚡</span> Mobile Camera Ready
              </div>
              <h3 className="font-black text-xl sm:text-2xl tracking-tight text-white font-heading">Mark Live Attendance</h3>
              <p className="text-white/90 text-xs font-bold">Launch high-speed camera scanner for student QR codes</p>
            </div>
            <div className="w-14 h-14 sm:w-16 sm:h-16 bg-white/20 border border-white/30 rounded-[1.5rem] flex items-center justify-center backdrop-blur-md group-hover:scale-105 transition-transform duration-300 clay-badge-dark">
              <svg className="w-7 h-7 sm:w-8 sm:h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                  d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
            </div>
          </div>
        </Link>
      )}

      {/* Tactile Clay Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="clay-card text-center p-6 space-y-2 flex flex-col justify-between hover:-translate-y-1 transition-all">
          <div className="w-12 h-12 rounded-2xl bg-indigo-100 border border-indigo-200 flex items-center justify-center mx-auto text-xl clay-badge">📁</div>
          <div className="mt-2">
            <p className="text-3xl font-black text-slate-800 font-heading">{records.length}</p>
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest mt-1">Total Today</p>
          </div>
        </div>

        <div className="clay-card-blue text-center p-6 space-y-2 flex flex-col justify-between hover:-translate-y-1 transition-all">
          <div className="w-12 h-12 rounded-2xl bg-white/70 border border-white flex items-center justify-center mx-auto text-xl clay-badge">🌅</div>
          <div className="mt-2">
            <p className="text-3xl font-black text-blue-950 font-heading">{fnCount}</p>
            <p className="text-xs font-black text-blue-800 uppercase tracking-widest mt-1">Forenoon Scans</p>
          </div>
        </div>

        <div className="clay-card-amber text-center p-6 space-y-2 flex flex-col justify-between hover:-translate-y-1 transition-all">
          <div className="w-12 h-12 rounded-2xl bg-white/70 border border-white flex items-center justify-center mx-auto text-xl clay-badge">🌇</div>
          <div className="mt-2">
            <p className="text-3xl font-black text-amber-950 font-heading">{anCount}</p>
            <p className="text-xs font-black text-amber-800 uppercase tracking-widest mt-1">Afternoon Scans</p>
          </div>
        </div>
      </div>

      {/* Today's scan search and records list (Mobile-Optimized) */}
      <div className="clay-card p-6 sm:p-8 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-base font-black text-slate-800 font-heading">Today's Scanned Students</h3>
            <p className="text-xs text-slate-500 font-medium">Search and filter active classroom logs</p>
          </div>

          <div className="w-full sm:max-w-xs relative">
            <input
              type="text"
              placeholder="Search student name or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="clay-input w-full min-h-[44px] px-4 py-2.5 pr-10 text-xs font-bold text-slate-800"
            />
            {searchQuery ? (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-3 text-xs text-slate-400 hover:text-slate-700 font-bold"
              >
                ✕
              </button>
            ) : (
              <span className="absolute right-3 top-3 text-xs text-slate-400">🔍</span>
            )}
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
            <p className="text-xs font-extrabold text-slate-400">No scanned attendance logs matching search</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 max-h-[380px] overflow-y-auto pr-1 space-y-3">
            {filteredRecords.map((r) => (
              <div key={r.id} className="flex items-center justify-between p-3.5 bg-slate-50/70 hover:bg-slate-100/80 rounded-2xl transition-all duration-200 border border-slate-200/50 clay-badge">
                <div className="space-y-1">
                  <p className="text-xs font-black text-slate-800">{r.student_name}</p>
                  <p className="text-[10px] text-slate-500 font-semibold flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-brand-700 bg-brand-100/90 px-2 py-0.5 rounded-md font-black">{r.student_id}</span>
                    <span className="text-slate-300">|</span>
                    <span>{r.department} · Year {r.year} · Sec {r.section}</span>
                  </p>
                </div>
                <div className="text-right space-y-1">
                  <span className={`badge ${sessionColor(r.session)} text-[10px] clay-badge`}>{r.session}</span>
                  <p className="text-[10px] text-slate-500 font-bold">{formatTime(r.timestamp)}</p>
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

export default function FacultyDashboard() {
  const { activeModule } = useModule()
  const router = useRouter()

  useEffect(() => {
    if (activeModule === 'placements') {
      router.replace('/faculty/placement-drives')
    }
  }, [activeModule, router])

  if (activeModule === 'cdc') {
    return (
      <ModuleShell module="cdc" showNav={false}>
        <CdcDashboard />
      </ModuleShell>
    )
  }

  if (activeModule === 'placements') {
    return (
      <ModuleShell module="placements" showNav={false}>
        <div className="py-12 flex flex-col items-center justify-center space-y-2">
          <span className="w-8 h-8 border-3 border-brand-600 border-t-transparent rounded-full animate-spin"></span>
          <span className="text-xs text-slate-400 font-medium">Redirecting to Placement Drives...</span>
        </div>
      </ModuleShell>
    )
  }

  return (
    <ModuleShell module="training" showNav={false}>
      <FacultyTrainingView />
    </ModuleShell>
  )
}
