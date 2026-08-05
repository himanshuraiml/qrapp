'use client'

import React, { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { todayIST, formatDate, formatTime } from '@/lib/utils'
import {
  exportCdcPeriodSummaryToExcel,
  exportCdcPeriodSummaryToPDF,
  exportCdcAttendanceToExcel,
  exportCdcAttendanceToPDF,
  exportCdcRosterToExcel,
  exportCdcRosterToPDF,
} from '@/lib/export'

interface PeriodRow {
  period_number: number
  subject: string | null
  present_count: number
  total_students: number
  attendance_pct: number
}

interface CdcAttendanceRecord {
  id: string
  student_id: string
  student_name: string
  department: string
  year: number
  section: string
  period_number: number
  subject: string | null
  date: string
  marked_at: string | null
  marked_by_name: string | null
}

interface CdcRosterRow {
  student_id: string
  name: string
  department: string
  year: number
  section: string
  periods_attended: number
  total_periods_held: number
  attendance_pct: number
}

type CdcTab = 'period_summary' | 'attendance_logs' | 'student_roster'

export default function CdcReportView() {
  const supabase = createClient()
  const today = todayIST()

  const [cdcTab, setCdcTab] = useState<CdcTab>('period_summary')
  const [dateFrom, setDateFrom] = useState(today)
  const [dateTo, setDateTo] = useState(today)
  const [department, setDepartment] = useState('')
  const [section, setSection] = useState('')
  const [periodFilter, setPeriodFilter] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'defaulter' | 'critical' | 'good'>('all')

  const [deptsList, setDeptsList] = useState<string[]>([])
  const [sectionsList, setSectionsList] = useState<string[]>([])

  const [periodRows, setPeriodRows] = useState<PeriodRow[]>([])
  const [logs, setLogs] = useState<CdcAttendanceRecord[]>([])
  const [roster, setRoster] = useState<CdcRosterRow[]>([])

  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Fetch departments and sections
  useEffect(() => {
    async function loadFilters() {
      const { data } = await supabase.rpc('get_distinct_filters')
      if (data) {
        setDeptsList(data.departments ?? [])
        setSectionsList(data.sections ?? [])
      }
    }
    loadFilters()
  }, [supabase])

  // Fetch data depending on sub-tab
  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      try {
        if (cdcTab === 'period_summary') {
          const { data, error } = await supabase.rpc('get_cdc_period_summary', { p_date: dateFrom })
          if (!error && data) {
            setPeriodRows(data)
          } else {
            setPeriodRows([])
          }
        } else if (cdcTab === 'attendance_logs') {
          let q = supabase
            .from('cdc_attendance')
            .select('*')
            .gte('date', dateFrom)
            .lte('date', dateTo)

          if (department) q = q.eq('department', department)
          if (section) q = q.eq('section', section)
          if (periodFilter) q = q.eq('period_number', parseInt(periodFilter))
          if (searchQuery.trim()) {
            q = q.or(`student_id.ilike.%${searchQuery.trim()}%,student_name.ilike.%${searchQuery.trim()}%`)
          }

          q = q.order('date', { ascending: false }).order('period_number', { ascending: true }).limit(500)

          const { data, error } = await q
          if (!error && data) {
            setLogs(data)
          } else {
            setLogs([])
          }
        } else if (cdcTab === 'student_roster') {
          // Fetch CDC attendance records in date range to calculate per-student stats
          let q = supabase
            .from('cdc_attendance')
            .select('student_id, student_name, department, year, section, period_number, date')
            .gte('date', dateFrom)
            .lte('date', dateTo)

          if (department) q = q.eq('department', department)
          if (section) q = q.eq('section', section)

          const { data, error } = await q
          if (!error && data) {
            // Group by student
            const studentMap: Record<string, {
              student_id: string
              name: string
              department: string
              year: number
              section: string
              attendedSet: Set<string>
            }> = {}

            const periodSessionsSet = new Set<string>()

            data.forEach((rec: any) => {
              const sessionKey = `${rec.date}_P${rec.period_number}_${rec.department}_${rec.section}`
              periodSessionsSet.add(sessionKey)

              if (!studentMap[rec.student_id]) {
                studentMap[rec.student_id] = {
                  student_id: rec.student_id,
                  name: rec.student_name,
                  department: rec.department,
                  year: rec.year,
                  section: rec.section,
                  attendedSet: new Set(),
                }
              }
              studentMap[rec.student_id].attendedSet.add(`${rec.date}_P${rec.period_number}`)
            })

            const totalHeld = Math.max(1, periodSessionsSet.size)

            let rowsList: CdcRosterRow[] = Object.values(studentMap).map((st) => {
              const attended = st.attendedSet.size
              const pct = Math.round((attended / totalHeld) * 100)
              return {
                student_id: st.student_id,
                name: st.name,
                department: st.department,
                year: st.year,
                section: st.section,
                periods_attended: attended,
                total_periods_held: totalHeld,
                attendance_pct: pct,
              }
            })

            // Filter by search & status
            if (searchQuery.trim()) {
              const q = searchQuery.toLowerCase()
              rowsList = rowsList.filter((r) => r.student_id.toLowerCase().includes(q) || r.name.toLowerCase().includes(q))
            }

            if (statusFilter === 'defaulter') {
              rowsList = rowsList.filter((r) => r.attendance_pct < 75)
            } else if (statusFilter === 'critical') {
              rowsList = rowsList.filter((r) => r.attendance_pct >= 75 && r.attendance_pct < 85)
            } else if (statusFilter === 'good') {
              rowsList = rowsList.filter((r) => r.attendance_pct >= 85)
            }

            setRoster(rowsList.sort((a, b) => a.student_id.localeCompare(b.student_id)))
          } else {
            setRoster([])
          }
        }
      } catch (e) {
        console.error('Error fetching CDC report data:', e)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [supabase, cdcTab, dateFrom, dateTo, department, section, periodFilter, searchQuery, statusFilter])

  // Summary Metrics
  const totalClasses = periodRows.reduce((acc, r) => acc + r.present_count, 0)
  const avgAttendance = periodRows.length > 0
    ? Math.round(periodRows.reduce((acc, r) => acc + r.attendance_pct, 0) / periodRows.length)
    : 0

  async function handleExportExcel() {
    setExporting(true)
    try {
      if (cdcTab === 'period_summary') {
        await exportCdcPeriodSummaryToExcel(periodRows, dateFrom)
      } else if (cdcTab === 'attendance_logs') {
        const title = `CDC Logs (${dateFrom} to ${dateTo})`
        await exportCdcAttendanceToExcel(logs, title, `CDC_Attendance_Logs_${dateFrom}`)
      } else if (cdcTab === 'student_roster') {
        const rangeText = `${dateFrom}_to_${dateTo}`
        await exportCdcRosterToExcel(roster, rangeText)
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
      if (cdcTab === 'period_summary') {
        await exportCdcPeriodSummaryToPDF(periodRows, dateFrom)
      } else if (cdcTab === 'attendance_logs') {
        const title = `CDC Logs (${dateFrom} to ${dateTo})`
        await exportCdcAttendanceToPDF(logs, title, `CDC_Attendance_Logs_${dateFrom}`)
      } else if (cdcTab === 'student_roster') {
        const rangeText = `${dateFrom}_to_${dateTo}`
        await exportCdcRosterToPDF(roster, rangeText)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Banner & Export Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-indigo-950 font-heading flex items-center gap-2">
            <span>📚</span> CDC Classes Attendance Reports
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            Period-wise timetable logs, student class turnout, and CDC attendance records.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleExportPDF}
            disabled={exporting || loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-indigo-200 bg-white text-indigo-700 font-bold text-xs shadow-sm hover:bg-indigo-50 transition-all disabled:opacity-50"
          >
            📄 Export PDF
          </button>
          <button
            onClick={handleExportExcel}
            disabled={exporting || loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold text-xs shadow-md shadow-indigo-500/20 hover:bg-indigo-700 transition-all disabled:opacity-50"
          >
            📊 Export Excel
          </button>
        </div>
      </div>

      {/* CDC Metric Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="card p-4 bg-gradient-to-br from-indigo-500 to-indigo-700 text-white shadow-md shadow-indigo-500/10">
          <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-100">Date Viewed</p>
          <p className="text-lg font-extrabold mt-1">{formatDate(dateFrom)}</p>
        </div>
        <div className="card p-4 bg-white border border-slate-200 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Period Marks</p>
          <p className="text-2xl font-black text-indigo-600 mt-1">{totalClasses}</p>
        </div>
        <div className="card p-4 bg-white border border-slate-200 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Average Period Attendance</p>
          <p className="text-2xl font-black text-emerald-600 mt-1">{avgAttendance}%</p>
        </div>
        <div className="card p-4 bg-white border border-slate-200 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total CDC Periods</p>
          <p className="text-2xl font-black text-slate-800 mt-1">{periodRows.length} Periods</p>
        </div>
      </div>

      {/* Sub-Tabs Selector */}
      <div className="flex bg-slate-200/60 p-1 rounded-2xl gap-1 w-fit border border-slate-200">
        <button
          onClick={() => setCdcTab('period_summary')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            cdcTab === 'period_summary' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          📊 Period Summary
        </button>
        <button
          onClick={() => setCdcTab('student_roster')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            cdcTab === 'student_roster' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          👤 CDC Student Roster
        </button>
        <button
          onClick={() => setCdcTab('attendance_logs')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            cdcTab === 'attendance_logs' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          📑 CDC Raw Logs
        </button>
      </div>

      {/* Filters Bar */}
      <div className="card bg-white p-4 border border-slate-200/80 shadow-sm space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-4">
          <div>
            <label className="block text-[10px] font-extrabold uppercase text-slate-400 tracking-wider mb-1">
              From Date
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="input text-xs font-semibold"
            />
          </div>

          {cdcTab !== 'period_summary' && (
            <div>
              <label className="block text-[10px] font-extrabold uppercase text-slate-400 tracking-wider mb-1">
                To Date
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="input text-xs font-semibold"
              />
            </div>
          )}

          <div>
            <label className="block text-[10px] font-extrabold uppercase text-slate-400 tracking-wider mb-1">
              Department
            </label>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="input text-xs font-semibold text-slate-700"
            >
              <option value="">All Departments</option>
              {deptsList.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-extrabold uppercase text-slate-400 tracking-wider mb-1">
              Section
            </label>
            <select
              value={section}
              onChange={(e) => setSection(e.target.value)}
              className="input text-xs font-semibold text-slate-700"
            >
              <option value="">All Sections</option>
              {sectionsList.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {cdcTab === 'attendance_logs' && (
            <div>
              <label className="block text-[10px] font-extrabold uppercase text-slate-400 tracking-wider mb-1">
                Period #
              </label>
              <select
                value={periodFilter}
                onChange={(e) => setPeriodFilter(e.target.value)}
                className="input text-xs font-semibold text-slate-700"
              >
                <option value="">All Periods</option>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((p) => (
                  <option key={p} value={p}>Period {p}</option>
                ))}
              </select>
            </div>
          )}

          {cdcTab === 'student_roster' && (
            <div>
              <label className="block text-[10px] font-extrabold uppercase text-slate-400 tracking-wider mb-1">
                Status Filter
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="input text-xs font-semibold text-slate-700"
              >
                <option value="all">All Students</option>
                <option value="defaulter">⚠️ Defaulter (&lt; 75%)</option>
                <option value="critical">⚡ Critical (75% - 85%)</option>
                <option value="good">✅ Good (&ge; 85%)</option>
              </select>
            </div>
          )}

          {cdcTab !== 'period_summary' && (
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-[10px] font-extrabold uppercase text-slate-400 tracking-wider mb-1">
                Search Student
              </label>
              <input
                type="text"
                placeholder="ID or Name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input text-xs"
              />
            </div>
          )}
        </div>
      </div>

      {/* Content Tables */}
      <div className="card bg-white border border-slate-200/80 shadow-sm overflow-hidden rounded-2xl">
        {loading ? (
          <div className="py-12 text-center text-slate-400 font-semibold animate-pulse">
            Loading CDC Report Data…
          </div>
        ) : cdcTab === 'period_summary' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-left text-slate-500 font-extrabold uppercase tracking-wider">
                  <th className="px-4 py-3">Period</th>
                  <th className="px-4 py-3">Subject</th>
                  <th className="px-4 py-3 text-center">Present Students</th>
                  <th className="px-4 py-3 text-center">Total Students</th>
                  <th className="px-4 py-3 text-right">Attendance Turnout</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {periodRows.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-8 text-slate-400 font-semibold">No CDC period data for {dateFrom}.</td></tr>
                ) : (
                  periodRows.map((r) => (
                    <tr key={r.period_number} className="hover:bg-indigo-50/40 transition-colors">
                      <td className="px-4 py-3 font-extrabold text-indigo-900">Period {r.period_number}</td>
                      <td className="px-4 py-3 font-medium text-slate-700">{r.subject || '—'}</td>
                      <td className="px-4 py-3 text-center font-bold text-emerald-700">{r.present_count}</td>
                      <td className="px-4 py-3 text-center text-slate-500">{r.total_students}</td>
                      <td className="px-4 py-3 text-right font-extrabold text-indigo-700">{r.attendance_pct}%</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : cdcTab === 'attendance_logs' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-left text-slate-500 font-extrabold uppercase tracking-wider">
                  <th className="px-4 py-3">Student ID</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Dept / Sec</th>
                  <th className="px-4 py-3">Period</th>
                  <th className="px-4 py-3">Subject</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Marked Time</th>
                  <th className="px-4 py-3">Marked By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-8 text-slate-400 font-semibold">No CDC attendance logs found matching filters.</td></tr>
                ) : (
                  logs.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono font-bold text-indigo-900">{r.student_id}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800">{r.student_name}</td>
                      <td className="px-4 py-3 text-slate-600">{r.department} {r.year} Yr - {r.section}</td>
                      <td className="px-4 py-3 font-extrabold text-indigo-600">Period {r.period_number}</td>
                      <td className="px-4 py-3 text-slate-700">{r.subject || '—'}</td>
                      <td className="px-4 py-3 text-slate-500">{formatDate(r.date)}</td>
                      <td className="px-4 py-3 text-slate-500">{r.marked_at ? formatTime(r.marked_at) : '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{r.marked_by_name || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-left text-slate-500 font-extrabold uppercase tracking-wider">
                  <th className="px-4 py-3">Student ID</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Section</th>
                  <th className="px-4 py-3 text-center">Periods Attended</th>
                  <th className="px-4 py-3 text-center">Total Periods Held</th>
                  <th className="px-4 py-3 text-right">CDC %</th>
                  <th className="px-4 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {roster.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-8 text-slate-400 font-semibold">No students found matching filters.</td></tr>
                ) : (
                  roster.map((r) => {
                    const isDefaulter = r.attendance_pct < 75
                    const isCritical = r.attendance_pct >= 75 && r.attendance_pct < 85
                    return (
                      <tr key={r.student_id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono font-bold text-slate-800">{r.student_id}</td>
                        <td className="px-4 py-3 font-bold text-slate-900">{r.name}</td>
                        <td className="px-4 py-3 text-slate-600">{r.department}</td>
                        <td className="px-4 py-3 text-slate-600">{r.section}</td>
                        <td className="px-4 py-3 text-center font-bold text-indigo-700">{r.periods_attended}</td>
                        <td className="px-4 py-3 text-center text-slate-500">{r.total_periods_held}</td>
                        <td className="px-4 py-3 text-right font-black text-slate-900">{r.attendance_pct}%</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold border ${
                            isDefaulter
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : isCritical
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}>
                            {isDefaulter ? '⚠️ Defaulter' : isCritical ? '⚡ Critical' : '✅ Good'}
                          </span>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
