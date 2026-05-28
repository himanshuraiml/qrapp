'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { todayIST, formatDate } from '@/lib/utils'
import StatsCard from '@/components/StatsCard'
import SectionSummaryTable from '@/components/admin/SectionSummaryTable'
import SessionBarChart from '@/components/admin/SessionBarChart'
import type { DashboardStats, SectionSummary } from '@/types'

export default function AdminDashboard() {
  const { loading: authLoading } = useAuth()
  const supabase = createClient()
  const [date, setDate] = useState(todayIST())
  const [dept, setDept] = useState('')
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [summary, setSummary] = useState<SectionSummary[]>([])
  const [depts, setDepts] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('profiles')
      .select('department')
      .eq('role', 'Student')
      .not('department', 'is', null)
      .then(({ data }) => {
        const unique = [...new Set((data ?? []).map((r: any) => r.department))].sort()
        setDepts(unique)
      })
  }, [supabase])

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
  }, [date, dept, authLoading, supabase])

  return (
    <div className="space-y-8 animate-fade-in pb-12 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Premium Header Card */}
      <div className="card-premium relative overflow-hidden bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 border-white/10 shadow-2xl p-8 rounded-[2rem] flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div className="absolute top-[-50%] right-[-10%] w-[350px] h-[350px] bg-brand-500/10 rounded-full blur-[80px]"></div>
        
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-300 text-xs font-bold uppercase tracking-wider">
            <span>📊</span> Admin Control Panel
          </div>
          <div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight font-heading">SRMIST Trichy</h1>
            <p className="text-slate-400 text-sm mt-1.5 font-medium">
              Academic Attendance Management & Analytical Roster
            </p>
          </div>
        </div>

        {/* Date Selector */}
        <div className="flex flex-col space-y-1.5 bg-white/5 border border-white/10 p-3 rounded-2xl">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Selected Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="bg-transparent border-0 text-white font-bold text-sm focus:outline-none focus:ring-0 cursor-pointer"
          />
        </div>
      </div>

      {/* Stats Cards Grid */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 bg-slate-50 border border-slate-100 rounded-[2rem] animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          <StatsCard label="Total Students" value={stats?.total_students ?? 0} icon="👨‍🎓" color="blue" />
          <StatsCard label="Total Faculty" value={stats?.total_faculty ?? 0} icon="👩‍🏫" color="purple" />
          <StatsCard label="Present Today" value={stats?.today_attendance ?? 0} icon="✅" color="green" />
          <StatsCard
            label="Attendance Rate"
            value={`${stats?.attendance_pct ?? 0}%`}
            icon="📈"
            color={
              (stats?.attendance_pct ?? 0) >= 75 ? 'green' :
              (stats?.attendance_pct ?? 0) >= 50 ? 'amber' : 'red'
            }
          />
        </div>
      )}

      {/* Analytical Charts and Summary Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Scans per Session Chart (1/3 Width on Desktop) */}
        <div className="card space-y-5 lg:col-span-1 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-extrabold text-slate-800 font-heading">Scans per session</h3>
            <p className="text-xs text-slate-400">Sweeps distribution count for active classes</p>
          </div>
          {loading ? (
            <div className="h-48 bg-slate-50 rounded-2xl animate-pulse" />
          ) : (
            stats && <SessionBarChart bySession={stats.by_session} />
          )}
        </div>

        {/* Section-Wise Attendance Table (2/3 Width on Desktop) */}
        <div className="card space-y-5 lg:col-span-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-sm font-extrabold text-slate-800 font-heading">Section-wise Attendance</h3>
              <p className="text-xs text-slate-400">Scans summary sorted by department classrooms</p>
            </div>
            
            <div className="relative w-full sm:max-w-xs">
              <select
                value={dept}
                onChange={(e) => setDept(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-4 py-2 text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 font-bold text-slate-700"
              >
                <option value="">All Departments</option>
                {depts.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>
          <SectionSummaryTable rows={summary} loading={loading} date={date} />
        </div>
      </div>

      {/* Visual Quick Actions Shortcut Matrix */}
      <div className="space-y-4">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest pl-1">Quick Management Actions</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
          {[
            { label: 'Reports & Logs', href: '/admin/reports', icon: '📄', color: 'from-blue-500 to-cyan-500 shadow-blue-500/10' },
            { label: 'Manage Students', href: '/admin/students', icon: '👥', color: 'from-indigo-500 to-blue-500 shadow-indigo-500/10' },
            { label: 'Manage Faculty', href: '/admin/faculty', icon: '🏫', color: 'from-violet-500 to-indigo-500 shadow-violet-500/10' },
            { label: 'Session Settings', href: '/admin/settings', icon: '⚙️', color: 'from-slate-700 to-slate-800 shadow-slate-500/10' },
          ].map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="card flex flex-col items-center justify-center gap-3 p-6 text-center hover:-translate-y-1 hover:border-brand-500/20 transition-all duration-300 group shadow-sm"
            >
              <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${item.color} shadow-lg text-white flex items-center justify-center text-xl group-hover:scale-110 transition-transform duration-300`}>
                {item.icon}
              </div>
              <span className="text-xs font-bold text-slate-700 font-heading">{item.label}</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
