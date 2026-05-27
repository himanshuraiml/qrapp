'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { todayIST, formatDate, sessionColor } from '@/lib/utils'
import { readCache, writeCache, CACHE_TTL } from '@/lib/cache'
import QrDisplay from '@/components/student/QrDisplay'
import type { AttendanceRecord, QrPayload } from '@/types'

export default function StudentDashboard() {
  const { profile, loading: authLoading } = useAuth()
  const supabase = createClient()
  const [records, setRecords]   = useState<AttendanceRecord[]>([])
  const [loading, setLoading]   = useState(true)

  const fetchRecords = useCallback(async (bypassCache = false) => {
    if (!profile?.student_id) return
    const cacheKey = `attendance_${profile.student_id}_${todayIST()}`
    
    if (!bypassCache) {
      const cached = readCache<AttendanceRecord[]>(cacheKey, CACHE_TTL.attendance)
      if (cached) {
        setRecords(cached)
        setLoading(false)
        return
      }
    }

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
        const rows = (data as AttendanceRecord[]) ?? []
        writeCache(cacheKey, rows)
        setRecords(rows)
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
    fetchRecords(false)
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
            // Check for duplicates
            if (prev.some((r) => r.id === newRecord.id)) return prev
            const updated = [newRecord, ...prev].sort((a, b) => {
              if (a.date !== b.date) return b.date.localeCompare(a.date)
              return b.session.localeCompare(a.session)
            })
            // Update cache as well
            const cacheKey = `attendance_${profile.student_id}_${todayIST()}`
            writeCache(cacheKey, updated)
            return updated
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
  const byDate = records.reduce<Record<string, AttendanceRecord[]>>((acc: Record<string, AttendanceRecord[]>, r: AttendanceRecord) => {
    if (!acc[r.date]) acc[r.date] = []
    acc[r.date].push(r)
    return acc
  }, {})

  const qrPayload: QrPayload | null = useMemo(() => profile?.student_id
    ? {
        student_id: profile.student_id,
        name:       profile.name,
        department: profile.department ?? '',
        year:       profile.year ?? 1,
        section:    profile.section ?? '',
        ts:         0,
      }
    : null,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [profile?.student_id, profile?.name, profile?.department, profile?.year, profile?.section])

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
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-800">Attendance History</h2>
          <button
            onClick={() => fetchRecords(true)}
            className="text-xs text-brand-600 hover:text-brand-700 font-semibold flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-brand-50 hover:bg-brand-100 transition-colors"
            disabled={loading}
          >
            {loading ? (
              <span className="w-3 h-3 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
            ) : (
              <span className="text-xs">🔄</span>
            )}
            <span>Refresh</span>
          </button>
        </div>
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
