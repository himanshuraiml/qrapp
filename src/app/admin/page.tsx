'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { todayIST, formatDate } from '@/lib/utils'
import { readCache, writeCache, CACHE_TTL } from '@/lib/cache'
import StatsCard from '@/components/StatsCard'
import SectionSummaryTable from '@/components/admin/SectionSummaryTable'
import SessionBarChart from '@/components/admin/SessionBarChart'
import type { DashboardStats, SectionSummary } from '@/types'

export default function AdminDashboard() {
  const { loading: authLoading } = useAuth()
  const supabase = createClient()
  const [date, setDate]       = useState(todayIST())
  const [dept, setDept]       = useState('')
  const [stats, setStats]     = useState<DashboardStats | null>(null)
  const [summary, setSummary] = useState<SectionSummary[]>([])
  const [depts, setDepts]     = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const cached = readCache<string[]>('dept_list', CACHE_TTL.options)
    if (cached) { setDepts(cached); return }
    supabase
      .from('profiles')
      .select('department')
      .eq('role', 'Student')
      .not('department', 'is', null)
      .then(({ data }) => {
        const unique = [...new Set((data ?? []).map((r: any) => r.department))].sort()
        writeCache('dept_list', unique)
        setDepts(unique)
      })
  }, [])

  useEffect(() => {
    if (authLoading) return
    async function load() {
      setLoading(true)
      try {
        const [{ data: statsData }, { data: sumData }] = await Promise.all([
          supabase.rpc('get_dashboard_stats', { p_date: date }),
          supabase.rpc('get_section_summary', {
            p_date: date,
            p_department: dept || null,
          }),
        ])
        setStats(statsData)
        setSummary(sumData ?? [])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [date, dept, authLoading])

  return (
    <div className="space-y-8 animate-fade-in pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 glass p-6 rounded-2xl">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm font-medium text-slate-500 mt-1">{formatDate(date)}</p>
        </div>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="input w-auto text-sm shadow-sm"
        />
      </div>

      {/* Stats cards */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card animate-pulse h-28 bg-slate-100" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard label="Total Students" value={stats?.total_students ?? 0} icon="👨‍🎓" color="blue" />
          <StatsCard label="Total Faculty"  value={stats?.total_faculty  ?? 0} icon="👩‍🏫" color="purple" />
          <StatsCard label="Present Today"  value={stats?.today_attendance ?? 0} icon="✅" color="green" />
          <StatsCard
            label="Attendance %"
            value={`${stats?.attendance_pct ?? 0}%`}
            icon="📊"
            color={
              (stats?.attendance_pct ?? 0) >= 75 ? 'green' :
              (stats?.attendance_pct ?? 0) >= 50 ? 'amber' : 'red'
            }
          />
        </div>
      )}

      {/* Session chart */}
      {!loading && stats && (
        <div className="card">
          <h2 className="text-base font-semibold text-slate-800 mb-4">Scans per Session</h2>
          <SessionBarChart bySession={stats.by_session} />
        </div>
      )}

      {/* Section summary table */}
      <div className="card">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h2 className="text-base font-semibold text-slate-800">
            Section-wise Attendance
          </h2>
          <div className="flex items-center gap-2">
            <select
              value={dept}
              onChange={(e) => setDept(e.target.value)}
              className="input text-sm w-40"
            >
              <option value="">All Departments</option>
              {depts.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>
        <SectionSummaryTable rows={summary} loading={loading} date={date} />
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Reports',    href: '/admin/reports',  icon: '📄' },
          { label: 'Students',   href: '/admin/students', icon: '👥' },
          { label: 'Faculty',    href: '/admin/faculty',  icon: '🏫' },
          { label: 'Settings',   href: '/admin/settings', icon: '⚙️' },
        ].map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="card flex flex-col items-center gap-2 hover:border-brand-500
                       hover:shadow-md transition-all cursor-pointer text-center p-4"
          >
            <span className="text-2xl">{item.icon}</span>
            <span className="text-sm font-medium text-slate-700">{item.label}</span>
          </a>
        ))}
      </div>
    </div>
  )
}
