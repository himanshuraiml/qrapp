'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import CdcTimetable from './CdcTimetable'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { useModule } from '@/context/ModuleContext'
import { todayIST } from '@/lib/utils'

interface CdcStats {
  totalStudents: number
  presentToday: number
  attendancePct: number
  totalScansToday: number
  periodsConducted: number
  periodCounts: Record<number, number>
}

export default function CdcDashboard() {
  const { profile, loading: authLoading } = useAuth()
  const { cdcPeriods } = useModule()
  const supabase = createClient()

  const [stats, setStats] = useState<CdcStats>({
    totalStudents: 0,
    presentToday: 0,
    attendancePct: 0,
    totalScansToday: 0,
    periodsConducted: 0,
    periodCounts: {},
  })
  const [loading, setLoading] = useState(true)

  // Calculate current period based on system time and configured CDC period times
  const getCurrentPeriodInfo = () => {
    const now = new Date()
    const currentMins = now.getHours() * 60 + now.getMinutes()

    for (const p of cdcPeriods) {
      if (!p.start_time || !p.end_time) continue
      const [sH, sM] = p.start_time.split(':').map(Number)
      const [eH, eM] = p.end_time.split(':').map(Number)
      const startMins = sH * 60 + sM
      const endMins = eH * 60 + eM

      if (currentMins >= startMins && currentMins <= endMins) {
        return {
          period: p.period,
          startTime: p.start_time,
          endTime: p.end_time,
          isLive: true,
        }
      }
    }

    const upcoming = cdcPeriods.find((p) => {
      if (!p.start_time) return false
      const [sH, sM] = p.start_time.split(':').map(Number)
      return sH * 60 + sM > currentMins
    })

    if (upcoming) {
      return {
        period: upcoming.period,
        startTime: upcoming.start_time,
        endTime: upcoming.end_time,
        isLive: false,
        isNext: true,
      }
    }

    return { period: null, startTime: null, endTime: null, isLive: false }
  }

  const currentPeriodInfo = getCurrentPeriodInfo()

  useEffect(() => {
    if (authLoading) return

    async function loadRealKpiStats() {
      setLoading(true)
      try {
        const today = todayIST()

        // 1. Total Enrolled Students
        const { count: studentCount } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .eq('role', 'Student')

        const totalEnrolled = studentCount || 0

        // 2. Fetch today's CDC attendance records
        const { data: todayLogs } = await supabase
          .from('cdc_attendance')
          .select('student_id, period_number')
          .eq('date', today)

        const logs = todayLogs || []

        // Distinct present students today
        const distinctPresent = new Set(logs.map((r) => r.student_id)).size

        // Attendance % so far
        const pct = totalEnrolled > 0 ? Math.round((distinctPresent / totalEnrolled) * 100) : 0

        // Periods conducted today
        const conductedSet = new Set(logs.map((r) => r.period_number))

        // Count per period
        const periodCounts: Record<number, number> = {}
        logs.forEach((r) => {
          periodCounts[r.period_number] = (periodCounts[r.period_number] || 0) + 1
        })

        setStats({
          totalStudents: totalEnrolled,
          presentToday: distinctPresent,
          attendancePct: pct,
          totalScansToday: logs.length,
          periodsConducted: conductedSet.size,
          periodCounts,
        })
      } catch (err) {
        console.error('Failed to load CDC real stats:', err)
      } finally {
        setLoading(false)
      }
    }

    loadRealKpiStats()
  }, [supabase, authLoading])

  const isFaculty = profile?.role === 'Faculty'

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-r from-indigo-900 via-indigo-950 to-slate-900 border border-indigo-800/50 shadow-xl p-6 sm:p-8 text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="relative z-10 space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-indigo-500/20 border border-indigo-400/30 text-indigo-300">
            📚 Career Development Cell Module
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight font-heading">
            CDC Classes Hub
          </h1>
          <p className="text-indigo-200/80 text-xs sm:text-sm max-w-xl leading-relaxed">
            Manage ongoing CDC class timetables, period-wise attendance (Period 1 to 8), student rosters, and analytics.
          </p>
        </div>

        <div className="relative z-10 flex flex-wrap items-center gap-3">
          <Link
            href="/faculty/scan"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-indigo-500 hover:bg-indigo-600 text-white font-extrabold text-xs shadow-lg shadow-indigo-500/30 transition-all active:scale-95"
          >
            <span>📷</span>
            <span>Scan Period QR</span>
          </Link>
          {!isFaculty && (
            <Link
              href="/admin/settings"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/15 text-white font-bold text-xs backdrop-blur-md transition-all active:scale-95"
            >
              <span>⚙️</span>
              <span>Period Settings</span>
            </Link>
          )}
        </div>
      </div>

      {/* Real KPI Stats Cards Grid (Admin Only) */}
      {!isFaculty && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* KPI 1: Total Enrolled Students */}
          <div className="card bg-white p-5 border border-slate-100 shadow-sm flex items-center justify-between hover:shadow-md transition-all group">
            <div className="space-y-1">
              <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Total Enrolled Students</p>
              <h3 className="text-2xl font-black text-slate-900 font-heading">
                {loading ? '—' : stats.totalStudents}
              </h3>
              <p className="text-xs text-indigo-600 font-semibold flex items-center gap-1">
                <span>🎓</span> Active CDC Candidates
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
              👥
            </div>
          </div>

          {/* KPI 2: Total Present Students (So Far Today) */}
          <div className="card bg-white p-5 border border-slate-100 shadow-sm flex items-center justify-between hover:shadow-md transition-all group">
            <div className="space-y-1">
              <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Total Present Today (So Far)</p>
              <h3 className="text-2xl font-black text-slate-900 font-heading">
                {loading ? '—' : `${stats.presentToday} / ${stats.totalStudents}`}
              </h3>
              <p className="text-xs text-emerald-600 font-extrabold flex items-center gap-1">
                <span>📊</span> {loading ? '...' : `${stats.attendancePct}% Student Turnout`}
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
              ✅
            </div>
          </div>

          {/* KPI 3: Current Period */}
          <div className="card bg-white p-5 border border-slate-100 shadow-sm flex items-center justify-between hover:shadow-md transition-all group">
            <div className="space-y-1">
              <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Current Period Status</p>
              <h3 className="text-2xl font-black text-slate-900 font-heading flex items-center gap-2">
                {loading ? (
                  '—'
                ) : currentPeriodInfo.isLive ? (
                  <>
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
                    <span>Period {currentPeriodInfo.period}</span>
                  </>
                ) : currentPeriodInfo.isNext ? (
                  <span className="text-slate-700">Next: Period {currentPeriodInfo.period}</span>
                ) : (
                  <span className="text-slate-500">Off Hours</span>
                )}
              </h3>
              <p className="text-xs text-indigo-600 font-semibold">
                {currentPeriodInfo.startTime && currentPeriodInfo.endTime
                  ? `${currentPeriodInfo.startTime} - ${currentPeriodInfo.endTime}`
                  : '9:00 AM - 5:00 PM · 8 Periods'}
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
              📅
            </div>
          </div>

          {/* KPI 4: Periods Conducted Today */}
          <div className="card bg-white p-5 border border-slate-100 shadow-sm flex items-center justify-between hover:shadow-md transition-all group">
            <div className="space-y-1">
              <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Periods Marked Today</p>
              <h3 className="text-2xl font-black text-slate-900 font-heading">
                {loading ? '—' : `${stats.periodsConducted} / 8 Periods`}
              </h3>
              <p className="text-xs text-amber-600 font-semibold flex items-center gap-1">
                <span>⚡</span> {loading ? '...' : `${stats.totalScansToday} Period Scans`}
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
              ⚡
            </div>
          </div>
        </div>
      )}

      {/* Today's 8-Period Attendance Tracker Bar */}
      <div className="card bg-white p-6 border border-slate-100 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h4 className="text-sm font-extrabold text-slate-800 font-heading flex items-center gap-2">
              <span>🕒</span> Today&apos;s 8-Period Attendance Breakdown
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">Real-time attendance scan counts recorded across each period today.</p>
          </div>
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-full">
            Live Daily Tracker
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 pt-1">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((pNum) => {
            const count = stats.periodCounts[pNum] || 0
            const isCurrent = currentPeriodInfo.isLive && currentPeriodInfo.period === pNum
            const periodConfig = cdcPeriods.find((p) => p.period === pNum)

            return (
              <div
                key={pNum}
                className={`p-3 rounded-2xl border transition-all text-center space-y-1 ${
                  isCurrent
                    ? 'bg-indigo-50/90 border-indigo-300 ring-2 ring-indigo-500/20'
                    : count > 0
                    ? 'bg-emerald-50/60 border-emerald-200'
                    : 'bg-slate-50/80 border-slate-200/80'
                }`}
              >
                <div className="flex items-center justify-center gap-1.5">
                  <span className="text-xs font-black text-slate-800">Period {pNum}</span>
                  {isCurrent && <span className="w-2 h-2 rounded-full bg-indigo-600 animate-ping"></span>}
                </div>

                <div className={`text-lg font-black ${count > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>
                  {count > 0 ? `${count} Present` : '—'}
                </div>

                <div className="text-[10px] text-slate-400 font-medium">
                  {periodConfig?.start_time ? `${periodConfig.start_time} - ${periodConfig.end_time}` : `P${pNum}`}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 8-Period Master Timetable Schedule Grid */}
      <CdcTimetable />
    </div>
  )
}
