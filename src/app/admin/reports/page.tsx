'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { todayIST, formatDate, formatTime, sessionColor, SESSIONS } from '@/lib/utils'
import { readCache, writeCache, CACHE_TTL } from '@/lib/cache'
import {
  exportAttendanceToExcel,
  exportAttendanceToPDF,
  exportSectionSummaryToExcel,
  exportSectionSummaryToPDF,
} from '@/lib/export'
import SectionSummaryTable from '@/components/admin/SectionSummaryTable'
import AttendanceRosterTable from '@/components/admin/AttendanceRosterTable'
import type { AttendanceRecord, SectionSummary, ReportFilters, RosterRecord } from '@/types'

type Tab = 'summary' | 'records' | 'roster'

export default function ReportsPage() {
  const supabase = createClient()
  const [tab, setTab]         = useState<Tab>('summary')
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [summary, setSummary] = useState<SectionSummary[]>([])
  const [roster,  setRoster]  = useState<RosterRecord[]>([])
  const [depts,   setDepts]   = useState<string[]>([])
  const [sections, setSections] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

  const today = todayIST()
  const [filters, setFilters] = useState<ReportFilters>({
    dateFrom:   today,
    dateTo:     today,
    department: '',
    section:    '',
    year:       '',
    session:    '',
  })

  function setFilter(key: keyof ReportFilters, value: string) {
    setFilters((f) => ({ ...f, [key]: value }))
  }

  // Load dept + section options (cached — these lists rarely change mid-session)
  useEffect(() => {
    type DeptSection = { depts: string[]; sections: string[] }
    const cached = readCache<DeptSection>('dept_section_list', CACHE_TTL.options)
    if (cached) { setDepts(cached.depts); setSections(cached.sections); return }
    supabase
      .from('profiles')
      .select('department, section')
      .eq('role', 'Student')
      .then(({ data }) => {
        if (!data) return
        const depts    = [...new Set(data.map((r: any) => r.department).filter(Boolean))].sort()
        const sections = [...new Set(data.map((r: any) => r.section).filter(Boolean))].sort()
        writeCache('dept_section_list', { depts, sections })
        setDepts(depts)
        setSections(sections)
      })
  }, [])

  async function loadData() {
    setLoading(true)

    if (tab === 'records') {
      const { data } = await supabase.rpc('get_attendance_report', {
        p_date_from:  filters.dateFrom || null,
        p_date_to:    filters.dateTo   || null,
        p_department: filters.department || null,
        p_section:    filters.section   || null,
        p_year:       filters.year ? parseInt(filters.year) : null,
        p_session:    filters.session   || null,
      })
      setRecords(data ?? [])

    } else if (tab === 'summary') {
      const { data } = await supabase.rpc('get_section_summary', {
        p_date:       filters.dateFrom,
        p_department: filters.department || null,
      })
      setSummary(data ?? [])

    } else {
      // roster tab
      const { data } = await supabase.rpc('get_attendance_roster', {
        p_date:       filters.dateFrom,
        p_session:    filters.session    || null,
        p_department: filters.department || null,
        p_section:    filters.section    || null,
      })
      setRoster(data ?? [])
    }

    setLoading(false)
  }

  const filterTitle = [
    formatDate(filters.dateFrom),
    filters.dateTo !== filters.dateFrom ? `– ${formatDate(filters.dateTo)}` : '',
    filters.department ? `· ${filters.department}` : '',
    filters.section    ? filters.section : '',
    filters.session    ? `· ${filters.session}` : '',
  ].filter(Boolean).join(' ')

  async function handleExportExcel() {
    setExporting(true)
    if (tab === 'records') {
      await exportAttendanceToExcel(records, filterTitle, `attendance_${filters.dateFrom}`)
    } else if (tab === 'summary') {
      await exportSectionSummaryToExcel(summary, filters.dateFrom)
    }
    // Roster export is handled inside AttendanceRosterTable component
    setExporting(false)
  }

  async function handleExportPDF() {
    setExporting(true)
    if (tab === 'records') {
      await exportAttendanceToPDF(records, filterTitle, `attendance_${filters.dateFrom}`)
    } else if (tab === 'summary') {
      await exportSectionSummaryToPDF(summary, filters.dateFrom)
    }
    setExporting(false)
  }

  const hasResults =
    (tab === 'records' && records.length > 0) ||
    (tab === 'summary' && summary.length > 0)  ||
    (tab === 'roster'  && roster.length  > 0)

  const TAB_META: { id: Tab; label: string }[] = [
    { id: 'summary', label: 'Section Summary' },
    { id: 'records', label: 'Attendance Records' },
    { id: 'roster',  label: '🗂 Roster (Present / Absent)' },
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Reports</h1>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {TAB_META.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors
              ${tab === id
                ? 'bg-white text-brand-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="card">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Date From */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              {tab === 'roster' ? 'Date' : 'From'}
            </label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilter('dateFrom', e.target.value)}
              className="input text-sm"
            />
          </div>

          {/* Date To — hidden for roster (single date only) */}
          {tab !== 'roster' && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">To</label>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => setFilter('dateTo', e.target.value)}
                className="input text-sm"
              />
            </div>
          )}

          {/* Department */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Department</label>
            <select
              value={filters.department}
              onChange={(e) => setFilter('department', e.target.value)}
              className="input text-sm"
            >
              <option value="">All</option>
              {depts.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          {/* Section */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Section</label>
            <select
              value={filters.section}
              onChange={(e) => setFilter('section', e.target.value)}
              className="input text-sm"
            >
              <option value="">All</option>
              {sections.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Year — hidden for roster */}
          {tab !== 'roster' && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Year</label>
              <select
                value={filters.year}
                onChange={(e) => setFilter('year', e.target.value)}
                className="input text-sm"
              >
                <option value="">All</option>
                {[1, 2, 3, 4].map((y) => <option key={y} value={y}>Year {y}</option>)}
              </select>
            </div>
          )}

          {/* Session — required for roster, optional for others */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Session{tab === 'roster' && <span className="text-red-500 ml-0.5">*</span>}
            </label>
            <select
              value={filters.session}
              onChange={(e) => setFilter('session', e.target.value)}
              className="input text-sm"
            >
              {SESSIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </div>

        {/* Roster hint */}
        {tab === 'roster' && !filters.session && (
          <p className="mt-3 text-xs text-amber-600 font-medium">
            ⚠ Select a session to see accurate present/absent split. Without a session, students present in ANY session on the date are marked Present.
          </p>
        )}

        <div className="flex gap-3 mt-4">
          <button
            onClick={loadData}
            disabled={loading}
            className="btn-primary"
          >
            {loading ? 'Loading…' : 'Generate Report'}
          </button>
        </div>
      </div>

      {/* Results */}
      {hasResults && (
        <div className="card">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <span className="text-sm font-medium text-slate-700">{filterTitle}</span>
              <span className="ml-2 text-sm text-slate-400">
                ({tab === 'records' ? records.length
                  : tab === 'summary' ? summary.length
                  : roster.length} rows)
              </span>
            </div>

            {/* Export buttons — only for non-roster tabs (roster handles its own) */}
            {tab !== 'roster' && (
              <div className="flex gap-2">
                <button
                  onClick={handleExportExcel}
                  disabled={exporting}
                  className="btn-secondary text-sm flex items-center gap-1.5"
                >
                  <span>📊</span> Excel
                </button>
                <button
                  onClick={handleExportPDF}
                  disabled={exporting}
                  className="btn-secondary text-sm flex items-center gap-1.5"
                >
                  <span>📄</span> PDF
                </button>
              </div>
            )}
          </div>

          {tab === 'summary' && (
            <SectionSummaryTable rows={summary} loading={false} date={filters.dateFrom} showExport={false} />
          )}

          {tab === 'records' && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-slate-100">
                    {['Student ID', 'Name', 'Dept', 'Yr', 'Sec', 'Session', 'Date', 'Time', 'Marked By'].map((h) => (
                      <th key={h} className="pb-3 pr-4 font-semibold text-slate-600 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {records.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 pr-4 font-mono text-xs text-slate-500">{r.student_id}</td>
                      <td className="py-2.5 pr-4 font-medium">{r.student_name}</td>
                      <td className="py-2.5 pr-4">{r.department}</td>
                      <td className="py-2.5 pr-4">{r.year}</td>
                      <td className="py-2.5 pr-4">{r.section}</td>
                      <td className="py-2.5 pr-4">
                        <span className={`badge ${sessionColor(r.session)}`}>{r.session}</span>
                      </td>
                      <td className="py-2.5 pr-4">{r.date}</td>
                      <td className="py-2.5 pr-4 text-slate-500">{formatTime(r.timestamp)}</td>
                      <td className="py-2.5 text-slate-500">{r.marked_by_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'roster' && (
            <AttendanceRosterTable
              rows={roster}
              loading={false}
              date={filters.dateFrom}
              session={filters.session || 'All Sessions'}
            />
          )}
        </div>
      )}

      {/* Empty state for roster when no data yet */}
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
