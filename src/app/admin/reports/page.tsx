'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { todayIST, formatDate, formatTime, sessionColor, SESSIONS } from '@/lib/utils'
import {
  exportAttendanceToExcel,
  exportAttendanceToPDF,
  exportSectionSummaryToExcel,
  exportSectionSummaryToPDF,
} from '@/lib/export'
import SectionSummaryTable from '@/components/admin/SectionSummaryTable'
import type { AttendanceRecord, SectionSummary, ReportFilters } from '@/types'

export default function ReportsPage() {
  const supabase = createClient()
  const [tab, setTab]         = useState<'records' | 'summary'>('summary')
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [summary, setSummary] = useState<SectionSummary[]>([])
  const [depts, setDepts]     = useState<string[]>([])
  const [sections, setSections] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

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
  }

  useEffect(() => {
    supabase
      .from('profiles')
      .select('department, section')
      .eq('role', 'Student')
      .then(({ data }) => {
        if (!data) return
        setDepts([...new Set(data.map((r: any) => r.department).filter(Boolean))].sort())
        setSections([...new Set(data.map((r: any) => r.section).filter(Boolean))].sort())
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
    } else {
      const { data } = await supabase.rpc('get_section_summary', {
        p_date:       filters.dateFrom,
        p_department: filters.department || null,
      })
      setSummary(data ?? [])
    }
    setLoading(false)
  }

  const filterTitle = `${formatDate(filters.dateFrom)}${filters.dateTo !== filters.dateFrom ? ` – ${formatDate(filters.dateTo)}` : ''}${filters.department ? ` · ${filters.department}` : ''}${filters.section ? ` ${filters.section}` : ''}${filters.session ? ` · ${filters.session}` : ''}`

  async function handleExportExcel() {
    setExporting(true)
    if (tab === 'records') {
      await exportAttendanceToExcel(records, filterTitle, `attendance_${filters.dateFrom}`)
    } else {
      await exportSectionSummaryToExcel(summary, filters.dateFrom)
    }
    setExporting(false)
  }

  async function handleExportPDF() {
    setExporting(true)
    if (tab === 'records') {
      await exportAttendanceToPDF(records, filterTitle, `attendance_${filters.dateFrom}`)
    } else {
      await exportSectionSummaryToPDF(summary, filters.dateFrom)
    }
    setExporting(false)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Reports</h1>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {(['summary', 'records'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors
              ${tab === t ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {t === 'summary' ? 'Section Summary' : 'Attendance Records'}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="card">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">From</label>
            <input type="date" value={filters.dateFrom}
              onChange={(e) => setFilter('dateFrom', e.target.value)} className="input text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">To</label>
            <input type="date" value={filters.dateTo}
              onChange={(e) => setFilter('dateTo', e.target.value)} className="input text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Department</label>
            <select value={filters.department} onChange={(e) => setFilter('department', e.target.value)} className="input text-sm">
              <option value="">All</option>
              {depts.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Section</label>
            <select value={filters.section} onChange={(e) => setFilter('section', e.target.value)} className="input text-sm">
              <option value="">All</option>
              {sections.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Year</label>
            <select value={filters.year} onChange={(e) => setFilter('year', e.target.value)} className="input text-sm">
              <option value="">All</option>
              {[1, 2, 3, 4].map((y) => <option key={y} value={y}>Year {y}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Session</label>
            <select value={filters.session} onChange={(e) => setFilter('session', e.target.value)} className="input text-sm">
              {SESSIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-3 mt-4">
          <button onClick={loadData} disabled={loading} className="btn-primary">
            {loading ? 'Loading…' : 'Generate Report'}
          </button>
        </div>
      </div>

      {/* Results */}
      {(records.length > 0 || summary.length > 0) && (
        <div className="card">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <span className="text-sm font-medium text-slate-700">{filterTitle}</span>
              <span className="ml-2 text-sm text-slate-400">
                ({tab === 'records' ? records.length : summary.length} rows)
              </span>
            </div>
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
          </div>

          {tab === 'summary' ? (
            <SectionSummaryTable rows={summary} loading={false} date={filters.dateFrom} showExport={false} />
          ) : (
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
        </div>
      )}
    </div>
  )
}
