'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { todayIST, formatDate, sessionColor } from '@/lib/utils'
import QrDisplay from '@/components/student/QrDisplay'
import type { AttendanceRecord, QrPayload } from '@/types'

export default function StudentDashboard() {
  const { profile } = useAuth()
  const supabase = createClient()
  const [records, setRecords]   = useState<AttendanceRecord[]>([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    if (!profile?.student_id) return
    supabase
      .from('attendance')
      .select('*')
      .eq('student_id', profile.student_id)
      .order('date', { ascending: false })
      .order('session')
      .limit(60)
      .then(({ data }: { data: any }) => {
        setRecords((data as AttendanceRecord[]) ?? [])
        setLoading(false)
      })
  }, [profile])

  const today = todayIST()
  const todayRecords = records.filter((r: AttendanceRecord) => r.date === today)
  const fnToday = todayRecords.filter((r: AttendanceRecord) => r.session.startsWith('FN'))
  const anToday = todayRecords.filter((r: AttendanceRecord) => r.session.startsWith('AN'))

  // Group history by date
  const byDate = records.reduce<Record<string, AttendanceRecord[]>>((acc: Record<string, AttendanceRecord[]>, r: AttendanceRecord) => {
    if (!acc[r.date]) acc[r.date] = []
    acc[r.date].push(r)
    return acc
  }, {})

  const qrPayload: QrPayload | null = profile?.student_id
    ? {
        student_id: profile.student_id,
        name:       profile.name,
        department: profile.department ?? '',
        year:       profile.year ?? 1,
        section:    profile.section ?? '',
        ts:         0, // QrDisplay overrides ts on each render
      }
    : null

  return (
    <div className="space-y-8 animate-fade-in pb-10">
      <div className="glass p-6 rounded-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-brand-500/10 rounded-full blur-2xl -mr-10 -mt-10"></div>
        <h1 className="text-2xl font-bold text-slate-900">{profile?.name}</h1>
        <p className="text-sm text-slate-500 mt-1">
          {profile?.department} · Year {profile?.year} · Section {profile?.section}
        </p>
        <p className="text-xs font-mono text-slate-400 mt-2 bg-white/50 inline-block px-2 py-1 rounded-md">{profile?.student_id}</p>
      </div>

      {/* QR Code */}
      {qrPayload && <QrDisplay basePayload={qrPayload} />}

      {/* Today's summary */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card text-center flex flex-col items-center justify-center p-6">
          <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mb-3">
            <span className="text-xl">🌅</span>
          </div>
          <p className="text-3xl font-bold text-slate-900">{fnToday.length}</p>
          <p className="text-xs font-medium text-slate-500 mt-1 uppercase tracking-wider">FN Sessions</p>
        </div>
        <div className="card text-center flex flex-col items-center justify-center p-6">
          <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mb-3">
            <span className="text-xl">🌇</span>
          </div>
          <p className="text-3xl font-bold text-slate-900">{anToday.length}</p>
          <p className="text-xs font-medium text-slate-500 mt-1 uppercase tracking-wider">AN Sessions</p>
        </div>
      </div>

      {/* Attendance history */}
      <div className="card">
        <h2 className="text-base font-semibold text-slate-800 mb-4">Attendance History</h2>
        {loading ? (
          <p className="text-sm text-slate-400 text-center py-6">Loading…</p>
        ) : Object.keys(byDate).length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">No attendance records yet.</p>
        ) : (
          <div className="space-y-4">
            {Object.entries(byDate).map(([date, recs]) => (
              <div key={date}>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  {formatDate(date)}
                </p>
                <div className="flex flex-wrap gap-2">
                  {(recs as AttendanceRecord[]).map((r: AttendanceRecord) => (
                    <span key={r.id} className={`badge ${sessionColor(r.session)} text-xs font-semibold`}>
                      {r.session}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
