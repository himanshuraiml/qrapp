'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { todayIST, formatDate, formatTime, sessionColor } from '@/lib/utils'
import QrDisplay from '@/components/student/QrDisplay'
import AboutApp from '@/components/AboutApp'
import type { AttendanceRecord, QrPayload, StudentAttendanceStats, StudentAttendanceHistoryRecord } from '@/types'

export default function StudentDashboard() {
  const { profile, loading: authLoading } = useAuth()
  const supabase = createClient()
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [loading, setLoading] = useState(true)

  // Attendance stats states
  const [stats, setStats] = useState<StudentAttendanceStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)

  // Attendance history states
  const [history, setHistory] = useState<StudentAttendanceHistoryRecord[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)

  // QR Blocking state — derived from profile.qr_blocked, kept as state for realtime updates
  const [qrBlocked, setQrBlocked] = useState(false)
  // Global scan window state — fetched from session_settings, default true (optimistic)
  const [scanOpen, setScanOpen] = useState(true)

  // Batch Venue state
  const [batchVenue, setBatchVenue] = useState<string | null>(null)

  // Placement Drives state
  const [placementDrives, setPlacementDrives] = useState<any[]>([])
  const [placementLoading, setPlacementLoading] = useState(true)

  const fetchPlacementDrives = useCallback(async () => {
    try {
      setPlacementLoading(true)
      const res = await fetch('/api/student/placement-drives')
      const json = await res.json()
      if (json.success && Array.isArray(json.data)) {
        setPlacementDrives(json.data)
      }
    } catch (e) {
      console.error('Failed to fetch placement drives for student:', e)
    } finally {
      setPlacementLoading(false)
    }
  }, [])

  // Filters for detailed history view
  const [histDateFrom, setHistDateFrom] = useState('')
  const [histDateTo, setHistDateTo] = useState('')
  const [histSession, setHistSession] = useState('')
  const [histStatus, setHistStatus] = useState('') // '', 'present', 'absent'
  const [histSearch, setHistSearch] = useState('')

const fetchRecords = useCallback(async () => {
    if (!profile?.student_id) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('attendance')
        .select('*')
        .eq('student_id', profile.student_id)
        .order('date', { ascending: false })
        .order('session')
        .limit(60)
      if (error) {
        console.error('Failed to fetch attendance:', error)
      } else {
        setRecords((data as AttendanceRecord[]) ?? [])
      }
    } catch (err) {
      console.error('Error fetching attendance:', err)
    } finally {
      setLoading(false)
    }
  }, [profile?.student_id, supabase])

  const fetchStats = useCallback(async () => {
    if (!profile?.student_id) return
    setStatsLoading(true)
    try {
      const { data, error } = await supabase
        .rpc('get_student_attendance_stats', { p_student_id: profile.student_id })
      if (error) {
        console.error('Failed to fetch attendance stats:', error)
      } else {
        setStats(data as StudentAttendanceStats)
      }
    } catch (err) {
      console.error('Error fetching stats:', err)
    } finally {
      setStatsLoading(false)
    }
  }, [profile?.student_id, supabase])

  const fetchHistory = useCallback(async () => {
    if (!profile?.student_id) return
    setHistoryLoading(true)
    try {
      const { data, error } = await supabase
        .rpc('get_student_attendance_history', { p_student_id: profile.student_id })
      if (error) {
        console.error('Failed to fetch attendance history:', error)
      } else {
        setHistory((data as StudentAttendanceHistoryRecord[]) ?? [])
      }
    } catch (err) {
      console.error('Error fetching history:', err)
    } finally {
      setHistoryLoading(false)
    }
  }, [profile?.student_id, supabase])

  // Initial fetch
  useEffect(() => {
    if (authLoading) return
    if (!profile?.student_id) {
      setLoading(false)
      setStatsLoading(false)
      return
    }
    setQrBlocked(!!profile.qr_blocked)
    fetchRecords()
    fetchStats()
    fetchHistory()
    fetchPlacementDrives()
    supabase
      .from('session_settings')
      .select('qr_scan_open')
      .eq('id', 1)
      .single()
      .then(({ data }) => {
        if (data) setScanOpen(data.qr_scan_open ?? true)
      })
  }, [authLoading, profile?.student_id, profile?.qr_blocked, fetchRecords, fetchStats, fetchHistory, supabase])

  // Fetch batch venue when profile changes
  useEffect(() => {
    if (!profile?.batch) {
      setBatchVenue(null)
      return
    }
    supabase
      .from('batch_venues')
      .select('venue')
      .eq('batch', profile.batch)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setBatchVenue(data.venue)
      })
  }, [profile?.batch, supabase])

  // Real-time subscription (listening to any change in attendance & profiles)
  useEffect(() => {
    if (authLoading || !profile?.student_id) return

    const attendanceChannel = supabase
      .channel(`student_attendance_${profile.student_id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'attendance',
          filter: `student_id=eq.${profile.student_id}`,
        },
        () => {
          fetchRecords()
          fetchStats()
          fetchHistory()
        }
      )
      .subscribe()

    const profileChannel = supabase
      .channel(`student_profile_${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${profile.id}`,
        },
        (payload) => {
          if (payload.new && 'qr_blocked' in payload.new) {
            setQrBlocked(!!payload.new.qr_blocked)
          }
        }
      )
      .subscribe()

    const settingsChannel = supabase
      .channel('session_settings_scan')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'session_settings', filter: 'id=eq.1' },
        (payload) => {
          if (payload.new && 'qr_scan_open' in payload.new) {
            const val = (payload.new as { qr_scan_open?: boolean }).qr_scan_open
            setScanOpen(val ?? true)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(attendanceChannel)
      supabase.removeChannel(profileChannel)
      supabase.removeChannel(settingsChannel)
    }
  }, [profile?.id, profile?.student_id, authLoading, supabase, fetchRecords, fetchStats, fetchHistory])


  const today = todayIST()
  const todayRecords = records.filter((r: AttendanceRecord) => r.date === today)
  const fnToday = todayRecords.filter((r: AttendanceRecord) => r.session.startsWith('FN'))
  const anToday = todayRecords.filter((r: AttendanceRecord) => r.session.startsWith('AN'))

  // Group history by date
  const byDate = records.reduce<Record<string, AttendanceRecord[]>>((acc, r) => {
    if (!acc[r.date]) acc[r.date] = []
    acc[r.date].push(r)
    return acc
  }, {})

  const filteredHistory = useMemo(() => {
    return history.filter((item) => {
      // Date filters
      if (histDateFrom && item.date < histDateFrom) return false
      if (histDateTo && item.date > histDateTo) return false

      // Session filter
      if (histSession && item.session !== histSession) return false

      // Status filter
      if (histStatus) {
        const isPresent = item.present
        if (histStatus === 'present' && !isPresent) return false
        if (histStatus === 'absent' && isPresent) return false
      }

      // Search filter (searches date or marked_by_name)
      if (histSearch) {
        const query = histSearch.toLowerCase()
        const matchDate = formatDate(item.date).toLowerCase().includes(query) || item.date.includes(query)
        const matchFaculty = item.marked_by_name?.toLowerCase().includes(query) ?? false
        if (!matchDate && !matchFaculty) return false
      }

      return true
    })
  }, [history, histDateFrom, histDateTo, histSession, histStatus, histSearch])


  const qrPayload: QrPayload | null = useMemo(() => profile?.student_id
    ? {
      student_id: profile.student_id,
      name: profile.name,
      department: profile.department ?? '',
      year: profile.year ?? 1,
      section: profile.section ?? '',
      batch: profile.batch ?? '',
      ts: 0,
    }
    : null,
    [profile?.student_id, profile?.name, profile?.department, profile?.year, profile?.section, profile?.batch])

  const initials = useMemo(() => {
    if (!profile?.name) return 'ST'
    return profile.name
      .split(' ')
      .filter(Boolean)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase()
  }, [profile?.name])

  return (
    <div className="relative space-y-8 animate-fade-in pb-12 max-w-4xl mx-auto px-4 md:px-0">
      {/* Background Decorative Mesh Gradients */}
      <div className="absolute inset-0 z-[-1] pointer-events-none opacity-45 overflow-hidden">
        <div className="absolute top-[-10%] left-[-15%] w-[45vw] h-[45vw] rounded-full bg-brand-500/10 blur-[130px] mix-blend-multiply animate-pulse" style={{ animationDuration: '10s' }}></div>
        <div className="absolute bottom-[-10%] right-[-15%] w-[45vw] h-[45vw] rounded-full bg-indigo-500/10 blur-[130px] mix-blend-multiply animate-pulse" style={{ animationDuration: '12s' }}></div>
      </div>
      {/* Premium Profile Banner Card */}
      <div className="card-premium relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 border border-white/10 shadow-2xl p-6 sm:p-8 rounded-[2rem]">
        <div className="absolute top-[-50%] right-[-10%] w-[350px] h-[350px] bg-brand-500/10 rounded-full blur-[80px] pointer-events-none"></div>
        <div className="absolute bottom-[-50%] left-[-10%] w-[300px] h-[300px] bg-indigo-500/10 rounded-full blur-[70px] pointer-events-none"></div>

        <div className="relative z-10 flex flex-col sm:flex-row items-center sm:items-start md:items-center justify-between gap-6">
          {/* Left Side: Avatar + Info */}
          <div className="flex flex-col sm:flex-row items-center sm:items-start md:items-center gap-5 text-center sm:text-left">
            {/* Avatar Initials Circle */}
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br from-brand-600/20 to-indigo-600/30 border-2 border-white/15 flex items-center justify-center text-white text-2xl sm:text-3xl font-extrabold shadow-inner shadow-brand-500/20 transition-all duration-300 hover:scale-105 select-none">
              {initials}
            </div>

            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/10 border border-brand-500/25 text-brand-300 text-[10px] sm:text-xs font-bold uppercase tracking-wider">
                <span>🎓</span> Student Profile
              </div>

              <div className="space-y-1">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight font-heading leading-tight">{profile?.name}</h1>

                {/* Responsive Badges */}
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-2">
                  <span className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/5 text-[10px] sm:text-xs font-bold text-slate-300">
                    {profile?.department}
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/5 text-[10px] sm:text-xs font-bold text-slate-300">
                    Year {profile?.year}
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/5 text-[10px] sm:text-xs font-bold text-slate-300">
                    Sec {profile?.section}
                  </span>
                  {profile?.batch && (
                    <span className="px-2.5 py-1 rounded-lg bg-brand-500/15 border border-brand-500/30 text-[10px] sm:text-xs font-bold text-brand-200">
                      Batch {profile.batch} {batchVenue ? `(Venue: ${batchVenue})` : ''}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right Side: Roll Number ID Card */}
          <div className="w-full sm:w-auto text-center sm:text-right flex flex-col items-center sm:items-end justify-center gap-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">SRMIST ROLL NO</span>
            <div className="inline-block bg-white/5 border border-white/10 px-4 py-2.5 rounded-2xl font-mono text-xs sm:text-sm text-brand-300 select-all shadow-inner tracking-wider font-bold">
              {profile?.student_id}
            </div>
          </div>
        </div>
      </div>

      {/* Premium Statistics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 animate-fade-in">
        {/* Overall Percentage Card */}
        <div className="relative overflow-hidden rounded-[2rem] bg-white border border-slate-100 p-5 flex flex-col justify-between shadow-sm group hover:border-brand-300 hover:shadow-lg transition-all duration-300">
          <div className="flex items-start justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-heading">Attendance Rate</span>
            <span className="text-xl">📈</span>
          </div>
          <div className="mt-4 space-y-1">
            <p className="text-2xl sm:text-3xl font-extrabold text-slate-800 tracking-tight font-heading">
              {statsLoading ? '—' : `${stats?.attendance_pct ?? 0}%`}
            </p>
            <div className="flex items-center gap-1.5 mt-1">
              <span className={`w-2 h-2 rounded-full ${statsLoading ? 'bg-slate-300 animate-pulse' :
                  (stats?.attendance_pct ?? 0) >= 75 ? 'bg-emerald-500' :
                    (stats?.attendance_pct ?? 0) >= 50 ? 'bg-amber-500' : 'bg-red-500'
                }`} />
              <span className="text-[10px] font-bold text-slate-400">
                {statsLoading ? 'Calculating...' :
                  (stats?.attendance_pct ?? 0) >= 75 ? 'Excellent Standing' :
                    (stats?.attendance_pct ?? 0) >= 50 ? 'Good Standing' : 'Below Target'}
              </span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mt-3">
              <div
                className={`h-full rounded-full transition-all duration-1000 ${statsLoading ? 'w-1/3 animate-pulse bg-slate-200' :
                    (stats?.attendance_pct ?? 0) >= 75 ? 'bg-emerald-500' :
                      (stats?.attendance_pct ?? 0) >= 50 ? 'bg-amber-500' : 'bg-red-500'
                  }`}
                style={{ width: statsLoading ? undefined : `${stats?.attendance_pct ?? 0}%` }}
              />
            </div>
          </div>
        </div>

        {/* Sessions Scanned Card */}
        <div className="relative overflow-hidden rounded-[2rem] bg-white border border-slate-100 p-5 flex flex-col justify-between shadow-sm group hover:border-brand-300 hover:shadow-lg transition-all duration-300">
          <div className="flex items-start justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-heading font-heading">Sessions Scanned</span>
            <span className="text-xl">📁</span>
          </div>
          <div className="mt-4">
            <p className="text-2xl sm:text-3xl font-extrabold text-slate-800 tracking-tight font-heading">
              {statsLoading ? '—' : stats?.total_conducted ?? 0}
            </p>
            <p className="text-[10px] font-bold text-slate-400 mt-1">Conducted sessions</p>
          </div>
        </div>

        {/* Present Sessions Card */}
        <div className="relative overflow-hidden rounded-[2rem] bg-white border border-slate-100 p-5 flex flex-col justify-between shadow-sm group hover:border-brand-300 hover:shadow-lg transition-all duration-300">
          <div className="flex items-start justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-heading">Present</span>
            <span className="text-xl text-emerald-500">✓</span>
          </div>
          <div className="mt-4">
            <p className="text-2xl sm:text-3xl font-extrabold text-slate-800 tracking-tight font-heading">
              {statsLoading ? '—' : stats?.present_count ?? 0}
            </p>
            <p className="text-[10px] font-bold text-slate-400 mt-1">Scans verified</p>
          </div>
        </div>

        {/* Absent Sessions Card */}
        <div className="relative overflow-hidden rounded-[2rem] bg-white border border-slate-100 p-5 flex flex-col justify-between shadow-sm group hover:border-brand-300 hover:shadow-lg transition-all duration-300">
          <div className="flex items-start justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-heading">Absent</span>
            <span className="text-xl text-red-500">✕</span>
          </div>
          <div className="mt-4">
            <p className="text-2xl sm:text-3xl font-extrabold text-slate-800 tracking-tight font-heading">
              {statsLoading ? '—' : stats?.absent_count ?? 0}
            </p>
            <p className="text-[10px] font-bold text-slate-400 mt-1">Sessions missed</p>
          </div>
        </div>
      </div>

      {/* Placement Drives Section */}
      <div className="bg-white/80 backdrop-blur-xl rounded-[2rem] border border-slate-100 p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-extrabold text-slate-800 tracking-tight flex items-center gap-2 font-heading">
              🚀 Placement Drives Eligibility & Attendance
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              Placement drives assigned to your profile by Placement Coordinators.
            </p>
          </div>
          <span className="text-xs font-extrabold text-brand-600 bg-brand-50 px-3 py-1 rounded-full">
            {placementDrives.length} Drives
          </span>
        </div>

        {placementLoading ? (
          <p className="text-xs text-slate-400 py-4 text-center">Loading placement drives...</p>
        ) : placementDrives.length === 0 ? (
          <div className="text-center py-6 bg-slate-50 rounded-2xl border border-slate-100">
            <p className="text-xs text-slate-500 font-medium">No placement drives assigned to your profile yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {placementDrives.map((pd) => (
              <div key={pd.id} className="p-4 rounded-2xl border border-slate-100 bg-slate-50/60 hover:bg-slate-50 transition-all flex flex-col justify-between space-y-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold uppercase text-brand-700 bg-brand-100 px-2.5 py-0.5 rounded-md">
                      {pd.company_name}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      pd.student_attendance_status === 'Present'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}>
                      {pd.student_attendance_status === 'Present' ? '✓ Present' : '⏳ Scheduled / Pending'}
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 mt-2">{pd.title}</h4>
                  <p className="text-xs text-slate-500">
                    📅 Date: {pd.display_date || pd.drive_date} | 📍 Venue: {pd.display_venue || pd.venue}
                  </p>
                  {(pd.test_time || pd.slot) && (
                    <p className="text-xs text-slate-500">
                      {pd.test_time && `⏰ Time: ${pd.test_time}`}{pd.test_time && pd.slot ? ' | ' : ''}{pd.slot && `🎟️ Slot: ${pd.slot}`}
                    </p>
                  )}
                  {pd.description && <p className="text-xs text-slate-400 italic line-clamp-1">{pd.description}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Left Column: QR Code Component */}
        <div className="space-y-6">
          {!scanOpen ? (
            <div className="flex flex-col items-center gap-6 py-12 relative overflow-hidden rounded-[2rem] p-6 shadow-lg border border-amber-200/50 bg-amber-50/20">
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-amber-400 to-orange-500"></div>
              <div className="w-16 h-16 rounded-full bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-600 shadow-sm">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="text-center space-y-2 max-w-sm px-4">
                <h3 className="text-lg font-bold text-slate-800 font-heading">QR Scanning is Closed</h3>
                <p className="text-xs text-slate-500 leading-relaxed font-medium">
                  The QR scan window is currently closed. Please wait for the admin to open the next scan session.
                </p>
                <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-100 text-xs text-amber-800 font-semibold mt-2">
                  Check back when the next session begins.
                </div>
              </div>
            </div>
          ) : qrBlocked ? (
            <div className="card-premium flex flex-col items-center gap-6 py-12 relative overflow-hidden group border-red-200/50 bg-red-50/10 rounded-[2rem] p-6 shadow-lg border">
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-red-500 to-rose-600"></div>
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center text-red-600 text-3xl font-extrabold shadow-sm animate-pulse">
                🔒
              </div>
              <div className="text-center space-y-2 max-w-sm px-4">
                <h3 className="text-lg font-bold text-slate-800 font-heading">QR Code Generation Blocked</h3>
                <p className="text-xs text-slate-500 leading-relaxed font-medium">
                  Your QR code generation has been disabled because you missed a scheduled attendance session.
                </p>
                <div className="p-3.5 rounded-xl bg-red-50/80 border border-red-100/80 text-xs text-red-700 font-bold mt-2 shadow-inner">
                  Please contact the admin (IST 118) to enable your QR code.
                </div>
              </div>
            </div>
          ) : (
            <>
              {qrPayload && <QrDisplay basePayload={qrPayload} />}
              {profile?.batch && batchVenue && (
                <div className="bg-white/70 backdrop-blur-md border border-slate-200/50 p-4 rounded-3xl shadow-sm flex items-center gap-3 animate-fade-in mt-4">
                  <div className="w-10 h-10 rounded-2xl bg-brand-50 border border-brand-100 flex items-center justify-center text-lg shadow-sm">
                    📍
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-heading">Classroom Venue</p>
                    <p className="text-xs font-extrabold text-slate-800 mt-0.5">Batch {profile.batch} · {batchVenue}</p>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Today's scan verification status */}
          <div className="card space-y-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Today's Attendance Status</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                <div className="flex items-center gap-2.5">
                  <span className="text-lg">🌅</span>
                  <div>
                    <p className="text-xs font-bold text-slate-800">Forenoon Session</p>
                    <p className="text-[10px] text-slate-400 font-medium">FN1 / FN2</p>
                  </div>
                </div>
                {fnToday.length > 0 ? (
                  <span className="badge bg-emerald-50 text-emerald-700 border border-emerald-200">Present</span>
                ) : (
                  <span className="badge bg-slate-100 text-slate-400 border border-slate-200">Pending</span>
                )}
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                <div className="flex items-center gap-2.5">
                  <span className="text-lg">🌇</span>
                  <div>
                    <p className="text-xs font-bold text-slate-800">Afternoon Session</p>
                    <p className="text-[10px] text-slate-400 font-medium">AN1 / AN2</p>
                  </div>
                </div>
                {anToday.length > 0 ? (
                  <span className="badge bg-emerald-50 text-emerald-700 border border-emerald-200">Present</span>
                ) : (
                  <span className="badge bg-slate-100 text-slate-400 border border-slate-200">Pending</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: History Lists */}
        <div className="space-y-6">
          {/* Full History Feed */}
          <div className="card space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-sm font-extrabold text-slate-800 font-heading">Recent Attendance Logs</h3>
                <p className="text-xs text-slate-400">List of your recent verified scans</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setHistoryOpen(true)}
                  className="text-xs text-brand-600 hover:text-brand-700 font-bold flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-50 hover:bg-brand-100 transition-all duration-300 border border-brand-200/50 shadow-sm"
                >
                  <span>📅</span> History
                </button>
                <button
                  onClick={() => fetchRecords()}
                  className="text-xs text-slate-500 hover:text-slate-800 font-bold flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200/50 shadow-sm transition-all duration-300"
                  disabled={loading}
                >
                  {loading ? (
                    <span className="w-3.5 h-3.5 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <span>🔄</span>
                  )}
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            {loading ? (
              <div className="py-12 flex flex-col items-center justify-center space-y-2">
                <span className="w-8 h-8 border-3 border-brand-600 border-t-transparent rounded-full animate-spin"></span>
                <span className="text-xs text-slate-400 font-medium">Fetching record logs...</span>
              </div>
            ) : Object.keys(byDate).length === 0 ? (
              <div className="text-center py-12 space-y-2">
                <span className="text-3xl">📭</span>
                <p className="text-xs font-bold text-slate-400">No attendance logs registered yet</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[320px] overflow-y-auto pr-2 space-y-3.5">
                {Object.entries(byDate).map(([date, recs]) => (
                  <div key={date} className="pt-3.5 first:pt-0">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">
                      📅 {formatDate(date)}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {(recs as AttendanceRecord[]).map((r: AttendanceRecord) => (
                        <div key={r.id} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white border border-slate-100 shadow-sm text-xs font-semibold">
                          <span className={`w-2.5 h-2.5 rounded-full ${r.session.startsWith('FN') ? 'bg-blue-500 shadow-sm shadow-blue-500/20' : 'bg-amber-500 shadow-sm shadow-amber-500/20'}`}></span>
                          <span className="text-slate-700">{r.session}</span>
                          <span className="text-slate-300">|</span>
                          <span className="text-slate-400 text-[10px] font-medium">Marked by {r.marked_by_name || r.marked_by}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <AboutApp />

      {/* Attendance History Drawer / Modal */}
      {historyOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-50 flex items-center justify-center p-4 md:p-6 animate-fade-in animate-duration-200">
          <div className="w-full max-w-3xl bg-white rounded-[2rem] border border-slate-100 shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-scale-in">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-extrabold text-slate-800 font-heading">Complete Attendance History</h3>
                <p className="text-xs text-slate-400">Total {filteredHistory.length} sessions matching filters</p>
              </div>
              <button
                onClick={() => setHistoryOpen(false)}
                className="w-10 h-10 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-all font-bold"
              >
                ✕
              </button>
            </div>

            {/* Filters Row */}
            <div className="p-6 bg-slate-50/50 border-b border-slate-100 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">From Date</label>
                <input
                  type="date"
                  value={histDateFrom}
                  onChange={(e) => setHistDateFrom(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 font-semibold"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">To Date</label>
                <input
                  type="date"
                  value={histDateTo}
                  onChange={(e) => setHistDateTo(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 font-semibold"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Session</label>
                <select
                  value={histSession}
                  onChange={(e) => setHistSession(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 font-semibold text-slate-700"
                >
                  <option value="">All Sessions</option>
                  <option value="FN1">FN1</option>
                  <option value="FN2">FN2</option>
                  <option value="AN1">AN1</option>
                  <option value="AN2">AN2</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Status</label>
                <select
                  value={histStatus}
                  onChange={(e) => setHistStatus(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 font-semibold text-slate-700"
                >
                  <option value="">All Statuses</option>
                  <option value="present">🟢 Present</option>
                  <option value="absent">🔴 Absent</option>
                </select>
              </div>
            </div>

            {/* Quick Search */}
            <div className="px-6 py-3 border-b border-slate-100 flex items-center justify-between bg-white">
              <input
                type="text"
                placeholder="Search by faculty name or date..."
                value={histSearch}
                onChange={(e) => setHistSearch(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-4 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </div>

            {/* History Records Table / Scroll List */}
            <div className="flex-1 overflow-y-auto p-6">
              {historyLoading ? (
                <div className="py-12 flex flex-col items-center justify-center space-y-2">
                  <span className="w-8 h-8 border-3 border-brand-600 border-t-transparent rounded-full animate-spin"></span>
                  <span className="text-xs text-slate-400 font-medium">Loading history logs...</span>
                </div>
              ) : filteredHistory.length === 0 ? (
                <div className="text-center py-12 space-y-2">
                  <span className="text-3xl">📭</span>
                  <p className="text-xs font-bold text-slate-400">No matching attendance logs found</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-slate-50/20">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <th className="p-4 font-bold text-slate-500 uppercase tracking-wider">Date</th>
                        <th className="p-4 font-bold text-slate-500 uppercase tracking-wider">Session</th>
                        <th className="p-4 font-bold text-slate-500 uppercase tracking-wider">Status</th>
                        <th className="p-4 font-bold text-slate-500 uppercase tracking-wider">Marked Time</th>
                        <th className="p-4 font-bold text-slate-500 uppercase tracking-wider">Verified By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {filteredHistory.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-4 font-semibold text-slate-700">{formatDate(item.date)}</td>
                          <td className="p-4">
                            <span className={`badge ${sessionColor(item.session)} text-[10px]`}>
                              {item.session}
                            </span>
                          </td>
                          <td className="p-4">
                            {item.present ? (
                              <span className="badge bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10px] font-bold animate-fade-in">
                                🟢 Present
                              </span>
                            ) : (
                              <span className="badge bg-red-50 text-red-700 border border-red-100 text-[10px] font-bold animate-fade-in">
                                🔴 Absent
                              </span>
                            )}
                          </td>
                          <td className="p-4 font-semibold text-slate-400">
                            {item.timestamp ? formatTime(item.timestamp) : '—'}
                          </td>
                          <td className="p-4 font-semibold text-slate-500">
                            {item.marked_by_name || (item.present ? 'Faculty' : '—')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
              {(histDateFrom || histDateTo || histSession || histStatus || histSearch) && (
                <button
                  onClick={() => {
                    setHistDateFrom('')
                    setHistDateTo('')
                    setHistSession('')
                    setHistStatus('')
                    setHistSearch('')
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-700 transition-colors"
                >
                  Clear Filters
                </button>
              )}
              <button
                onClick={() => setHistoryOpen(false)}
                className="btn-primary px-5 py-2 text-xs font-bold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
