'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { todayIST, formatDate } from '@/lib/utils'
import QrDisplay from '@/components/student/QrDisplay'
import AboutApp from '@/components/AboutApp'
import type { AttendanceRecord, QrPayload } from '@/types'

export default function StudentDashboard() {
  const { profile, loading: authLoading } = useAuth()
  const supabase = createClient()
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [loading, setLoading] = useState(true)

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

  // Initial fetch
  useEffect(() => {
    if (authLoading) return
    if (!profile?.student_id) {
      setLoading(false)
      return
    }
    fetchRecords()
  }, [authLoading, profile?.student_id, fetchRecords])

  // Real-time subscription
  useEffect(() => {
    if (authLoading || !profile?.student_id) return

    const channel = supabase
      .channel(`student_attendance_${profile.student_id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'attendance',
          filter: `student_id=eq.${profile.student_id}`,
        },
        (payload) => {
          const newRecord = payload.new as AttendanceRecord
          setRecords((prev) => {
            if (prev.some((r) => r.id === newRecord.id)) return prev
            return [newRecord, ...prev].sort((a, b) => {
              if (a.date !== b.date) return b.date.localeCompare(a.date)
              return b.session.localeCompare(a.session)
            })
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [profile?.student_id, authLoading, supabase])

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

  const qrPayload: QrPayload | null = useMemo(() => profile?.student_id
    ? {
        student_id: profile.student_id,
        name: profile.name,
        department: profile.department ?? '',
        year: profile.year ?? 1,
        section: profile.section ?? '',
        ts: 0,
      }
    : null,
  [profile?.student_id, profile?.name, profile?.department, profile?.year, profile?.section])

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
    <div className="space-y-8 animate-fade-in pb-12 max-w-4xl mx-auto px-4 md:px-0">
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
                      Batch {profile.batch}
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Left Column: QR Code Component */}
        <div className="space-y-6">
          {qrPayload && <QrDisplay basePayload={qrPayload} />}

          {/* Today's scan verification status */}
          <div className="card space-y-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Today's Attendance Status</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                <div className="flex items-center gap-2.5">
                  <span className="text-lg">🌅</span>
                  <div>
                    <p className="text-xs font-bold text-slate-800">Forenoon Session</p>
                    <p className="text-[10px] text-slate-400 font-medium">FN1 / FN2 / FN3</p>
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
                    <p className="text-[10px] text-slate-400 font-medium">AN1 / AN2 / AN3</p>
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
              <button
                onClick={() => fetchRecords()}
                className="text-xs text-brand-600 hover:text-brand-700 font-bold flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-50 hover:bg-brand-100 transition-all duration-300"
                disabled={loading}
              >
                {loading ? (
                  <span className="w-3.5 h-3.5 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span>🔄</span>
                )}
                <span>Refresh Logs</span>
              </button>
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
    </div>
  )
}
