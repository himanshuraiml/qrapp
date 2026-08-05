'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { todayIST, formatDate } from '@/lib/utils'
import SectionSummaryTable from '@/components/admin/SectionSummaryTable'
import SessionBarChart from '@/components/admin/SessionBarChart'
import type { DashboardStats, SectionSummary, BatchSummary } from '@/types'
import AboutApp from '@/components/AboutApp'
import { exportBatchSummaryToExcel, exportBatchSummaryToPDF } from '@/lib/export'

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
      <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 ${gradient} pointer-events-none`} />

      <div className="flex items-start justify-between relative z-10">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl shadow-sm ${gradient} opacity-90`}>
          {icon}
        </div>
        {trend && (
          <span className={`text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 ${trend.up !== false
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
  adminControlPanel: 'Placement Training Module',
  srmistTrichy: 'SRMIST Tiruchirappalli Campus',
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

export default function TrainingDashboard() {
  const { loading: authLoading } = useAuth()
  const supabase = createClient()

  const [date, setDate] = useState(todayIST())
  const [dept, setDept] = useState('')
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [summary, setSummary] = useState<SectionSummary[]>([])
  const [batches, setBatches] = useState<BatchSummary[]>([])
  const [depts, setDepts] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [batchView, setBatchView] = useState<'grid' | 'table'>('grid')

  async function handleExportExcel() {
    setExporting(true)
    try {
      await exportBatchSummaryToExcel(batches, date)
    } catch (e) {
      console.error(e)
    } finally {
      setExporting(false)
    }
  }

  async function handleExportPDF() {
    setExporting(true)
    try {
      await exportBatchSummaryToPDF(batches, date)
    } catch (e) {
      console.error(e)
    } finally {
      setExporting(false)
    }
  }

  useEffect(() => {
    if (authLoading) return
    async function loadDepts() {
      const { data, error } = await supabase.rpc('get_distinct_filters')
      if (!error && data && data.departments) {
        setDepts(data.departments)
      }
    }
    loadDepts()
  }, [supabase, authLoading])

  useEffect(() => {
    if (authLoading) return

    const cacheKey = `dashboard_stats_${date}_${dept}`

    async function load(silent = false) {
      if (!silent) setLoading(true)
      try {
        const [
          { data: statsData },
          { data: sumData },
          { data: batchData }
        ] = await Promise.all([
          supabase.rpc('get_dashboard_stats', { p_date: date }),
          supabase.rpc('get_section_summary', {
            p_date: date,
            p_department: dept || null,
          }),
          supabase.rpc('get_batch_summary_range', {
            p_date_from: date,
            p_date_to: date,
          })
        ])

        if (statsData) setStats(statsData)
        if (sumData) setSummary(sumData ?? [])

        let calculatedBatches: BatchSummary[] = []
        if (batchData) {
          calculatedBatches = batchData.map((b: any) => ({
            batch: b.batch,
            total_students: Number(b.total_students || 0),
            present_count: Number(b.present_count || 0),
            attendance_pct: Number(b.attendance_pct || 0),
            fn1_count: Number(b.fn1_count || 0),
            fn2_count: Number(b.fn2_count || 0),
            an1_count: Number(b.an1_count || 0),
            an2_count: Number(b.an2_count || 0),
          }))
        }
        setBatches(calculatedBatches)

        if (statsData) {
          sessionStorage.setItem(cacheKey, JSON.stringify({ stats: statsData, summary: sumData, batches: calculatedBatches }))
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    const cached = sessionStorage.getItem(cacheKey)
    if (cached) {
      try {
        const { stats: cachedStats, summary: cachedSummary, batches: cachedBatches } = JSON.parse(cached)
        setStats(cachedStats)
        setSummary(cachedSummary ?? [])
        setBatches(cachedBatches ?? [])
        setLoading(false)
      } catch (e) { }
    }

    load(!!cached)
  }, [date, dept, authLoading, supabase])

  const pct = stats?.attendance_pct ?? 0
  const pctColor = pct >= 75 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-500' : 'text-red-500'
  const pctBar = pct >= 75 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'

  return (
    <div className="relative space-y-8 animate-fade-in pb-14">
      <div className="absolute inset-0 z-[-1] pointer-events-none opacity-45 overflow-hidden">
        <div className="absolute top-[-10%] left-[-15%] w-[45vw] h-[45vw] rounded-full bg-brand-500/10 blur-[130px] mix-blend-multiply animate-pulse" style={{ animationDuration: '10s' }}></div>
        <div className="absolute bottom-[-10%] right-[-15%] w-[45vw] h-[45vw] rounded-full bg-indigo-500/10 blur-[130px] mix-blend-multiply animate-pulse" style={{ animationDuration: '12s' }}></div>
      </div>

      {/* ── Hero Header ─────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-neutral-900 via-neutral-800 to-secondary-950 border border-white/10 shadow-2xl p-6 sm:p-8">
        <div className="absolute -top-24 -right-24 w-80 h-80 bg-primary-500/10 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-72 h-72 bg-secondary-500/10 rounded-full blur-[80px] pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-32 bg-tertiary-500/5 rounded-full blur-[60px] pointer-events-none" />

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
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
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 items-start">

        <div className="xl:col-span-2 flex flex-col gap-6">
          <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.02)] p-6 flex flex-col gap-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-neutral-800 font-heading">{LABELS.sessionScanBreakdown}</h3>
                <p className="text-[11px] text-neutral-400 mt-0.5">{LABELS.scansPerSlot}</p>
              </div>
              <span className="text-[10px] font-bold text-primary-600 bg-primary-50 border border-primary-100 px-2.5 py-1 rounded-full">
                {formatDate(date)}
              </span>
            </div>

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

            {!loading && stats && (() => {
              const by = stats.by_session
              const fnRows = [
                { key: 'FN1', val: by.FN1 ?? 0 },
                { key: 'FN2', val: by.FN2 ?? 0 },
              ]
              const anRows = [
                { key: 'AN1', val: by.AN1 ?? 0 },
                { key: 'AN2', val: by.AN2 ?? 0 },
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

          <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.02)] p-6 flex flex-col gap-4">
            <div>
              <h3 className="text-sm font-extrabold text-neutral-800 font-heading">{LABELS.quickManagementActions}</h3>
              <p className="text-[11px] text-neutral-400 mt-0.5">{LABELS.jumpToSection}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {QUICK_ACTIONS.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="group relative bg-white/70 backdrop-blur-xl rounded-2xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.02)] p-4 flex flex-col gap-3 overflow-hidden hover:border-primary-200 hover:-translate-y-1 hover:shadow-[0_12px_40px_rgba(37,99,235,0.1)] transition-all duration-300"
                >
                  <div className={`absolute inset-0 opacity-0 group-hover:opacity-5 transition-opacity duration-500 bg-gradient-to-br ${item.gradient} pointer-events-none`} />

                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg text-white bg-gradient-to-br ${item.gradient} shadow-lg ${item.shadow} group-hover:scale-110 transition-transform duration-300 relative z-10`}>
                    {item.icon}
                  </div>
                  <div className="relative z-10">
                    <p className="text-xs font-extrabold text-neutral-800 font-heading group-hover:text-primary-600 transition-colors">{item.label}</p>
                    <p className="text-[9px] text-neutral-400 font-medium mt-0.5 leading-relaxed">{item.desc}</p>
                  </div>
                  <div className="relative z-10 mt-auto flex items-center gap-1 text-[9px] font-bold text-neutral-400 group-hover:text-primary-500 transition-colors">
                    {LABELS.open} <span className="group-hover:translate-x-0.5 transition-transform">&#8594;</span>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </div>

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

      {/* ── Batch-wise Attendance ────────────────────────────────── */}
      <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.02)] p-6 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h3 className="text-sm font-extrabold text-neutral-800 font-heading">Batch-wise Attendance</h3>
            <p className="text-[11px] text-neutral-400 mt-0.5">Students present today per training batch on a session basis</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex bg-neutral-100/80 p-0.5 rounded-xl border border-neutral-200/50">
              <button
                onClick={() => setBatchView('table')}
                className={`px-3 py-1 rounded-lg text-[10px] font-extrabold transition-all duration-200 ${batchView === 'table'
                    ? 'bg-white text-primary-600 shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-800'
                  }`}
              >
                Line Table
              </button>
              <button
                onClick={() => setBatchView('grid')}
                className={`px-3 py-1 rounded-lg text-[10px] font-extrabold transition-all duration-200 ${batchView === 'grid'
                    ? 'bg-white text-primary-600 shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-800'
                  }`}
              >
                Card Grid
              </button>
            </div>

            <button
              onClick={handleExportExcel}
              disabled={exporting || batches.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 shadow-sm transition-all active:scale-95 disabled:opacity-50"
            >
              <span>📊</span> Excel
            </button>
            <button
              onClick={handleExportPDF}
              disabled={exporting || batches.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold text-white bg-gradient-to-r from-primary-600 to-secondary-600 hover:from-primary-500 hover:to-secondary-500 shadow-sm transition-all active:scale-95 disabled:opacity-50"
            >
              <span>📄</span> PDF
            </button>
            <span className="text-[10px] font-bold text-primary-600 bg-primary-50 border border-primary-100 px-2.5 py-1.5 rounded-full">
              {formatDate(date)}
            </span>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-24 bg-neutral-50 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : batches.length === 0 ? (
          <p className="text-xs text-neutral-400 font-medium py-6 text-center">No batch data available.</p>
        ) : batchView === 'table' ? (
          <div className="overflow-x-auto rounded-2xl border border-neutral-100 bg-white/60 backdrop-blur-md">
            <table className="w-full text-xs min-w-[500px]">
              <thead>
                <tr className="text-left border-b border-neutral-100 bg-neutral-50/50">
                  <th className="px-5 py-4 font-extrabold text-neutral-500 uppercase tracking-widest">Training Batch</th>
                  <th className="px-4 py-4 font-extrabold text-primary-600 text-center uppercase tracking-widest">FN1</th>
                  <th className="px-4 py-4 font-extrabold text-primary-600 text-center uppercase tracking-widest">FN2</th>
                  <th className="px-4 py-4 font-extrabold text-secondary-600 text-center uppercase tracking-widest">AN1</th>
                  <th className="px-4 py-4 font-extrabold text-secondary-600 text-center uppercase tracking-widest">AN2</th>
                  <th className="px-5 py-4 font-extrabold text-neutral-500 text-center uppercase tracking-widest">Total Students</th>
                  <th className="px-5 py-4 font-extrabold text-neutral-500 text-center uppercase tracking-widest">Present Today</th>
                  <th className="px-5 py-4 font-extrabold text-neutral-500 text-center uppercase tracking-widest">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {batches.map((b) => {
                  const p = b.attendance_pct ?? 0
                  return (
                    <tr key={b.batch} className="hover:bg-neutral-50/50 transition-colors duration-200">
                      <td className="px-5 py-4">
                        <span className="px-3 py-1 rounded-xl bg-neutral-900 text-white text-[11px] font-extrabold uppercase">
                          Batch {b.batch}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center font-bold text-primary-600">{b.fn1_count || 0}</td>
                      <td className="px-4 py-4 text-center font-bold text-primary-600">{b.fn2_count || 0}</td>
                      <td className="px-4 py-4 text-center font-bold text-secondary-600">{b.an1_count || 0}</td>
                      <td className="px-4 py-4 text-center font-bold text-secondary-600">{b.an2_count || 0}</td>
                      <td className="px-5 py-4 text-center font-bold text-neutral-600">{b.total_students}</td>
                      <td className="px-5 py-4 text-center font-bold text-neutral-800">{b.present_count}</td>
                      <td className="px-5 py-4 text-center">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold border ${p >= 75
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : p >= 50
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-red-50 text-red-600 border-red-200'
                          }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${p >= 75 ? 'bg-emerald-500' : p >= 50 ? 'bg-amber-500' : 'bg-red-500'
                            }`} />
                          {p}%
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {batches.map((b) => {
              const p = b.attendance_pct ?? 0
              const tone = p >= 75
                ? { text: 'text-emerald-600', bar: 'bg-emerald-500', ring: 'border-emerald-100' }
                : p >= 50
                  ? { text: 'text-amber-500', bar: 'bg-amber-500', ring: 'border-amber-100' }
                  : { text: 'text-red-500', bar: 'bg-red-500', ring: 'border-red-100' }
              return (
                <div key={b.batch} className={`rounded-2xl border ${tone.ring} bg-white p-3 flex flex-col gap-2.5 shadow-sm`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Batch</span>
                    <span className="w-6 h-6 rounded-lg bg-neutral-900 text-white text-xs font-extrabold flex items-center justify-center">{b.batch}</span>
                  </div>
                  <div>
                    <p className="text-2xl font-extrabold text-neutral-800 tracking-tight font-heading leading-none">
                      {b.present_count}
                      <span className="text-sm font-bold text-neutral-400">/{b.total_students}</span>
                    </p>
                    <p className={`text-[11px] font-bold mt-1 ${tone.text}`}>{p}% present</p>
                  </div>
                  <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${Math.min(p, 100)}%` }} />
                  </div>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 pt-2.5 border-t border-neutral-100/70 text-[9px] font-bold text-neutral-400">
                    <div className="flex justify-between"><span>FN1:</span><span className="text-primary-600 ml-0.5 font-extrabold">{b.fn1_count || 0}</span></div>
                    <div className="flex justify-between"><span>FN2:</span><span className="text-primary-600 ml-0.5 font-extrabold">{b.fn2_count || 0}</span></div>
                    <div className="flex justify-between"><span>AN1:</span><span className="text-secondary-600 ml-0.5 font-extrabold">{b.an1_count || 0}</span></div>
                    <div className="flex justify-between"><span>AN2:</span><span className="text-secondary-600 ml-0.5 font-extrabold">{b.an2_count || 0}</span></div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <AboutApp />
    </div>
  )
}
