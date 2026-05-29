'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { todayIST, formatDate, formatTime, sessionColor, SESSIONS } from '@/lib/utils'
import {
  exportAttendanceToExcel,
  exportAttendanceToPDF,
  exportSectionSummaryToExcel,
  exportSectionSummaryToPDF,
  exportRosterToExcel,
  exportRosterToPDF,
  exportBatchSummaryToExcel,
  exportBatchSummaryToPDF,
} from '@/lib/export'
import SectionSummaryTable from '@/components/admin/SectionSummaryTable'
import AttendanceRosterTable from '@/components/admin/AttendanceRosterTable'
import type { AttendanceRecord, SectionSummary, ReportFilters, RosterRecord, BatchSummary } from '@/types'

type Tab = 'summary' | 'records' | 'roster' | 'batch'

export default function ReportsPage() {
  const supabase = createClient()
  const [tab, setTab] = useState<Tab>('summary')
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [summary, setSummary] = useState<SectionSummary[]>([])
  const [roster, setRoster] = useState<RosterRecord[]>([])
  const [batchSummary, setBatchSummary] = useState<BatchSummary[]>([])
  const [depts, setDepts] = useState<string[]>([])
  const [sections, setSections] = useState<string[]>([])
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
  })

  function setFilter(key: keyof ReportFilters, value: string) {
    setFilters((f) => ({ ...f, [key]: value }))
    setPage(1)
  }

  useEffect(() => {
    async function loadDeptsAndSections() {
      const { data, error } = await supabase.rpc('get_distinct_filters')
      if (!error && data) {
        setDepts(data.departments ?? [])
        setSections(data.sections ?? [])
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
        const { data, count } = await supabase
          .rpc('get_section_summary', {
            p_date: filters.dateFrom,
            p_department: filters.department || null,
          }, { count: 'exact' })
        const res = data ?? []
        setSummary(res)
        setTotalCount(count ?? res.length)
        const cacheKey = `report_${tab}_${JSON.stringify(filters)}`
        sessionStorage.setItem(cacheKey, JSON.stringify({ data: res, count: count ?? res.length }))

      } else if (tab === 'batch') {
        if (!silent) setLoading(true)
        const { data: activeStudents, error: profileError } = await supabase
          .from('profiles')
          .select('student_id, batch')
          .eq('role', 'Student')
          .eq('status', 'Active')

        if (profileError || !activeStudents) {
          setBatchSummary([])
          setTotalCount(0)
          return
        }

        const studentToBatch = new Map<string, string>()
        const batchTotalStudents = new Map<string, number>()
        activeStudents.forEach(s => {
          if (s.student_id && s.batch) {
            studentToBatch.set(s.student_id, s.batch)
            batchTotalStudents.set(s.batch, (batchTotalStudents.get(s.batch) || 0) + 1)
          }
        })

        const { data: scans, error: scansError } = await supabase
          .from('attendance')
          .select('student_id, date, session')
          .gte('date', filters.dateFrom)
          .lte('date', filters.dateTo)

        if (scansError || !scans) {
          setBatchSummary([])
          setTotalCount(0)
          return
        }

        const uniqueScans = new Set<string>()
        const batchPresentStudentDays = new Map<string, number>()
        const sessionCounts = new Map<string, Record<string, number>>()

        scans.forEach(scan => {
          const batch = studentToBatch.get(scan.student_id)
          if (batch) {
            // Present Set
            const key = `${scan.student_id}:${scan.date}`
            if (!uniqueScans.has(key)) {
              uniqueScans.add(key)
              batchPresentStudentDays.set(batch, (batchPresentStudentDays.get(batch) || 0) + 1)
            }

            // Session counts
            if (!sessionCounts.has(batch)) {
              sessionCounts.set(batch, { FN1: 0, FN2: 0, AN1: 0, AN2: 0 })
            }
            const counts = sessionCounts.get(batch)!
            if (scan.session in counts) {
              counts[scan.session as any]++
            }
          }
        })

        const uniqueDates = new Set<string>()
        scans.forEach(scan => uniqueDates.add(scan.date))
        const numDays = uniqueDates.size || 1

        const rows: BatchSummary[] = []
        Array.from(batchTotalStudents.keys()).sort().forEach(batch => {
          const total = batchTotalStudents.get(batch) || 0
          const presentDays = batchPresentStudentDays.get(batch) || 0
          const avgPresent = parseFloat((presentDays / numDays).toFixed(1))
          const attendancePct = total > 0
            ? parseFloat(((presentDays / (total * numDays)) * 100).toFixed(1))
            : 0
          
          const counts = sessionCounts.get(batch) || { FN1: 0, FN2: 0, AN1: 0, AN2: 0 }

          rows.push({
            batch,
            total_students: total,
            present_count: avgPresent,
            attendance_pct: attendancePct,
            fn1_count: parseFloat((counts.FN1 / numDays).toFixed(1)),
            fn2_count: parseFloat((counts.FN2 / numDays).toFixed(1)),
            an1_count: parseFloat((counts.AN1 / numDays).toFixed(1)),
            an2_count: parseFloat((counts.AN2 / numDays).toFixed(1)),
          })
        })

        setBatchSummary(rows)
        setTotalCount(rows.length)
        const cacheKey = `report_${tab}_${JSON.stringify(filters)}`
        sessionStorage.setItem(cacheKey, JSON.stringify({ data: rows, count: rows.length }))
        return rows

      } else {
        const rpcParams = {
          p_date: filters.dateFrom,
          p_session: filters.session || null,
          p_department: filters.department || null,
          p_section: filters.section || null,
        }
        
        if (fetchAll) {
          let allRoster: any[] = []
          let fromIndex = 0
          const chunkSize = 1000
          while (true) {
            const { data, error } = await supabase
              .rpc('get_attendance_roster', rpcParams)
              .range(fromIndex, fromIndex + chunkSize - 1)
            if (error || !data || data.length === 0) break
            allRoster.push(...data)
            if (data.length < chunkSize) break
            fromIndex += chunkSize
          }
          return allRoster
        } else {
          const fromIndex = (page - 1) * limit
          const toIndex = fromIndex + limit - 1
          const { data, error, count } = await supabase
            .rpc('get_attendance_roster', rpcParams, { count: 'exact' })
            .range(fromIndex, toIndex)
          
          if (!error && data) {
            setRoster(data)
            setTotalCount(count ?? 0)
            const cacheKey = `report_${tab}_${page}_${JSON.stringify(filters)}`
            sessionStorage.setItem(cacheKey, JSON.stringify({ data, count }))
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
    const cacheKey = tab === 'summary' || tab === 'batch'
      ? `report_${tab}_${JSON.stringify(filters)}`
      : `report_${tab}_${page}_${JSON.stringify(filters)}`
    
    // 1. Instant load from cache
    const cached = sessionStorage.getItem(cacheKey)
    if (cached) {
      try {
        const { data, count } = JSON.parse(cached)
        if (tab === 'records') setRecords(data)
        else if (tab === 'summary') setSummary(data)
        else if (tab === 'batch') setBatchSummary(data)
        else setRoster(data)
        setTotalCount(count ?? 0)
        setLoading(false)
      } catch (e) {}
    }
    
    // 2. Silent background refresh
    loadData(!!cached)
  }, [tab, page, filters.dateFrom, filters.dateTo, filters.department, filters.section, filters.year, filters.session])

  const filterTitle = [
    formatDate(filters.dateFrom),
    filters.dateTo !== filters.dateFrom ? `– ${formatDate(filters.dateTo)}` : '',
    filters.department ? `· ${filters.department}` : '',
    filters.section ? filters.section : '',
    filters.session ? `· ${filters.session}` : '',
  ].filter(Boolean).join(' ')

  async function handleExportExcel() {
    setExporting(true)
    try {
      if (tab === 'records') {
        const allRecords = await loadData(true, true)
        if (allRecords) {
          await exportAttendanceToExcel(allRecords, filterTitle, `attendance_${filters.dateFrom}`)
        }
      } else if (tab === 'summary') {
        await exportSectionSummaryToExcel(summary, filters.dateFrom)
      } else if (tab === 'roster') {
        const allRoster = await loadData(true, true)
        if (allRoster) {
          await exportRosterToExcel(allRoster, filters.dateFrom, filters.session || 'All Sessions')
        }
      } else if (tab === 'batch') {
        const dateRangeText = filters.dateFrom === filters.dateTo
          ? filters.dateFrom
          : `${filters.dateFrom}_to_${filters.dateTo}`
        await exportBatchSummaryToExcel(batchSummary, dateRangeText)
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
      if (tab === 'records') {
        const allRecords = await loadData(true, true)
        if (allRecords) {
          await exportAttendanceToPDF(allRecords, filterTitle, `attendance_${filters.dateFrom}`)
        }
      } else if (tab === 'summary') {
        await exportSectionSummaryToPDF(summary, filters.dateFrom)
      } else if (tab === 'roster') {
        const allRoster = await loadData(true, true)
        if (allRoster) {
          await exportRosterToPDF(allRoster, filters.dateFrom, filters.session || 'All Sessions')
        }
      } else if (tab === 'batch') {
        const dateRangeText = filters.dateFrom === filters.dateTo
          ? filters.dateFrom
          : `${filters.dateFrom} to ${filters.dateTo}`
        await exportBatchSummaryToPDF(batchSummary, dateRangeText)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setExporting(false)
    }
  }

  const hasResults =
    (tab === 'records' && records.length > 0) ||
    (tab === 'summary' && summary.length > 0) ||
    (tab === 'roster' && roster.length > 0) ||
    (tab === 'batch' && batchSummary.length > 0)

  const TAB_META: { id: Tab; label: string }[] = [
    { id: 'summary', label: 'Section Summary' },
    { id: 'records', label: 'Attendance Records' },
    { id: 'roster', label: '🗂 Roster (Present/Absent Split)' },
    { id: 'batch', label: '📊 Batch Summary' },
  ]

  return (
    <div className="space-y-8 animate-fade-in pb-12 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Page Title & Navigation Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-600 text-xs font-bold uppercase tracking-wider">
            <span>📄</span> SRMIST Tiruchirappalli Campus
          </div>
          <h1 className="text-3xl font-extrabold text-slate-800 font-heading">Attendance Reports</h1>
          <p className="text-xs text-slate-400 font-medium">Generate records summaries, check split rosters, or export files</p>
        </div>

        {/* Tab Selection Row */}
        <div className="flex bg-slate-100 p-1 rounded-2xl gap-1 border border-slate-200/50 w-fit">
          {TAB_META.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => { setTab(id); setRecords([]); setSummary([]); setRoster([]); setBatchSummary([]); setPage(1); setTotalCount(0) }}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all duration-300
                ${tab === id
                  ? 'bg-white text-brand-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Filters Glass Panel */}
      <div className="card space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-5">
          {/* Date From */}
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
              {tab === 'roster' ? 'Class Date' : 'From Date'}
            </label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilter('dateFrom', e.target.value)}
              className="input text-xs font-semibold"
            />
          </div>

          {/* Date To — hidden for roster */}
          {tab !== 'roster' && (
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
          {tab !== 'batch' && (
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

          {/* Section */}
          {tab !== 'batch' && (
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

          {/* Year — hidden for roster and batch */}
          {tab !== 'roster' && tab !== 'batch' && (
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

          {/* Session */}
          {tab !== 'batch' && (
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                Session{tab === 'roster' && <span className="text-red-500 ml-0.5">*</span>}
              </label>
              <select
                value={filters.session}
                onChange={(e) => setFilter('session', e.target.value)}
                className="input text-xs font-bold text-slate-700"
              >
                {SESSIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          )}
        </div>

        {tab === 'roster' && !filters.session && (
          <div className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-4 py-2.5">
            ⚠️ Select a session to filter precise split roster lists. Empty selections display students present in ANY session on the date.
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
        <div className="card space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <span className="text-xs font-extrabold text-slate-800 font-heading">{filterTitle}</span>
              <span className="ml-2 text-slate-400 text-xs font-semibold">
                ({tab === 'records' ? records.length
                  : tab === 'summary' ? summary.length
                  : tab === 'batch' ? batchSummary.length
                  : roster.length} rows fetched)
              </span>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleExportExcel}
                disabled={exporting}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 shadow-sm transition-all active:scale-95 disabled:opacity-50"
              >
                <span>📊</span> Export Excel
              </button>
              <button
                onClick={handleExportPDF}
                disabled={exporting}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 shadow-sm transition-all active:scale-95 disabled:opacity-50"
              >
                <span>📄</span> Export PDF
              </button>
            </div>
          </div>

          {tab === 'summary' && (
            <SectionSummaryTable rows={summary} loading={false} date={filters.dateFrom} showExport={false} />
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
                      <td className="p-4 font-bold text-slate-600 text-center">{r.year}</td>
                      <td className="p-4 font-bold text-slate-600 text-center uppercase">{r.section}</td>
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
                            className={`w-8 h-8 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                              page === i
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

          {tab === 'batch' && (
            <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white/50 animate-fade-in">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left border-b border-slate-100 bg-slate-50/50">
                    <th className="p-4 font-extrabold text-slate-500 uppercase tracking-widest">Training Batch</th>
                    <th className="px-3 py-4 font-extrabold text-primary-600 text-center uppercase tracking-widest">FN1</th>
                    <th className="px-3 py-4 font-extrabold text-primary-600 text-center uppercase tracking-widest">FN2</th>
                    <th className="px-3 py-4 font-extrabold text-secondary-600 text-center uppercase tracking-widest">AN1</th>
                    <th className="px-3 py-4 font-extrabold text-secondary-600 text-center uppercase tracking-widest">AN2</th>
                    <th className="p-4 font-extrabold text-slate-500 uppercase tracking-widest text-center">Total Students</th>
                    <th className="p-4 font-extrabold text-slate-500 uppercase tracking-widest text-center">Daily Avg Present</th>
                    <th className="p-4 font-extrabold text-slate-500 uppercase tracking-widest text-center">Attendance %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {batchSummary.map((b) => (
                    <tr key={b.batch} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4">
                        <span className="px-3 py-1 rounded-xl bg-slate-900 text-white text-[11px] font-extrabold uppercase">
                          Batch {b.batch}
                        </span>
                      </td>
                      <td className="px-3 py-4 text-center font-bold text-primary-600">{b.fn1_count ?? 0}</td>
                      <td className="px-3 py-4 text-center font-bold text-primary-600">{b.fn2_count ?? 0}</td>
                      <td className="px-3 py-4 text-center font-bold text-secondary-600">{b.an1_count ?? 0}</td>
                      <td className="px-3 py-4 text-center font-bold text-secondary-600">{b.an2_count ?? 0}</td>
                      <td className="p-4 font-bold text-slate-600 text-center">{b.total_students}</td>
                      <td className="p-4 font-bold text-slate-800 text-center">{b.present_count}</td>
                      <td className="p-4 text-center">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold border ${
                          b.attendance_pct >= 75
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : b.attendance_pct >= 50
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-red-50 text-red-600 border-red-200'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            b.attendance_pct >= 75 ? 'bg-emerald-500' : b.attendance_pct >= 50 ? 'bg-amber-500' : 'bg-red-500'
                          }`} />
                          {b.attendance_pct}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'roster' && (
            <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white/50">
              <AttendanceRosterTable
                rows={roster}
                loading={false}
                date={filters.dateFrom}
                session={filters.session || 'All Sessions'}
              />
              
              {/* Pagination Controls */}
              {totalCount > limit && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-t border-slate-100 bg-slate-50/50">
                  <span className="text-[11px] text-slate-400 font-semibold">
                    Showing <span className="text-slate-700 font-bold">{(page - 1) * limit + 1}</span> to{' '}
                    <span className="text-slate-700 font-bold">{Math.min(page * limit, totalCount)}</span> of{' '}
                    <span className="text-slate-700 font-bold">{totalCount}</span> split roster records
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
                            className={`w-8 h-8 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                              page === i
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
        </div>
      )}

      {/* Roster empty fallback */}
      {tab === 'roster' && !hasResults && !loading && (
        <div className="card">
          <AttendanceRosterTable
            rows={[]}
            loading={false}
            date={filters.dateFrom}
            session={filters.session || 'All Sessions'}
          />
        </div>
      )}
    </div>
  )
}
