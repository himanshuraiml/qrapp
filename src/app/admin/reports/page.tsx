'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { todayIST, formatDate, formatTime, sessionColor, SESSIONS, cn } from '@/lib/utils'
import {
  exportAttendanceToExcel,
  exportAttendanceToPDF,
  exportSectionSummaryToExcel,
  exportSectionSummaryToPDF,
  exportBatchSummaryToExcel,
  exportBatchSummaryToPDF,
  exportUnifiedRosterToExcel,
  exportUnifiedRosterToPDF,
} from '@/lib/export'
import SectionSummaryTable from '@/components/admin/SectionSummaryTable'
import type { AttendanceRecord, SectionSummary, ReportFilters, BatchSummary, UnifiedRosterRecord, ModuleType } from '@/types'
import { useModule } from '@/context/ModuleContext'
import ModuleGuard from '@/components/shell/ModuleGuard'
import CdcReportView from '@/components/admin/reports/CdcReportView'
import PlacementDrivesReportView from '@/components/admin/reports/PlacementDrivesReportView'

type Tab = 'summary' | 'records' | 'roster'

export default function ReportsPage() {
  const { activeModule, availableModules, setActiveModule, featureFlags } = useModule()
  const supabase = createClient()
  const [tab, setTab] = useState<Tab>('summary')
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [summary, setSummary] = useState<SectionSummary[]>([])
  const [batchSummary, setBatchSummary] = useState<BatchSummary[]>([])
  const [rosterRecords, setRosterRecords] = useState<UnifiedRosterRecord[]>([])
  
  // New filters/view controls
  const [summaryView, setSummaryView] = useState<'section' | 'batch'>('section')
  const [rosterView, setRosterView] = useState<'section' | 'batch'>('section')
  const [attendanceFilter, setAttendanceFilter] = useState<'all' | 'defaulter' | 'critical' | 'good'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState<'student_id' | 'name' | 'range_pct' | 'overall_pct'>('student_id')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  const [depts, setDepts] = useState<string[]>([])
  const [sections, setSections] = useState<string[]>([])
  const [batchesList, setBatchesList] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const limit = 50

  const today = todayIST()
  const [filters, setFilters] = useState<ReportFilters>({
    dateFrom: today,
    dateTo: today,
    department: '',
    section: '',
    year: '',
    session: '',
    batch: '',
  })

  function setFilter(key: keyof ReportFilters, value: string) {
    setFilters((f) => ({ ...f, [key]: value }))
    setPage(1)
  }

  useEffect(() => {
    async function loadDeptsAndSections() {
      // Run the two independent option fetches in parallel rather than back-to-back.
      const [
        { data, error },
        { data: profilesData, error: profilesErr },
      ] = await Promise.all([
        supabase.rpc('get_distinct_filters'),
        supabase
          .from('profiles')
          .select('batch')
          .eq('role', 'Student')
          .not('batch', 'is', null)
          .neq('batch', ''),
      ])

      if (!error && data) {
        setDepts(data.departments ?? [])
        setSections(data.sections ?? [])
      }

      if (!profilesErr && profilesData) {
        const uniqueBatches = Array.from(new Set(profilesData.map((p: any) => p.batch))).filter(Boolean).sort() as string[]
        setBatchesList(uniqueBatches)
      }
    }
    loadDeptsAndSections()
  }, [supabase])

  async function loadData(silent = false, fetchAll = false) {
    if (!silent && !fetchAll) setLoading(true)

    try {
      if (tab === 'records') {
        const rpcParams = {
          p_date_from: filters.dateFrom || null,
          p_date_to: filters.dateTo || null,
          p_department: filters.department || null,
          p_section: filters.section || null,
          p_year: filters.year ? parseInt(filters.year) : null,
          p_session: filters.session || null,
          p_batch: filters.batch || null,
        }

        if (fetchAll) {
          let allRecords: any[] = []
          let fromIndex = 0
          const chunkSize = 1000
          while (true) {
            const { data, error } = await supabase
              .rpc('get_attendance_report', rpcParams)
              .range(fromIndex, fromIndex + chunkSize - 1)
            if (error || !data || data.length === 0) break
            allRecords.push(...data)
            if (data.length < chunkSize) break
            fromIndex += chunkSize
          }
          return allRecords
        } else {
          const fromIndex = (page - 1) * limit
          const toIndex = fromIndex + limit - 1
          const { data, error, count } = await supabase
            .rpc('get_attendance_report', rpcParams, { count: 'exact' })
            .range(fromIndex, toIndex)

          if (!error && data) {
            setRecords(data)
            setTotalCount(count ?? 0)
            const cacheKey = `report_${tab}_${page}_${JSON.stringify(filters)}`
            sessionStorage.setItem(cacheKey, JSON.stringify({ data, count }))
          }
        }

      } else if (tab === 'summary') {
        if (summaryView === 'section') {
          const { data, count } = await supabase
            .rpc('get_section_summary', {
              p_date: filters.dateFrom,
              p_department: filters.department || null,
            }, { count: 'exact' })
          const res = data ?? []
          setSummary(res)
          setTotalCount(count ?? res.length)
          if (res.length) {
            const cacheKey = `report_${tab}_section_${JSON.stringify(filters)}`
            sessionStorage.setItem(cacheKey, JSON.stringify({ data: res, count: count ?? res.length }))
          }
          return res
        } else {
          const { data: batchData, error } = await supabase.rpc('get_batch_summary_range', {
            p_date_from: filters.dateFrom,
            p_date_to: filters.dateTo
          })

          if (error || !batchData) {
            setBatchSummary([])
            setTotalCount(0)
            return []
          }

          const rows: BatchSummary[] = batchData.map((b: any) => ({
            batch: b.batch,
            total_students: Number(b.total_students || 0),
            present_count: Number(b.present_count || 0),
            attendance_pct: Number(b.attendance_pct || 0),
            fn1_count: Number(b.fn1_count || 0),
            fn2_count: Number(b.fn2_count || 0),
            an1_count: Number(b.an1_count || 0),
            an2_count: Number(b.an2_count || 0),
          }))

          setBatchSummary(rows)
          setTotalCount(rows.length)
          if (rows.length) {
            const cacheKey = `report_${tab}_batch_${JSON.stringify(filters)}`
            sessionStorage.setItem(cacheKey, JSON.stringify({ data: rows, count: rows.length }))
          }
          return rows
        }

      } else if (tab === 'roster') {
        const queryParams = new URLSearchParams({
          page: String(fetchAll ? 1 : page),
          limit: String(fetchAll ? -1 : limit),
          search: searchQuery,
          dateFrom: filters.dateFrom || '',
          dateTo: filters.dateTo || '',
          department: filters.department || '',
          year: filters.year || '',
          section: rosterView === 'section' ? (filters.section || '') : '',
          batch: rosterView === 'batch' ? (filters.batch || '') : '',
          attendanceFilter: attendanceFilter,
          all: fetchAll ? 'true' : 'false'
        })
        const res = await fetch(`/api/admin/reports/roster?${queryParams.toString()}`)
        const json = await res.json()
        if (json.success && json.data) {
          if (fetchAll) {
            return json.data
          } else {
            setRosterRecords(json.data)
            setTotalCount(json.count ?? 0)
            const cacheKey = `report_${tab}_${rosterView}_${page}_${searchQuery}_${attendanceFilter}_${JSON.stringify(filters)}`
            sessionStorage.setItem(cacheKey, JSON.stringify({ data: json.data, count: json.count }))
          }
        }
      }

    } catch (err) {
      console.error('Failed to generate report:', err)
    } finally {
      setLoading(false)
    }
  }

  // Load report data automatically whenever the tab, page, or any filter changes
  useEffect(() => {
    const cacheKey = tab === 'summary'
      ? `report_${tab}_${summaryView}_${JSON.stringify(filters)}`
      : tab === 'roster'
        ? `report_${tab}_${rosterView}_${page}_${searchQuery}_${attendanceFilter}_${JSON.stringify(filters)}`
        : `report_${tab}_${page}_${JSON.stringify(filters)}`

    // 1. Instant load from cache
    const cached = sessionStorage.getItem(cacheKey)
    if (cached) {
      try {
        const { data, count } = JSON.parse(cached)
        if (tab === 'records') setRecords(data)
        else if (tab === 'summary') {
          if (summaryView === 'section') setSummary(data)
          else setBatchSummary(data)
        }
        else if (tab === 'roster') setRosterRecords(data)
        setTotalCount(count ?? 0)
        setLoading(false)
      } catch (e) { }
    }

    // 2. Silent background refresh
    loadData(!!cached)
  }, [tab, page, summaryView, rosterView, searchQuery, attendanceFilter, filters.dateFrom, filters.dateTo, filters.department, filters.section, filters.year, filters.batch])


  const filterTitle = [
    formatDate(filters.dateFrom),
    filters.dateTo !== filters.dateFrom ? `– ${formatDate(filters.dateTo)}` : '',
    filters.department ? `· ${filters.department}` : '',
    filters.section ? filters.section : '',
    filters.batch ? `· Batch ${filters.batch}` : '',
    filters.session ? `· ${filters.session}` : '',
  ].filter(Boolean).join(' ')

  async function handleExportExcel() {
    setExporting(true)
    try {
      const dateRangeText = filters.dateFrom === filters.dateTo
        ? filters.dateFrom
        : `${filters.dateFrom}_to_${filters.dateTo}`

      if (tab === 'records') {
        const allRecords = await loadData(true, true)
        if (allRecords) {
          await exportAttendanceToExcel(allRecords, filterTitle, `attendance_${filters.dateFrom}`)
        }
      } else if (tab === 'summary') {
        if (summaryView === 'section') {
          await exportSectionSummaryToExcel(summary, filters.dateFrom)
        } else {
          await exportBatchSummaryToExcel(batchSummary, dateRangeText)
        }
      } else if (tab === 'roster') {
        const allRoster = await loadData(true, true)
        if (allRoster) {
          const isSingleDay = filters.dateFrom === filters.dateTo
          await exportUnifiedRosterToExcel(allRoster, dateRangeText, isSingleDay)
        }
      }
    } catch (e) {
      console.error(e)
    } finally {
      setExporting(false)
    }
  }

  async function handleExportPDF() {
    setExporting(true)
    try {
      const dateRangeText = filters.dateFrom === filters.dateTo
        ? filters.dateFrom
        : `${filters.dateFrom}_to_${filters.dateTo}`

      if (tab === 'records') {
        const allRecords = await loadData(true, true)
        if (allRecords) {
          await exportAttendanceToPDF(allRecords, filterTitle, `attendance_${filters.dateFrom}`)
        }
      } else if (tab === 'summary') {
        if (summaryView === 'section') {
          await exportSectionSummaryToPDF(summary, filters.dateFrom)
        } else {
          await exportBatchSummaryToPDF(batchSummary, dateRangeText)
        }
      } else if (tab === 'roster') {
        const allRoster = await loadData(true, true)
        if (allRoster) {
          const isSingleDay = filters.dateFrom === filters.dateTo
          await exportUnifiedRosterToPDF(allRoster, dateRangeText, isSingleDay)
        }
      }
    } catch (e) {
      console.error(e)
    } finally {
      setExporting(false)
    }
  }

  const hasResults =
    (tab === 'records' && records.length > 0) ||
    (tab === 'summary' && (summaryView === 'section' ? summary.length > 0 : batchSummary.length > 0)) ||
    (tab === 'roster' && rosterRecords.length > 0)

  const TAB_META: { id: Tab; label: string }[] = [
    { id: 'summary', label: '📊 Attendance Summary' },
    { id: 'roster', label: '👤 Student Roster & Cumulative' },
    { id: 'records', label: '📑 Attendance Records (Raw)' },
  ]

  const MODULE_TABS: Array<{ id: ModuleType; label: string; icon: string }> = [
    { id: 'training', label: 'Placement Training', icon: '🎯' },
    { id: 'cdc', label: 'CDC Classes', icon: '📚' },
    { id: 'placements', label: 'Placement Drives', icon: '🚀' },
  ]
  const visibleModuleTabs = MODULE_TABS.filter((m) => featureFlags[m.id])

  return (
    <div className="relative space-y-8 animate-fade-in pb-12 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Background Decorative Mesh Gradients */}
      <div className="absolute inset-0 z-[-1] pointer-events-none opacity-45 overflow-hidden">
        <div className="absolute top-[-10%] left-[-15%] w-[45vw] h-[45vw] rounded-full bg-brand-500/10 blur-[130px] mix-blend-multiply animate-pulse" style={{ animationDuration: '10s' }}></div>
        <div className="absolute bottom-[-10%] right-[-15%] w-[45vw] h-[45vw] rounded-full bg-indigo-500/10 blur-[130px] mix-blend-multiply animate-pulse" style={{ animationDuration: '12s' }}></div>
      </div>

      {/* Page Title & Module Switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200/60 pb-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-extrabold text-slate-900 font-heading tracking-tight">
            Attendance Reports
          </h1>
          <p className="text-sm text-slate-500 font-medium">
            Switch modules to view distinct reports for Placement Training, CDC, and Placement Drives.
          </p>
        </div>

        {/* Module Switcher Tabs Bar */}
        {visibleModuleTabs.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-slate-200/70 backdrop-blur-md rounded-2xl border border-slate-200/80 w-fit">
            {visibleModuleTabs.map((m) => {
              const isActive = activeModule === m.id
              return (
                <button
                  key={m.id}
                  onClick={() => setActiveModule(m.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 active:scale-95 cursor-pointer ${
                    isActive
                      ? 'bg-slate-900 text-white shadow-md font-extrabold'
                      : 'text-slate-700 hover:bg-white/80 hover:text-slate-900 font-semibold'
                  }`}
                >
                  <span className="text-sm">{m.icon}</span>
                  <span>{m.label}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Module-Specific Report View */}
      {activeModule === 'cdc' ? (
        <ModuleGuard module="cdc">
          <CdcReportView />
        </ModuleGuard>
      ) : activeModule === 'placements' ? (
        <ModuleGuard module="placements">
          <PlacementDrivesReportView />
        </ModuleGuard>
      ) : (
        <ModuleGuard module="training">
          <div className="space-y-8">
            {/* Page Title Export Buttons for Training */}
            <div className="flex justify-end gap-3 -mt-2">
              <button
                onClick={handleExportPDF}
                disabled={exporting || !hasResults}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white/80 backdrop-blur-md text-brand-600 font-bold text-xs shadow-sm transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                Export PDF
              </button>
              <button
                onClick={handleExportExcel}
                disabled={exporting || !hasResults}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-600 text-white font-bold text-xs shadow-md shadow-brand-500/10 hover:shadow-brand-500/25 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                </svg>
                Export Excel
              </button>
            </div>

            {/* Tab Selection Row */}
            <div className="flex bg-white/70 backdrop-blur-md p-1.5 rounded-2xl gap-1 border border-slate-200/50 w-fit shadow-[0_8px_30px_rgb(0,0,0,0.01)]">
        {TAB_META.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => { setTab(id); setRecords([]); setSummary([]); setBatchSummary([]); setRosterRecords([]); setPage(1); setTotalCount(0) }}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all duration-300 active:scale-95
              ${tab === id
                ? 'bg-white text-brand-600 shadow-md border border-slate-100/80 font-bold'
                : 'text-slate-600 hover:text-slate-900 font-semibold'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Filters Glass Panel */}
      <div className="card bg-white/70 backdrop-blur-xl border border-white/60 shadow-[0_12px_40px_rgba(15,23,42,0.03)] space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-5">
          {/* Group By Toggle (Only for Roster Tab) */}
          {tab === 'roster' && (
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Group By</label>
              <div className="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200/50 w-full h-[38px] items-center">
                <button
                  onClick={() => { setRosterView('section'); setRosterRecords([]) }}
                  className={`flex-1 text-center py-1.5 rounded-lg text-xs font-bold transition-all duration-300 ${
                    rosterView === 'section' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  Section
                </button>
                <button
                  onClick={() => { setRosterView('batch'); setRosterRecords([]) }}
                  className={`flex-1 text-center py-1.5 rounded-lg text-xs font-bold transition-all duration-300 ${
                    rosterView === 'batch' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  Batch
                </button>
              </div>
            </div>
          )}

          {/* Date From */}
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
              From Date
            </label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilter('dateFrom', e.target.value)}
              className="input text-xs font-semibold"
            />
          </div>

          {/* Date To (Hidden only for Section Summary) */}
          {!(tab === 'summary' && summaryView === 'section') && (
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">To Date</label>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => setFilter('dateTo', e.target.value)}
                className="input text-xs font-semibold"
              />
            </div>
          )}

          {/* Department */}
          {!(tab === 'summary' && summaryView === 'batch') && (
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Department</label>
              <select
                value={filters.department}
                onChange={(e) => setFilter('department', e.target.value)}
                className="input text-xs font-bold text-slate-700"
              >
                <option value="">All Departments</option>
                {depts.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          )}

          {/* Year */}
          {tab !== 'summary' && (
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Year</label>
              <select
                value={filters.year}
                onChange={(e) => setFilter('year', e.target.value)}
                className="input text-xs font-bold text-slate-700"
              >
                <option value="">All Years</option>
                {[1, 2, 3, 4].map((y) => <option key={y} value={y}>Year {y}</option>)}
              </select>
            </div>
          )}

          {/* Section */}
          {(tab === 'records' || (tab === 'roster' && rosterView === 'section')) && (
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Section</label>
              <select
                value={filters.section}
                onChange={(e) => setFilter('section', e.target.value)}
                className="input text-xs font-bold text-slate-700"
              >
                <option value="">All Sections</option>
                {sections.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}

          {/* Batch */}
          {(tab === 'records' || (tab === 'roster' && rosterView === 'batch')) && (
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Batch</label>
              <select
                value={filters.batch}
                onChange={(e) => setFilter('batch', e.target.value)}
                className="input text-xs font-bold text-slate-700"
              >
                <option value="">All Batches</option>
                {batchesList.map((b) => <option key={b} value={b}>Batch {b}</option>)}
              </select>
            </div>
          )}

          {/* Session (Only for Raw Records) */}
          {tab === 'records' && (
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Session</label>
              <select
                value={filters.session}
                onChange={(e) => setFilter('session', e.target.value)}
                className="input text-xs font-bold text-slate-700"
              >
                {SESSIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          )}

          {/* Attendance Range Filter (Only for Roster) */}
          {tab === 'roster' && (
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Attendance Range</label>
              <select
                value={attendanceFilter}
                onChange={(e: any) => setAttendanceFilter(e.target.value)}
                className="input text-xs font-bold text-slate-700"
              >
                <option value="all">All Students</option>
                <option value="defaulter">Defaulters (&lt; 75%)</option>
                <option value="critical">Critical (&lt; 50%)</option>
                <option value="good">Good (&gt;= 75%)</option>
              </select>
            </div>
          )}

        </div>

        {/* Search Student (Only for Roster Tab, in its own row) */}
        {tab === 'roster' && (
          <div className="w-full sm:w-1/4">
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Search Student</label>
            <input
              type="text"
              placeholder="Reg No or Name"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1) }}
              className="input text-xs font-semibold"
            />
          </div>
        )}

        {tab === 'roster' && (
          <div className="text-[10px] font-bold text-slate-500 bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5">
            {filters.dateFrom === filters.dateTo
              ? '💡 Single Date View: Displaying daily session split (FN1, FN2, AN1, AN2) and all-time overall attendance statistics.'
              : `💡 Range View: Displaying cumulative sessions present, conducted, and attendance rate from ${filters.dateFrom} to ${filters.dateTo}.`}
          </div>
        )}

        <div className="flex pt-4 border-t border-slate-100">
          <button
            onClick={() => loadData()}
            disabled={loading}
            className="btn-primary inline-flex items-center gap-1.5 text-xs py-2.5 font-bold shadow-md shadow-brand-500/10 active:scale-95"
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                <span>Generating...</span>
              </>
            ) : (
              <span>
                {tab === 'summary' ? '🔄 Refresh Summary' :
                  tab === 'records' ? '🔄 Refresh Records' :
                  '🔄 Refresh Roster'}
              </span>
            )}

          </button>
        </div>
      </div>

      {/* Results panel */}
      {hasResults && (
        <div className="card space-y-6 bg-white/70 backdrop-blur-xl border border-white/60 shadow-[0_12px_40px_rgba(15,23,42,0.03)] p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              {tab === 'summary' ? (
                <h3 className="text-lg font-bold text-slate-800 font-heading">Overview</h3>
              ) : (
                <>
                  <span className="text-xs font-extrabold text-slate-800 font-heading">{filterTitle}</span>
                  <span className="ml-2 text-slate-400 text-xs font-semibold">
                    ({tab === 'records' ? records.length : rosterRecords.length} rows fetched)
                  </span>
                </>
              )}
            </div>

            {/* Sliding Toggle Switch (Only for Summary Tab) */}
            {tab === 'summary' && (
              <div className="flex items-center gap-3 bg-slate-50/80 backdrop-blur-md px-3 py-1 rounded-full border border-slate-200/50 shadow-sm w-fit self-end">
                <span className={cn("text-[10px] font-extrabold uppercase tracking-wider transition-colors duration-200 select-none", summaryView === 'batch' ? 'text-brand-600' : 'text-slate-400')}>By Batch</span>
                <button
                  type="button"
                  onClick={() => {
                    setSummaryView(prev => prev === 'section' ? 'batch' : 'section')
                    setSummary([])
                    setBatchSummary([])
                  }}
                  className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none bg-slate-200"
                >
                  <span
                    className={cn(
                      "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-brand-600 shadow ring-0 transition duration-200 ease-in-out",
                      summaryView === 'section' ? 'translate-x-4' : 'translate-x-0'
                    )}
                  />
                </button>
                <span className={cn("text-[10px] font-extrabold uppercase tracking-wider transition-colors duration-200 select-none", summaryView === 'section' ? 'text-brand-600' : 'text-slate-400')}>By Section</span>
              </div>
            )}
          </div>

          {/* Tabular format for Section Summary */}
          {tab === 'summary' && summaryView === 'section' && (
            <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white/50 animate-fade-in">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left border-b border-slate-100 bg-slate-50/50">
                    <th className="p-4 font-extrabold text-slate-500 uppercase tracking-widest">Department</th>
                    <th className="p-4 font-extrabold text-slate-500 uppercase tracking-widest text-center">Year</th>
                    <th className="p-4 font-extrabold text-slate-500 uppercase tracking-widest text-center">Section</th>
                    <th className="p-4 font-extrabold text-slate-500 uppercase tracking-widest text-center">Students</th>
                    <th className="p-4 font-extrabold text-primary-600 uppercase tracking-widest text-center">FN1</th>
                    <th className="p-4 font-extrabold text-primary-600 uppercase tracking-widest text-center">FN2</th>
                    <th className="p-4 font-extrabold text-secondary-600 uppercase tracking-widest text-center">AN1</th>
                    <th className="p-4 font-extrabold text-secondary-600 uppercase tracking-widest text-center">AN2</th>
                    <th className="p-4 font-extrabold text-slate-500 uppercase tracking-widest text-center">Average</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {summary.map((r, idx) => {
                    const pct = r.attendance_pct ?? 0
                    const badgeStyle = pct >= 90
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : pct < 75
                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                        : 'bg-brand-50 text-brand-700 border-brand-200'
                    return (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-4 font-bold text-slate-800">{r.department}</td>
                        <td className="p-4 text-center font-semibold text-slate-600">Year {r.year}</td>
                        <td className="p-4 text-center font-bold text-slate-700">Sec {r.section}</td>
                        <td className="p-4 text-center font-semibold text-slate-500">{r.total_students}</td>
                        <td className="p-4 text-center font-bold text-primary-600">{r.fn1_count}</td>
                        <td className="p-4 text-center font-bold text-primary-600">{r.fn2_count}</td>
                        <td className="p-4 text-center font-bold text-secondary-600">{r.an1_count}</td>
                        <td className="p-4 text-center font-bold text-secondary-600">{r.an2_count}</td>
                        <td className="p-4 text-center">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${badgeStyle}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${pct >= 90 ? 'bg-emerald-500 animate-pulse' : pct < 75 ? 'bg-rose-500 animate-pulse' : 'bg-brand-500'}`} />
                            {pct}%
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Tabular format for Batch Summary */}
          {tab === 'summary' && summaryView === 'batch' && (
            <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white/50 animate-fade-in">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left border-b border-slate-100 bg-slate-50/50">
                    <th className="p-4 font-extrabold text-slate-500 uppercase tracking-widest">Batch</th>
                    <th className="p-4 font-extrabold text-slate-500 uppercase tracking-widest text-center">Total Students</th>
                    <th className="p-4 font-extrabold text-slate-500 uppercase tracking-widest text-center">Scans Logged</th>
                    <th className="p-4 font-extrabold text-slate-500 uppercase tracking-widest text-center">Average Attendance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {batchSummary.map((b, idx) => {
                    const pct = b.attendance_pct ?? 0
                    const badgeStyle = pct >= 90
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : pct < 75
                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                        : 'bg-brand-50 text-brand-700 border-brand-200'
                    return (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-4 font-bold text-slate-800">Batch {b.batch}</td>
                        <td className="p-4 text-center font-semibold text-slate-600">{b.total_students} students</td>
                        <td className="p-4 text-center font-bold text-slate-700">{b.present_count}</td>
                        <td className="p-4 text-center">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${badgeStyle}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${pct >= 90 ? 'bg-emerald-500 animate-pulse' : pct < 75 ? 'bg-rose-500 animate-pulse' : 'bg-brand-500'}`} />
                            {pct}%
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'records' && (
            <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white/50">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left border-b border-slate-100 bg-slate-50/50">
                    <th className="p-4 font-extrabold text-slate-500 uppercase tracking-widest">Student ID</th>
                    <th className="p-4 font-extrabold text-slate-500 uppercase tracking-widest">Student Name</th>
                    <th className="p-4 font-extrabold text-slate-500 uppercase tracking-widest">Dept</th>
                    <th className="p-4 font-extrabold text-slate-500 uppercase tracking-widest text-center">Yr</th>
                    <th className="p-4 font-extrabold text-slate-500 uppercase tracking-widest text-center">Sec</th>
                    <th className="p-4 font-extrabold text-slate-500 uppercase tracking-widest text-center">Batch</th>
                    <th className="p-4 font-extrabold text-slate-500 uppercase tracking-widest">Session</th>
                    <th className="p-4 font-extrabold text-slate-500 uppercase tracking-widest">Class Date</th>
                    <th className="p-4 font-extrabold text-slate-500 uppercase tracking-widest">Marked Time</th>
                    <th className="p-4 font-extrabold text-slate-500 uppercase tracking-widest">Marked By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {records.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4 font-mono font-bold text-brand-600">{r.student_id}</td>
                      <td className="p-4 font-bold text-slate-800">{r.student_name}</td>
                      <td className="p-4 font-semibold text-slate-500 uppercase">{r.department}</td>
                      <td className="p-4 font-bold text-slate-600 text-center uppercase">{r.year}</td>
                      <td className="p-4 font-bold text-slate-600 text-center uppercase">{r.section}</td>
                      <td className="p-4 font-bold text-slate-600 text-center uppercase">{r.batch || '—'}</td>
                      <td className="p-4">
                        <span className={`badge ${sessionColor(r.session)} text-[10px]`}>{r.session}</span>
                      </td>
                      <td className="p-4 font-semibold text-slate-500">{r.date}</td>
                      <td className="p-4 font-semibold text-slate-400">{formatTime(r.timestamp)}</td>
                      <td className="p-4 font-semibold text-slate-500">{r.marked_by_name || r.marked_by}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Pagination Controls */}
              {totalCount > limit && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-t border-slate-100 bg-slate-50/50">
                  <span className="text-[11px] text-slate-400 font-semibold">
                    Showing <span className="text-slate-700 font-bold">{(page - 1) * limit + 1}</span> to{' '}
                    <span className="text-slate-700 font-bold">{Math.min(page * limit, totalCount)}</span> of{' '}
                    <span className="text-slate-700 font-bold">{totalCount}</span> records
                  </span>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 font-bold text-xs disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95"
                    >
                      ◀ Prev
                    </button>

                    {(() => {
                      const totalPages = Math.ceil(totalCount / limit)
                      const pages = []
                      let startPage = Math.max(1, page - 2)
                      let endPage = Math.min(totalPages, page + 2)
                      if (startPage === 1 && totalPages > 5) endPage = 5
                      if (endPage === totalPages && totalPages > 5) startPage = Math.max(1, totalPages - 4)

                      for (let i = startPage; i <= endPage; i++) {
                        pages.push(
                          <button
                            key={i}
                            onClick={() => setPage(i)}
                            className={`w-8 h-8 rounded-xl text-xs font-bold transition-all active:scale-95 ${page === i
                                ? 'bg-brand-600 text-white shadow-md shadow-brand-500/20'
                                : 'border border-slate-200 bg-white hover:bg-slate-50 text-slate-600'
                              }`}
                          >
                            {i}
                          </button>
                        )
                      }
                      return pages
                    })()}

                    <button
                      onClick={() => setPage(p => Math.min(Math.ceil(totalCount / limit), p + 1))}
                      disabled={page >= Math.ceil(totalCount / limit)}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 font-bold text-xs disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95"
                    >
                      Next ▶
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'roster' && (() => {
            const isSingleDay = filters.dateFrom === filters.dateTo
            
            // Client-side sorting on the loaded records
            const sortedRosterRecords = [...rosterRecords].sort((a, b) => {
              let valA = a[sortField]
              let valB = b[sortField]
              if (valA === undefined) valA = ''
              if (valB === undefined) valB = ''
              if (typeof valA === 'string' && typeof valB === 'string') {
                return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA)
              } else {
                return sortDirection === 'asc' ? (valA as number) - (valB as number) : (valB as number) - (valA as number)
              }
            })

            const renderSortHeader = (field: typeof sortField, label: string) => {
              const isSorted = sortField === field
              return (
                <th 
                  onClick={() => {
                    if (sortField === field) {
                      setSortDirection(d => d === 'asc' ? 'desc' : 'asc')
                    } else {
                      setSortField(field)
                      setSortDirection('asc')
                    }
                  }}
                  className="p-4 font-extrabold text-slate-500 uppercase tracking-widest cursor-pointer hover:bg-slate-100 select-none transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>{label}</span>
                    <span className="text-slate-400">
                      {isSorted ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
                    </span>
                  </div>
                </th>
              )
            }

            const getRowClassName = (r: UnifiedRosterRecord) => {
              const pct = isSingleDay ? r.overall_pct : r.range_pct
              let base = "transition-colors "
              if (pct < 75) {
                base += "bg-red-50/30 hover:bg-red-50/50 text-slate-800"
              } else if (pct >= 90) {
                base += "bg-emerald-50/30 hover:bg-emerald-50/50 text-slate-800"
              } else {
                base += "hover:bg-slate-50/50"
              }
              return base
            }

            return (
              <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white/50">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left border-b border-slate-100 bg-slate-50/50">
                      {renderSortHeader('student_id', 'Student ID')}
                      {renderSortHeader('name', 'Student Name')}
                      <th className="p-4 font-extrabold text-slate-500 uppercase tracking-widest">Dept</th>
                      <th className="p-4 font-extrabold text-slate-500 uppercase tracking-widest text-center">Yr</th>
                      <th className="p-4 font-extrabold text-slate-500 uppercase tracking-widest text-center">Sec</th>
                      <th className="p-4 font-extrabold text-slate-500 uppercase tracking-widest text-center">Batch</th>
                      <th className="p-4 font-extrabold text-slate-500 uppercase tracking-widest text-center">QR Code</th>
                      
                      {isSingleDay ? (
                        <>
                          <th className="px-3 py-4 font-extrabold text-primary-600 text-center uppercase tracking-widest">FN1</th>
                          <th className="px-3 py-4 font-extrabold text-primary-600 text-center uppercase tracking-widest">FN2</th>
                          <th className="px-3 py-4 font-extrabold text-secondary-600 text-center uppercase tracking-widest">AN1</th>
                          <th className="px-3 py-4 font-extrabold text-secondary-600 text-center uppercase tracking-widest">AN2</th>
                          <th className="p-4 font-extrabold text-slate-500 uppercase tracking-widest text-center">Overall Present</th>
                          <th className="p-4 font-extrabold text-slate-500 uppercase tracking-widest text-center">Overall Total</th>
                          {renderSortHeader('overall_pct', 'Overall %')}
                        </>
                      ) : (
                        <>
                          <th className="p-4 font-extrabold text-emerald-600 uppercase tracking-widest text-center">Range Present</th>
                          <th className="p-4 font-extrabold text-slate-500 uppercase tracking-widest text-center">Range Total</th>
                          <th className="p-4 font-extrabold text-red-500 uppercase tracking-widest text-center">Range Absent</th>
                          {renderSortHeader('range_pct', 'Range %')}
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sortedRosterRecords.map((r) => (
                      <tr key={r.student_id} className={getRowClassName(r)}>
                        <td className="p-4 font-mono font-bold text-brand-600">{r.student_id}</td>
                        <td className="p-4 font-bold">{r.name}</td>
                        <td className="p-4 font-semibold text-slate-500 uppercase">{r.department}</td>
                        <td className="p-4 font-bold text-slate-600 text-center">{r.year}</td>
                        <td className="p-4 font-bold text-slate-600 text-center uppercase">{r.section || '—'}</td>
                        <td className="p-4 font-bold text-slate-600 text-center uppercase">{r.batch || '—'}</td>
                        <td className="p-4 text-center">
                          <span className={`badge ${r.qr_blocked ? 'badge-red' : 'badge-green'} text-[10px]`}>
                            {r.qr_blocked ? '🔴 Blocked' : '🟢 Active'}
                          </span>
                        </td>

                        {isSingleDay ? (
                          <>
                            <td className="px-3 py-4 text-center">
                              {r.fn1_present ? (
                                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-extrabold border border-emerald-200/60 shadow-sm">✓</span>
                              ) : (
                                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-rose-50 text-rose-500 text-[10px] font-extrabold border border-rose-200/60 shadow-sm">✗</span>
                              )}
                            </td>
                            <td className="px-3 py-4 text-center">
                              {r.fn2_present ? (
                                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-extrabold border border-emerald-200/60 shadow-sm">✓</span>
                              ) : (
                                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-rose-50 text-rose-500 text-[10px] font-extrabold border border-rose-200/60 shadow-sm">✗</span>
                              )}
                            </td>
                            <td className="px-3 py-4 text-center">
                              {r.an1_present ? (
                                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-extrabold border border-emerald-200/60 shadow-sm">✓</span>
                              ) : (
                                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-rose-50 text-rose-500 text-[10px] font-extrabold border border-rose-200/60 shadow-sm">✗</span>
                              )}
                            </td>
                            <td className="px-3 py-4 text-center">
                              {r.an2_present ? (
                                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-extrabold border border-emerald-200/60 shadow-sm">✓</span>
                              ) : (
                                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-rose-50 text-rose-500 text-[10px] font-extrabold border border-rose-200/60 shadow-sm">✗</span>
                              )}
                            </td>
                            <td className="p-4 font-semibold text-slate-600 text-center">{r.overall_present}</td>
                            <td className="p-4 font-semibold text-slate-600 text-center">{r.overall_conducted}</td>
                            <td className="p-4 text-center font-bold">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] border ${
                                r.overall_pct >= 75 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                r.overall_pct >= 50 ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                'bg-red-50 text-red-700 border-red-200'
                              }`}>
                                {r.overall_pct}%
                              </span>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="p-4 font-semibold text-emerald-600 text-center">{r.range_present}</td>
                            <td className="p-4 font-semibold text-slate-600 text-center">{r.range_conducted}</td>
                            <td className="p-4 font-semibold text-red-500 text-center">{r.range_absent}</td>
                            <td className="p-4 text-center font-bold">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] border ${
                                r.range_pct >= 75 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                r.range_pct >= 50 ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                'bg-red-50 text-red-700 border-red-200'
                              }`}>
                                {r.range_pct}%
                              </span>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Pagination Controls */}
                {totalCount > limit && (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-t border-slate-100 bg-slate-50/50">
                    <span className="text-[11px] text-slate-400 font-semibold">
                      Showing <span className="text-slate-700 font-bold">{(page - 1) * limit + 1}</span> to{' '}
                      <span className="text-slate-700 font-bold">{Math.min(page * limit, totalCount)}</span> of{' '}
                      <span className="text-slate-700 font-bold">{totalCount}</span> student records
                    </span>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 font-bold text-xs disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95"
                      >
                        ◀ Prev
                      </button>

                      {(() => {
                        const totalPages = Math.ceil(totalCount / limit)
                        const pages = []
                        let startPage = Math.max(1, page - 2)
                        let endPage = Math.min(totalPages, page + 2)
                        if (startPage === 1 && totalPages > 5) endPage = 5
                        if (endPage === totalPages && totalPages > 5) startPage = Math.max(1, totalPages - 4)

                        for (let i = startPage; i <= endPage; i++) {
                          pages.push(
                            <button
                              key={i}
                              onClick={() => setPage(i)}
                              className={`w-8 h-8 rounded-xl text-xs font-bold transition-all active:scale-95 ${page === i
                                  ? 'bg-brand-600 text-white shadow-md shadow-brand-500/20'
                                  : 'border border-slate-200 bg-white hover:bg-slate-50 text-slate-600'
                                }`}
                            >
                              {i}
                            </button>
                          )
                        }
                        return pages
                      })()}

                      <button
                        onClick={() => setPage(p => Math.min(Math.ceil(totalCount / limit), p + 1))}
                        disabled={page >= Math.ceil(totalCount / limit)}
                        className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 font-bold text-xs disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95"
                      >
                        Next ▶
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      )}

      {/* Roster empty fallback */}
      {tab === 'roster' && !hasResults && !loading && (
        <div className="card text-center py-12 text-slate-500 font-medium animate-fade-in">
          <p className="text-lg">No roster records found</p>
          <p className="text-xs text-slate-400 mt-1">Try adjusting your filters or search query</p>
        </div>
      )}
          </div>
        </ModuleGuard>
      )}
    </div>
  )
}

