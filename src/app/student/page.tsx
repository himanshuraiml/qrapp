'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { todayIST, formatDate, sessionColor } from '@/lib/utils'
import QrDisplay from '@/components/student/QrDisplay'
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

  // Dynamic percentage metrics (let's assume a total of 45 working days for the term)
  const totalWorkingSessions = 90 // 45 days * 2 sessions per day
  const attendedCount = records.length
  const attendancePercentage = Math.min(
    Math.round((attendedCount / (totalWorkingSessions || 1)) * 100) || 0,
    100
  )

  // Subject-wise attendance calculation helper (mocked for realistic academic structure)
  const subjects = [
    { name: 'Computer Networks', code: 'CS1021', present: Math.round(attendancePercentage * 1.05), total: 30, color: 'from-blue-500 to-indigo-500' },
    { name: 'Database Systems', code: 'CS1022', present: Math.round(attendancePercentage * 0.95), total: 30, color: 'from-violet-500 to-indigo-600' },
    { name: 'Operating Systems', code: 'CS1023', present: Math.round(attendancePercentage * 0.92), total: 30, color: 'from-brand-500 to-indigo-500' },
  ]

  return (
    <div className="space-y-8 animate-fade-in pb-12 max-w-4xl mx-auto px-4 md:px-0">
      {/* Premium Profile Banner Card */}
      <div className="card-premium relative overflow-hidden bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 border-white/10 shadow-2xl p-8 rounded-[2rem] flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div className="absolute top-[-50%] right-[-10%] w-[350px] h-[350px] bg-brand-500/10 rounded-full blur-[80px]"></div>
        
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-300 text-xs font-bold uppercase tracking-wider">
            <span>🎓</span> Student Profile
          </div>
          <div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight font-heading">{profile?.name}</h1>
            <p className="text-slate-400 text-sm mt-1.5 flex items-center gap-1.5 font-medium">
              <span>{profile?.department}</span>
              <span className="text-slate-600">•</span>
              <span>Year {profile?.year}</span>
              <span className="text-slate-600">•</span>
              <span>Section {profile?.section}</span>
            </p>
          </div>
          <div className="inline-block bg-white/5 border border-white/10 px-3.5 py-1.5 rounded-xl font-mono text-xs text-brand-300 select-all shadow-inner">
            ID: {profile?.student_id}
          </div>
        </div>

        {/* Attendance Ring Widget */}
        <div className="flex items-center gap-4 bg-white/5 border border-white/10 p-5 rounded-2xl backdrop-blur-md">
          <div className="relative flex items-center justify-center">
            <svg width={72} height={72} className="transform -rotate-90">
              <circle cx={36} cy={36} r={30} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={6} />
              <circle
                cx={36} cy={36} r={30}
                fill="none"
                stroke="url(#blueGradient)"
                strokeWidth={6}
                strokeDasharray={`${2 * Math.PI * 30}`}
                strokeDashoffset={`${2 * Math.PI * 30 * (1 - attendancePercentage / 100)}`}
                strokeLinecap="round"
                className="transition-all duration-1000 ease-out"
              />
              <defs>
                <linearGradient id="blueGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#3b82f6" />
                  <stop offset="100%" stopColor="#6366f1" />
                </linearGradient>
              </defs>
            </svg>
            <span className="absolute text-sm font-extrabold text-white">{attendancePercentage}%</span>
          </div>
          <div className="space-y-0.5">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Overall Attendance</p>
            <p className="text-lg font-extrabold text-white">{attendedCount} / {totalWorkingSessions} <span className="text-xs font-medium text-slate-400">sessions</span></p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: QR Code Component */}
        <div className="md:col-span-1 space-y-6">
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

        {/* Right Column: Subjects + History Lists */}
        <div className="md:col-span-2 space-y-6">
          {/* Subject-Wise Cards */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Subject-Wise attendance</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {subjects.map((sub) => (
                <div key={sub.name} className="card p-5 space-y-3 flex flex-col justify-between group hover:border-brand-500/20 transition-all duration-300">
                  <div>
                    <span className="text-[10px] font-bold text-brand-600 bg-brand-50 px-2 py-0.5 rounded-md font-mono">{sub.code}</span>
                    <h4 className="text-xs font-extrabold text-slate-800 mt-2 line-clamp-1 group-hover:text-brand-600 transition-colors">{sub.name}</h4>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-end text-xs">
                      <span className="font-extrabold text-slate-800">{Math.min(sub.present, 100)}%</span>
                      <span className="text-slate-400 text-[10px] font-medium">{Math.min(Math.round(sub.total * (sub.present / 100)), sub.total)}/{sub.total} classes</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full bg-gradient-to-r ${sub.color} rounded-full transition-all duration-500`} style={{ width: `${Math.min(sub.present, 100)}%` }}></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

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
    </div>
  )
}
