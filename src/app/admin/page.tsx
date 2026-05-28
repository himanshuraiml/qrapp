'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { todayIST, formatDate } from '@/lib/utils'
import SectionSummaryTable from '@/components/admin/SectionSummaryTable'
import SessionBarChart from '@/components/admin/SessionBarChart'
import type { DashboardStats, SectionSummary } from '@/types'
import AboutApp from '@/components/AboutApp'

function KpiCard({
  label, value, sub, icon, gradient, trend,
}: {
  label: string
  value: string | number
  sub?: string
  icon: string
  gradient: string
  trend?: { label: string; up?: boolean }
}) {
  return (
    <div className="relative bg-white/70 backdrop-blur-xl rounded-2xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.03)] p-5 flex flex-col gap-4 overflow-hidden group hover:shadow-[0_8px_30px_rgba(37,99,235,0.08)] hover:-translate-y-0.5 transition-all duration-300">
      {/* Subtle gradient tint */}
      <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 ${gradient} pointer-events-none`} />

      <div className="flex items-start justify-between relative z-10">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl shadow-sm ${gradient} opacity-90`}>
          {icon}
        </div>
        {trend && (
          <span className={`text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 ${
            trend.up !== false
              ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
              : 'bg-red-50 text-red-500 border border-red-100'
          }`}>
            {trend.up !== false ? '↑' : '↓'} {trend.label}
          </span>
        )}
      </div>

      <div className="relative z-10">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</p>
        <p className="text-3xl font-extrabold text-slate-800 tracking-tight mt-1 font-heading">{value}</p>
        {sub && <p className="text-[10px] text-slate-400 font-medium mt-1">{sub}</p>}
      </div>
    </div>
  )
}

const QUICK_ACTIONS = [
  {
    label: 'Reports & Logs',
    href: '/admin/reports',
    icon: '📄',
    desc: 'View & export attendance logs',
    gradient: 'from-primary-600 to-tertiary-500',
    shadow: 'shadow-primary-500/20',
  },
  {
    label: 'Manage Students',
    href: '/admin/students',
    icon: '👥',
    desc: 'Student roster & registration',
    gradient: 'from-secondary-600 to-primary-500',
    shadow: 'shadow-secondary-500/20',
  },
  {
    label: 'Manage Faculty',
    href: '/admin/faculty',
    icon: '🏫',
    desc: 'Faculty directory & accounts',
    gradient: 'from-tertiary-600 to-secondary-500',
    shadow: 'shadow-tertiary-500/20',
  },
  {
    label: 'Session Settings',
    href: '/admin/settings',
    icon: '⚙️',
    desc: 'Configure scan time windows',
    gradient: 'from-neutral-700 to-neutral-800',
    shadow: 'shadow-neutral-500/10',
  },
]

const LABELS = {
  adminControlPanel: 'Admin Control Panel',
  srmistTrichy: 'SRMIST Trichy',
  analyticsSubtitle: 'Academic Attendance Management & Analytics',
  todaysRate: "Today's Rate",
  viewingDate: '📅 Viewing Date',
  sessionScanBreakdown: 'Session Scan Breakdown',
  scansPerSlot: 'Scans per FN / AN session slot',
  fnSessions: 'FN Sessions',
  anSessions: 'AN Sessions',
  sectionWiseAttendance: 'Section-wise Attendance',
  classroomBreakdown: 'Classroom attendance breakdown by department',
  allDepartments: 'All Departments',
  quickManagementActions: 'Quick Management Actions',
  jumpToSection: 'Jump to any section',
  open: 'Open',
}

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

  const pct = stats?.attendance_pct ?? 0
  const pctColor = pct >= 75 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-500' : 'text-red-500'
  const pctBar = pct >= 75 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'

  return (
    <div className="space-y-8 animate-fade-in pb-14">

      {/* ── Hero Header ─────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-neutral-900 via-neutral-800 to-secondary-950 border border-white/10 shadow-2xl p-6 sm:p-8">
        {/* Ambient orbs */}
        <div className="absolute -top-24 -right-24 w-80 h-80 bg-primary-500/10 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-72 h-72 bg-secondary-500/10 rounded-full blur-[80px] pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-32 bg-tertiary-500/5 rounded-full blur-[60px] pointer-events-none" />

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          {/* Left: Title */}
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-500/10 border border-primary-500/25 text-primary-300 text-[10px] font-bold uppercase tracking-widest">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-400 animate-pulse" />
              {LABELS.adminControlPanel}
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight font-heading leading-tight">
                {LABELS.srmistTrichy}
              </h1>
              <p className="text-neutral-400 text-sm mt-1 font-medium">
                {LABELS.analyticsSubtitle}
              </p>
            </div>
            {/* Attendance rate bar */}
            <div className="mt-2 max-w-xs space-y-1.5">
              <div className="flex items-center justify-between text-[10px] font-bold">
                <span className="text-neutral-500 uppercase tracking-widest">{LABELS.todaysRate}</span>
                <span className={loading ? 'text-neutral-500' : pctColor}>
                  {loading ? '—' : `${pct}%`}
                </span>
              </div>
              <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ${loading ? 'bg-white/20 w-1/3 animate-pulse' : pctBar}`}
                  style={{ width: loading ? undefined : `${pct}%` }}
                />
              </div>
            </div>
          </div>

          {/* Right: Date picker card */}
          <div className="w-full sm:w-auto flex flex-col items-start sm:items-end gap-3">
            <div className="flex flex-col bg-white/5 border border-white/10 rounded-2xl px-4 py-3 min-w-[180px]">
              <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1.5">
                {LABELS.viewingDate}
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="bg-transparent border-0 text-white font-bold text-sm focus:outline-none cursor-pointer"
              />
            </div>
            <p className="text-[10px] text-neutral-500 font-medium">
              {formatDate(date)}
            </p>
          </div>
        </div>
      </div>

      {/* ── KPI Cards ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-36 bg-white/50 border border-neutral-100 rounded-2xl animate-pulse" />
          ))
        ) : (
          <>
            <KpiCard
              label="Total Students"
              value={stats?.total_students ?? 0}
              sub="Registered learners"
              icon="👨‍🎓"
              gradient="bg-gradient-to-br from-primary-50 to-primary-100"
              trend={{ label: 'Active', up: true }}
            />
            <KpiCard
              label="Total Faculty"
              value={stats?.total_faculty ?? 0}
              sub="Teaching staff"
              icon="👩‍🏫"
              gradient="bg-gradient-to-br from-secondary-50 to-secondary-100"
              trend={{ label: 'Active', up: true }}
            />
            <KpiCard
              label="Present Today"
              value={stats?.today_attendance ?? 0}
              sub="Scans logged today"
              icon="✅"
              gradient="bg-gradient-to-br from-emerald-50 to-teal-50"
              trend={{ label: `${stats?.today_scans ?? 0} scans`, up: (stats?.today_attendance ?? 0) > 0 }}
            />
            <KpiCard
              label="Attendance Rate"
              value={`${pct}%`}
              sub={pct >= 75 ? 'Good standing' : pct >= 50 ? 'Needs attention' : 'Critical — review'}
              icon={pct >= 75 ? '📈' : pct >= 50 ? '📊' : '⚠️'}
              gradient={
                pct >= 75 ? 'bg-gradient-to-br from-emerald-50 to-green-50' :
                pct >= 50 ? 'bg-gradient-to-br from-amber-50 to-yellow-50' :
                'bg-gradient-to-br from-red-50 to-rose-50'
              }
              trend={pct >= 75
                ? { label: 'On target', up: true }
                : { label: 'Below avg', up: false }
              }
            />
          </>
        )}
      </div>

      {/* ── Chart + Section Table ────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">

        {/* Session Chart — 2/5 width on xl */}
        <div className="xl:col-span-2 bg-white/70 backdrop-blur-xl rounded-2xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.02)] p-6 flex flex-col gap-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-sm font-extrabold text-neutral-800 font-heading">{LABELS.sessionScanBreakdown}</h3>
              <p className="text-[11px] text-neutral-400 mt-0.5">{LABELS.scansPerSlot}</p>
            </div>
            <span className="text-[10px] font-bold text-primary-600 bg-primary-50 border border-primary-100 px-2.5 py-1 rounded-full">
              {formatDate(date)}
            </span>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 text-[10px] font-bold">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-primary-600 inline-block" /> {LABELS.fnSessions}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-secondary-600 inline-block" /> {LABELS.anSessions}
            </span>
          </div>

          <div className="flex-1 min-h-[220px]">
            {loading ? (
              <div className="h-56 bg-neutral-50 rounded-2xl animate-pulse" />
            ) : (
              stats && <SessionBarChart bySession={stats.by_session} />
            )}
          </div>

          {/* Quick session totals — dot-notation access avoids prototype-pollution lint */}
          {!loading && stats && (() => {
            const by = stats.by_session
            const fnRows = [
              { key: 'FN1', val: by.FN1 ?? 0 },
              { key: 'FN2', val: by.FN2 ?? 0 },
              { key: 'FN3', val: by.FN3 ?? 0 },
            ]
            const anRows = [
              { key: 'AN1', val: by.AN1 ?? 0 },
              { key: 'AN2', val: by.AN2 ?? 0 },
              { key: 'AN3', val: by.AN3 ?? 0 },
            ]
            return (
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-neutral-100">
                {fnRows.map(({ key, val }) => (
                  <div key={key} className="flex items-center justify-between text-[10px] font-bold text-neutral-500">
                    <span>{key}</span>
                    <span className="text-primary-600">{val}</span>
                  </div>
                ))}
                {anRows.map(({ key, val }) => (
                  <div key={key} className="flex items-center justify-between text-[10px] font-bold text-neutral-500">
                    <span>{key}</span>
                    <span className="text-secondary-600">{val}</span>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>

        {/* Section Summary Table — 3/5 width on xl */}
        <div className="xl:col-span-3 bg-white/70 backdrop-blur-xl rounded-2xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.02)] p-6 flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-sm font-extrabold text-neutral-800 font-heading">{LABELS.sectionWiseAttendance}</h3>
              <p className="text-[11px] text-neutral-400 mt-0.5">{LABELS.classroomBreakdown}</p>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select
                value={dept}
                onChange={(e) => setDept(e.target.value)}
                className="flex-1 sm:w-48 border border-neutral-200 rounded-xl px-3 py-2 text-xs bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 font-semibold text-neutral-700"
              >
                <option value="">{LABELS.allDepartments}</option>
                {depts.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>

          <SectionSummaryTable rows={summary} loading={loading} date={date} />
        </div>
      </div>

      {/* ── Quick Actions ────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-widest">{LABELS.quickManagementActions}</h3>
          <span className="text-[10px] text-neutral-400 font-medium">{LABELS.jumpToSection}</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {QUICK_ACTIONS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="group relative bg-white/70 backdrop-blur-xl rounded-2xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.02)] p-5 flex flex-col gap-3 overflow-hidden hover:border-primary-200 hover:-translate-y-1 hover:shadow-[0_12px_40px_rgba(37,99,235,0.1)] transition-all duration-300"
            >
              {/* Gradient sweep on hover */}
              <div className={`absolute inset-0 opacity-0 group-hover:opacity-5 transition-opacity duration-500 bg-gradient-to-br ${item.gradient} pointer-events-none`} />

              <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl text-white bg-gradient-to-br ${item.gradient} shadow-lg ${item.shadow} group-hover:scale-110 transition-transform duration-300 relative z-10`}>
                {item.icon}
              </div>
              <div className="relative z-10">
                <p className="text-sm font-extrabold text-neutral-800 font-heading group-hover:text-primary-600 transition-colors">{item.label}</p>
                <p className="text-[10px] text-neutral-400 font-medium mt-0.5 leading-relaxed">{item.desc}</p>
              </div>
              <div className="relative z-10 mt-auto flex items-center gap-1 text-[10px] font-bold text-neutral-400 group-hover:text-primary-500 transition-colors">
                {LABELS.open} <span className="group-hover:translate-x-0.5 transition-transform">&#8594;</span>
              </div>
            </a>
          ))}
        </div>
      </div>

      <AboutApp />
    </div>
  )
}
