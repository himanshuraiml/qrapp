'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { todayIST, formatDate, formatTime, sessionColor } from '@/lib/utils'
import QrDisplay from '@/components/student/QrDisplay'
import AboutApp from '@/components/AboutApp'
import { useModule } from '@/context/ModuleContext'
import type { AttendanceRecord, StudentAttendanceStats, StudentAttendanceHistoryRecord } from '@/types'

interface CdcHistoryRecord {
  date: string
  period_number: number
  subject: string | null
  marked_by_name: string
  timestamp: string
}

export default function StudentDashboard() {
  const { profile, loading: authLoading } = useAuth()
  const { activeModule } = useModule()
  const supabase = createClient()
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [loading, setLoading] = useState(true)

  // CDC attendance state
  const [cdcHistory, setCdcHistory] = useState<CdcHistoryRecord[]>([])
  const [cdcLoading, setCdcLoading] = useState(true)

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

  const fetchCdcHistory = useCallback(async () => {
    if (!profile?.student_id) return
    setCdcLoading(true)
    try {
      const { data, error } = await supabase
        .rpc('get_cdc_student_history', { p_student_id: profile.student_id })
      if (error) {
        console.error('Failed to fetch CDC history:', error)
      } else {
        setCdcHistory((data as CdcHistoryRecord[]) ?? [])
      }
    } catch (err) {
      console.error('Error fetching CDC history:', err)
    } finally {
      setCdcLoading(false)
    }
  }, [profile?.student_id, supabase])

  // Initial fetch
  useEffect(() => {
    if (authLoading) return
    if (!profile?.student_id) {
      setLoading(false)
      setStatsLoading(false)
      setCdcLoading(false)
      return
    }
    setQrBlocked(!!profile.qr_blocked)
    fetchRecords()
    fetchStats()
    fetchHistory()
    fetchCdcHistory()
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

    let attendanceChannel: ReturnType<typeof supabase.channel> | null = null
    let profileChannel: ReturnType<typeof supabase.channel> | null = null
    let settingsChannel: ReturnType<typeof supabase.channel> | null = null

    try {
      attendanceChannel = supabase
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

      profileChannel = supabase
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

      settingsChannel = supabase
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
    } catch (e) {
      // Realtime is a nice-to-have live-refresh; a blocked/failed WebSocket
      // connection must never crash the whole page for a feature that
      // otherwise degrades silently to manual refresh.
      console.warn('Realtime subscription failed', e)
    }

    return () => {
      if (attendanceChannel) supabase.removeChannel(attendanceChannel)
      if (profileChannel) supabase.removeChannel(profileChannel)
      if (settingsChannel) supabase.removeChannel(settingsChannel)
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

  const cdcTodayRecords = cdcHistory.filter((r) => r.date === today)
  const cdcByDate = cdcHistory.reduce<Record<string, CdcHistoryRecord[]>>((acc, r) => {
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
    <div className="relative space-y-8 animate-fade-in pb-16 max-w-4xl mx-auto px-4 md:px-0">
      {/* Soft Ambient Clay Background Spheres */}
      <div className="absolute inset-0 z-[-1] pointer-events-none opacity-60 overflow-hidden">
        <div className="absolute top-[-5%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-indigo-200/40 blur-[120px] mix-blend-multiply animate-pulse" style={{ animationDuration: '8s' }}></div>
        <div className="absolute top-[30%] right-[-10%] w-[45vw] h-[45vw] rounded-full bg-purple-200/40 blur-[120px] mix-blend-multiply animate-pulse" style={{ animationDuration: '10s' }}></div>
        <div className="absolute bottom-[-5%] left-[20%] w-[40vw] h-[40vw] rounded-full bg-pink-200/40 blur-[120px] mix-blend-multiply animate-pulse" style={{ animationDuration: '12s' }}></div>
      </div>

      {/* Flagship Claymorphic Student Profile Banner */}
      <div className="clay-card-indigo relative overflow-hidden p-6 sm:p-8 rounded-[2.5rem]">
        <div className="absolute top-[-40%] right-[-10%] w-[320px] h-[320px] bg-white/10 rounded-full blur-[60px] pointer-events-none"></div>
        <div className="absolute bottom-[-40%] left-[-10%] w-[300px] h-[300px] bg-purple-500/20 rounded-full blur-[60px] pointer-events-none"></div>

        <div className="relative z-10 flex flex-col sm:flex-row items-center sm:items-start md:items-center justify-between gap-6">
          {/* Left Side: Avatar Emblem + Student Info */}
          <div className="flex flex-col sm:flex-row items-center sm:items-start md:items-center gap-5 text-center sm:text-left">
            {/* Raised 3D Clay Avatar Badge */}
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-[2.25rem] bg-white/20 border-2 border-white/30 flex items-center justify-center text-white text-2xl sm:text-3xl font-black clay-badge-dark shadow-2xl transition-all duration-300 hover:scale-105 select-none tracking-wider">
              {initials}
            </div>

            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-white/15 border border-white/25 text-white text-[10px] sm:text-xs font-extrabold uppercase tracking-wider clay-badge-dark">
                <span>🎓</span> Student Profile
              </div>

              <div className="space-y-1.5">
                <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight font-heading leading-tight">{profile?.name}</h1>

                {/* Clay Attribute Pills */}
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-2">
                  <span className="px-3 py-1 rounded-full bg-white/15 border border-white/20 text-[10px] sm:text-xs font-bold text-white/90 clay-badge-dark">
                    {profile?.department}
                  </span>
                  <span className="px-3 py-1 rounded-full bg-white/15 border border-white/20 text-[10px] sm:text-xs font-bold text-white/90 clay-badge-dark">
                    Year {profile?.year}
                  </span>
                  <span className="px-3 py-1 rounded-full bg-white/15 border border-white/20 text-[10px] sm:text-xs font-bold text-white/90 clay-badge-dark">
                    Sec {profile?.section}
                  </span>
                  {profile?.batch && (
                    <span className="px-3 py-1 rounded-full bg-amber-300/30 border border-amber-200/40 text-[10px] sm:text-xs font-extrabold text-amber-100 clay-badge-dark">
                      Batch {profile.batch} {batchVenue ? `(Venue: ${batchVenue})` : ''}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right Side: Tactile Roll Number Badge */}
          <div className="w-full sm:w-auto text-center sm:text-right flex flex-col items-center sm:items-end justify-center gap-1.5">
            <span className="text-[10px] font-black text-white/60 uppercase tracking-widest">SRMIST ROLL NO</span>
            <div className="inline-block bg-white/20 border border-white/30 px-4 py-2.5 rounded-2xl font-mono text-xs sm:text-sm text-white select-all clay-badge-dark tracking-wider font-extrabold">
              {profile?.student_id}
            </div>
          </div>
        </div>
      </div>

      {/* Tactile Clay Statistics Grid */}
      {activeModule === 'training' && (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 animate-fade-in">
        {/* Overall Percentage Card */}
        <div className="clay-card-emerald p-5 flex flex-col justify-between transition-all duration-300 hover:-translate-y-1">
          <div className="flex items-start justify-between">
            <span className="text-[10px] font-black text-emerald-800 uppercase tracking-widest font-heading">Attendance Rate</span>
            <span className="text-xl">📈</span>
          </div>
          <div className="mt-4 space-y-1.5">
            <p className="text-2xl sm:text-3xl font-black text-emerald-950 tracking-tight font-heading">
              {statsLoading ? '—' : `${stats?.attendance_pct ?? 0}%`}
            </p>
            <div className="flex items-center gap-1.5 mt-1">
              <span className={`w-2.5 h-2.5 rounded-full ${statsLoading ? 'bg-slate-400 animate-pulse' :
                  (stats?.attendance_pct ?? 0) >= 75 ? 'bg-emerald-600' :
                    (stats?.attendance_pct ?? 0) >= 50 ? 'bg-amber-600' : 'bg-red-600'
                }`} />
              <span className="text-[10px] font-extrabold text-emerald-800">
                {statsLoading ? 'Calculating...' :
                  (stats?.attendance_pct ?? 0) >= 75 ? 'Excellent Standing' :
                    (stats?.attendance_pct ?? 0) >= 50 ? 'Good Standing' : 'Below Target'}
              </span>
            </div>
            {/* Tactile 3D Inset Progress Bar */}
            <div className="h-2 bg-emerald-900/10 rounded-full overflow-hidden mt-3 shadow-[inset_1px_1px_3px_rgba(0,0,0,0.15)]">
              <div
                className={`h-full rounded-full transition-all duration-1000 ${statsLoading ? 'w-1/3 animate-pulse bg-emerald-300' :
                    (stats?.attendance_pct ?? 0) >= 75 ? 'bg-emerald-600' :
                      (stats?.attendance_pct ?? 0) >= 50 ? 'bg-amber-500' : 'bg-red-500'
                  }`}
                style={{ width: statsLoading ? undefined : `${stats?.attendance_pct ?? 0}%` }}
              />
            </div>
          </div>
        </div>

        {/* Sessions Scanned Card */}
        <div className="clay-card-blue p-5 flex flex-col justify-between transition-all duration-300 hover:-translate-y-1">
          <div className="flex items-start justify-between">
            <span className="text-[10px] font-black text-blue-800 uppercase tracking-widest font-heading">Sessions Scanned</span>
            <span className="text-xl">📁</span>
          </div>
          <div className="mt-4">
            <p className="text-2xl sm:text-3xl font-black text-blue-950 tracking-tight font-heading">
              {statsLoading ? '—' : stats?.total_conducted ?? 0}
            </p>
            <p className="text-[10px] font-extrabold text-blue-700/80 mt-1">Conducted sessions</p>
          </div>
        </div>

        {/* Present Sessions Card */}
        <div className="clay-card-purple p-5 flex flex-col justify-between transition-all duration-300 hover:-translate-y-1">
          <div className="flex items-start justify-between">
            <span className="text-[10px] font-black text-purple-800 uppercase tracking-widest font-heading">Present</span>
            <span className="text-xl text-purple-600">✓</span>
          </div>
          <div className="mt-4">
            <p className="text-2xl sm:text-3xl font-black text-purple-950 tracking-tight font-heading">
              {statsLoading ? '—' : stats?.present_count ?? 0}
            </p>
            <p className="text-[10px] font-extrabold text-purple-700/80 mt-1">Scans verified</p>
          </div>
        </div>

        {/* Absent Sessions Card */}
        <div className="clay-card-rose p-5 flex flex-col justify-between transition-all duration-300 hover:-translate-y-1">
          <div className="flex items-start justify-between">
            <span className="text-[10px] font-black text-rose-800 uppercase tracking-widest font-heading">Absent</span>
            <span className="text-xl text-rose-600">✕</span>
          </div>
          <div className="mt-4">
            <p className="text-2xl sm:text-3xl font-black text-rose-950 tracking-tight font-heading">
              {statsLoading ? '—' : stats?.absent_count ?? 0}
            </p>
            <p className="text-[10px] font-extrabold text-rose-700/80 mt-1">Sessions missed</p>
          </div>
        </div>
      </div>
      )}

      {/* CDC Statistics Grid */}
      {activeModule === 'cdc' && (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 animate-fade-in">
        <div className="clay-card-emerald p-5 flex flex-col justify-between transition-all duration-300 hover:-translate-y-1">
          <div className="flex items-start justify-between">
            <span className="text-[10px] font-black text-emerald-800 uppercase tracking-widest font-heading">Total CDC Sessions</span>
            <span className="text-xl">📈</span>
          </div>
          <div className="mt-4">
            <p className="text-2xl sm:text-3xl font-black text-emerald-950 tracking-tight font-heading">
              {cdcLoading ? '—' : cdcHistory.length}
            </p>
            <p className="text-[10px] font-extrabold text-emerald-700/80 mt-1">Periods marked present</p>
          </div>
        </div>

        <div className="clay-card-blue p-5 flex flex-col justify-between transition-all duration-300 hover:-translate-y-1">
          <div className="flex items-start justify-between">
            <span className="text-[10px] font-black text-blue-800 uppercase tracking-widest font-heading">Days Attended</span>
            <span className="text-xl">📁</span>
          </div>
          <div className="mt-4">
            <p className="text-2xl sm:text-3xl font-black text-blue-950 tracking-tight font-heading">
              {cdcLoading ? '—' : Object.keys(cdcByDate).length}
            </p>
            <p className="text-[10px] font-extrabold text-blue-700/80 mt-1">Distinct CDC class days</p>
          </div>
        </div>

        <div className="clay-card-purple p-5 flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 col-span-2 md:col-span-2">
          <div className="flex items-start justify-between">
            <span className="text-[10px] font-black text-purple-800 uppercase tracking-widest font-heading">Today</span>
            <span className="text-xl text-purple-600">✓</span>
          </div>
          <div className="mt-4">
            <p className="text-2xl sm:text-3xl font-black text-purple-950 tracking-tight font-heading">
              {cdcLoading ? '—' : `${cdcTodayRecords.length} Period${cdcTodayRecords.length === 1 ? '' : 's'}`}
            </p>
            <p className="text-[10px] font-extrabold text-purple-700/80 mt-1">
              {cdcTodayRecords.length > 0 ? `Periods: ${cdcTodayRecords.map((r) => r.period_number).sort().join(', ')}` : 'No CDC period marked yet today'}
            </p>
          </div>
        </div>
      </div>
      )}

      {/* Placement Drives Clay Container */}
      <div className="clay-card p-6 sm:p-8 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-black text-slate-800 tracking-tight flex items-center gap-2 font-heading">
              🚀 Placement Drives Eligibility & Attendance
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              Placement drives assigned to your profile by Placement Coordinators.
            </p>
          </div>
          <span className="inline-flex items-center px-3.5 py-1 rounded-full text-xs font-extrabold text-brand-700 bg-brand-50 border border-brand-200 clay-badge self-start sm:self-auto">
            {placementDrives.length} Drives
          </span>
        </div>

        {placementLoading ? (
          <p className="text-xs text-slate-400 py-6 text-center font-semibold">Loading placement drives...</p>
        ) : placementDrives.length === 0 ? (
          <div className="text-center py-6 bg-slate-50/80 rounded-2xl border border-slate-100 clay-badge">
            <p className="text-xs text-slate-500 font-bold">No placement drives assigned to your profile yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {placementDrives.map((pd) => (
              <div key={pd.id} className="p-5 rounded-[1.75rem] border border-slate-200/60 bg-gradient-to-br from-white to-slate-50/80 clay-card hover:-translate-y-0.5 transition-all flex flex-col justify-between space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase text-brand-700 bg-brand-100/80 px-3 py-1 rounded-full clay-badge">
                      {pd.company_name}
                    </span>
                    <span className={`text-[10px] font-extrabold px-3 py-1 rounded-full clay-badge ${
                      pd.student_attendance_status === 'Present'
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        : 'bg-amber-100 text-amber-800 border border-amber-200'
                    }`}>
                      {pd.student_attendance_status === 'Present' ? '✓ Present' : '⏳ Scheduled'}
                    </span>
                  </div>
                  <h4 className="text-sm font-extrabold text-slate-900 mt-2">{pd.title}</h4>
                  <p className="text-xs text-slate-600 font-semibold">
                    📅 Date: {pd.display_date || pd.drive_date} | 📍 Venue: {pd.display_venue || pd.venue}
                  </p>
                  {(pd.test_time || pd.slot) && (
                    <p className="text-xs text-slate-500 font-medium">
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
            <div className="clay-card-amber p-6 sm:p-8 flex flex-col items-center gap-5 text-center">
              <div className="w-16 h-16 rounded-full bg-amber-200/70 border border-amber-300 flex items-center justify-center text-amber-800 shadow-md clay-badge">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="space-y-2 max-w-sm">
                <h3 className="text-lg font-black text-amber-950 font-heading">QR Scanning is Closed</h3>
                <p className="text-xs text-amber-900/80 leading-relaxed font-semibold">
                  The QR scan window is currently closed. Please wait for the faculty or admin to open the next scan session.
                </p>
                <div className="p-3 rounded-2xl bg-amber-200/50 border border-amber-300/80 text-xs text-amber-950 font-extrabold mt-2 clay-badge">
                  Check back when the next session starts.
                </div>
              </div>
            </div>
          ) : qrBlocked ? (
            <div className="clay-card-rose p-6 sm:p-8 flex flex-col items-center gap-5 text-center">
              <div className="w-16 h-16 rounded-full bg-rose-200/70 border border-rose-300 flex items-center justify-center text-rose-800 text-3xl font-black shadow-md clay-badge animate-pulse">
                🔒
              </div>
              <div className="space-y-2 max-w-sm">
                <h3 className="text-lg font-black text-rose-950 font-heading">QR Code Generation Blocked</h3>
                <p className="text-xs text-rose-900/80 leading-relaxed font-semibold">
                  Your QR code generation has been disabled because you missed a scheduled attendance session.
                </p>
                <div className="p-3 rounded-2xl bg-rose-200/50 border border-rose-300/80 text-xs text-rose-950 font-extrabold mt-2 clay-badge">
                  Please contact the admin (IST 118) to unlock your QR code.
                </div>
              </div>
            </div>
          ) : (
            <>
              {profile?.student_id && <QrDisplay />}
              {profile?.batch && batchVenue && (
                <div className="clay-card p-4 sm:p-5 rounded-[2rem] bg-gradient-to-r from-indigo-50/80 to-purple-50/80 border border-indigo-100 flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-2xl bg-indigo-100 border border-indigo-200 flex items-center justify-center text-xl shadow-sm clay-badge">
                    📍
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-indigo-800 uppercase tracking-widest font-heading">Classroom Venue</p>
                    <p className="text-xs font-black text-slate-800 mt-0.5">Batch {profile.batch} · {batchVenue}</p>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Today's scan verification status card */}
          {activeModule === 'training' && (
          <div className="clay-card p-6 space-y-4">
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">Today's Attendance Status</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50/80 border border-slate-100 clay-badge">
                <div className="flex items-center gap-3">
                  <span className="text-xl">🌅</span>
                  <div>
                    <p className="text-xs font-black text-slate-800">Forenoon Session</p>
                    <p className="text-[10px] text-slate-400 font-bold">FN1 / FN2</p>
                  </div>
                </div>
                {fnToday.length > 0 ? (
                  <span className="clay-badge bg-emerald-100 text-emerald-800 border border-emerald-200 px-3.5 py-1 text-xs font-black">Present</span>
                ) : (
                  <span className="clay-badge bg-slate-100 text-slate-400 border border-slate-200 px-3.5 py-1 text-xs font-bold">Pending</span>
                )}
              </div>

              <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50/80 border border-slate-100 clay-badge">
                <div className="flex items-center gap-3">
                  <span className="text-xl">🌇</span>
                  <div>
                    <p className="text-xs font-black text-slate-800">Afternoon Session</p>
                    <p className="text-[10px] text-slate-400 font-bold">AN1 / AN2</p>
                  </div>
                </div>
                {anToday.length > 0 ? (
                  <span className="clay-badge bg-emerald-100 text-emerald-800 border border-emerald-200 px-3.5 py-1 text-xs font-black">Present</span>
                ) : (
                  <span className="clay-badge bg-slate-100 text-slate-400 border border-slate-200 px-3.5 py-1 text-xs font-bold">Pending</span>
                )}
              </div>
            </div>
          </div>
          )}

          {/* CDC today's period status card */}
          {activeModule === 'cdc' && (
          <div className="clay-card p-6 space-y-4">
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">Today's CDC Periods</h3>
            {cdcLoading ? (
              <p className="text-xs text-slate-400 font-semibold">Loading…</p>
            ) : cdcTodayRecords.length === 0 ? (
              <p className="text-xs text-slate-400 font-semibold">No CDC period marked present yet today.</p>
            ) : (
              <div className="space-y-2.5">
                {cdcTodayRecords.sort((a, b) => a.period_number - b.period_number).map((r) => (
                  <div key={r.period_number} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50/80 border border-slate-100 clay-badge">
                    <div>
                      <p className="text-xs font-black text-slate-800">Period {r.period_number}{r.subject ? ` · ${r.subject}` : ''}</p>
                      <p className="text-[10px] text-slate-400 font-bold">Marked by {r.marked_by_name}</p>
                    </div>
                    <span className="clay-badge bg-emerald-100 text-emerald-800 border border-emerald-200 px-3.5 py-1 text-xs font-black">Present</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          )}
        </div>

        {/* Right Column: History Lists */}
        <div className="space-y-6">
          {/* Full History Feed */}
          {activeModule === 'training' && (
          <div className="clay-card p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-sm font-black text-slate-800 font-heading">Recent Attendance Logs</h3>
                <p className="text-xs text-slate-400 font-medium">List of your recent verified scans</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setHistoryOpen(true)}
                  className="clay-button-secondary text-xs text-brand-700 font-extrabold flex items-center gap-1.5 px-3.5 py-2"
                >
                  <span>📅</span> History
                </button>
                <button
                  onClick={() => fetchRecords()}
                  className="clay-button-secondary text-xs text-slate-600 font-extrabold flex items-center gap-1.5 px-3.5 py-2"
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
                <p className="text-xs font-extrabold text-slate-400">No attendance logs registered yet</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[340px] overflow-y-auto pr-2 space-y-3.5">
                {Object.entries(byDate).map(([date, recs]) => (
                  <div key={date} className="pt-3.5 first:pt-0">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2.5">
                      📅 {formatDate(date)}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {(recs as AttendanceRecord[]).map((r: AttendanceRecord) => (
                        <div key={r.id} className="clay-badge bg-white border border-slate-200/80 inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-slate-700">
                          <span className={`w-2.5 h-2.5 rounded-full ${r.session.startsWith('FN') ? 'bg-blue-500 shadow-sm shadow-blue-500/30' : 'bg-amber-500 shadow-sm shadow-amber-500/30'}`}></span>
                          <span className="text-slate-800">{r.session}</span>
                          <span className="text-slate-300">|</span>
                          <span className="text-slate-500 text-[10px] font-semibold">Marked by {r.marked_by_name || r.marked_by}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          )}

          {/* CDC Recent Attendance Logs */}
          {activeModule === 'cdc' && (
          <div className="clay-card p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-sm font-black text-slate-800 font-heading">Recent CDC Attendance</h3>
                <p className="text-xs text-slate-400 font-medium">List of your recent verified CDC period scans</p>
              </div>
              <button
                onClick={() => fetchCdcHistory()}
                className="clay-button-secondary text-xs text-slate-600 font-extrabold flex items-center gap-1.5 px-3.5 py-2"
                disabled={cdcLoading}
              >
                {cdcLoading ? (
                  <span className="w-3.5 h-3.5 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span>🔄</span>
                )}
                <span>Refresh</span>
              </button>
            </div>

            {cdcLoading ? (
              <div className="py-12 flex flex-col items-center justify-center space-y-2">
                <span className="w-8 h-8 border-3 border-brand-600 border-t-transparent rounded-full animate-spin"></span>
                <span className="text-xs text-slate-400 font-medium">Fetching record logs...</span>
              </div>
            ) : Object.keys(cdcByDate).length === 0 ? (
              <div className="text-center py-12 space-y-2">
                <span className="text-3xl">📭</span>
                <p className="text-xs font-extrabold text-slate-400">No CDC attendance logs registered yet</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[340px] overflow-y-auto pr-2 space-y-3.5">
                {Object.entries(cdcByDate).map(([date, recs]) => (
                  <div key={date} className="pt-3.5 first:pt-0">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2.5">
                      📅 {formatDate(date)}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {recs.map((r) => (
                        <div key={r.period_number} className="clay-badge bg-white border border-slate-200/80 inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-slate-700">
                          <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-sm shadow-indigo-500/30"></span>
                          <span className="text-slate-800">Period {r.period_number}{r.subject ? ` · ${r.subject}` : ''}</span>
                          <span className="text-slate-300">|</span>
                          <span className="text-slate-500 text-[10px] font-semibold">Marked by {r.marked_by_name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          )}
        </div>
      </div>

      <AboutApp />

      {/* Tactile Clay Attendance History Drawer / Modal */}
      {historyOpen && activeModule === 'training' && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-50 flex items-center justify-center p-4 md:p-6 animate-fade-in animate-duration-200">
          <div className="w-full max-w-3xl clay-card bg-white rounded-[2.5rem] border border-white shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-scale-in">
            {/* Modal Header */}
            <div className="p-6 sm:p-8 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black text-slate-800 font-heading">Complete Attendance History</h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">Total {filteredHistory.length} sessions matching active filters</p>
              </div>
              <button
                onClick={() => setHistoryOpen(false)}
                className="clay-button-secondary w-10 h-10 rounded-full flex items-center justify-center text-slate-600 font-black text-sm"
              >
                ✕
              </button>
            </div>

            {/* Filters Row */}
            <div className="p-6 bg-slate-50/70 border-b border-slate-100 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">From Date</label>
                <input
                  type="date"
                  value={histDateFrom}
                  onChange={(e) => setHistDateFrom(e.target.value)}
                  className="clay-input w-full px-3.5 py-2 text-xs font-bold text-slate-700"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">To Date</label>
                <input
                  type="date"
                  value={histDateTo}
                  onChange={(e) => setHistDateTo(e.target.value)}
                  className="clay-input w-full px-3.5 py-2 text-xs font-bold text-slate-700"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Session</label>
                <select
                  value={histSession}
                  onChange={(e) => setHistSession(e.target.value)}
                  className="clay-input w-full px-3.5 py-2 text-xs font-bold text-slate-700"
                >
                  <option value="">All Sessions</option>
                  <option value="FN1">FN1</option>
                  <option value="FN2">FN2</option>
                  <option value="AN1">AN1</option>
                  <option value="AN2">AN2</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Status</label>
                <select
                  value={histStatus}
                  onChange={(e) => setHistStatus(e.target.value)}
                  className="clay-input w-full px-3.5 py-2 text-xs font-bold text-slate-700"
                >
                  <option value="">All Statuses</option>
                  <option value="present">🟢 Present</option>
                  <option value="absent">🔴 Absent</option>
                </select>
              </div>
            </div>

            {/* Quick Search */}
            <div className="px-6 py-3 border-b border-slate-100 bg-white">
              <input
                type="text"
                placeholder="Search by faculty name or date..."
                value={histSearch}
                onChange={(e) => setHistSearch(e.target.value)}
                className="clay-input w-full px-4 py-2.5 text-xs font-medium"
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
                  <p className="text-xs font-extrabold text-slate-400">No matching attendance logs found</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-[1.75rem] border border-slate-200/70 bg-slate-50/50 p-2">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-slate-200/60 bg-slate-100/70">
                        <th className="p-3.5 font-black text-slate-600 uppercase tracking-wider">Date</th>
                        <th className="p-3.5 font-black text-slate-600 uppercase tracking-wider">Session</th>
                        <th className="p-3.5 font-black text-slate-600 uppercase tracking-wider">Status</th>
                        <th className="p-3.5 font-black text-slate-600 uppercase tracking-wider">Marked Time</th>
                        <th className="p-3.5 font-black text-slate-600 uppercase tracking-wider">Verified By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white rounded-xl">
                      {filteredHistory.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3.5 font-extrabold text-slate-800">{formatDate(item.date)}</td>
                          <td className="p-3.5">
                            <span className={`badge ${sessionColor(item.session)} text-[10px] clay-badge`}>
                              {item.session}
                            </span>
                          </td>
                          <td className="p-3.5">
                            {item.present ? (
                              <span className="clay-badge bg-emerald-100 text-emerald-800 border border-emerald-200 px-3 py-0.5 text-[10px] font-black">
                                🟢 Present
                              </span>
                            ) : (
                              <span className="clay-badge bg-red-100 text-red-800 border border-red-200 px-3 py-0.5 text-[10px] font-black">
                                🔴 Absent
                              </span>
                            )}
                          </td>
                          <td className="p-3.5 font-bold text-slate-500">
                            {item.timestamp ? formatTime(item.timestamp) : '—'}
                          </td>
                          <td className="p-3.5 font-extrabold text-slate-600">
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
                  className="px-4 py-2 rounded-xl text-xs font-black text-slate-500 hover:text-slate-800 transition-colors"
                >
                  Clear Filters
                </button>
              )}
              <button
                onClick={() => setHistoryOpen(false)}
                className="clay-button px-6 py-2.5 text-xs font-extrabold"
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
