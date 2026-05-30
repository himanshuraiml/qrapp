'use client'

import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { exportRosterToExcel, exportRosterToPDF } from '@/lib/export'
import type { RosterRecord } from '@/types'

interface Props {
  rows: RosterRecord[]
  loading: boolean
  date: string
  session: string
  showExport?: boolean
}

export default function AttendanceRosterTable({ rows, loading, date, session, showExport = true }: Props) {
  const [exporting, setExporting] = useState(false)
  // Track which dept+section groups are collapsed
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  // Group rows by "department || section"
  const groups = useMemo(() => {
    const map = new Map<string, { dept: string; section: string; rows: RosterRecord[] }>()
    rows.forEach((r) => {
      const key = `${r.department}__${r.section}`
      if (!map.has(key)) map.set(key, { dept: r.department, section: r.section, rows: [] })
      map.get(key)!.rows.push(r)
    })
    return [...map.values()]
  }, [rows])

  function toggleGroup(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  async function handleExcel() {
    setExporting(true)
    await exportRosterToExcel(rows, date, session)
    setExporting(false)
  }

  async function handlePDF() {
    setExporting(true)
    await exportRosterToPDF(rows, date, session)
    setExporting(false)
  }

  if (loading) {
    return (
      <div className="space-y-3 py-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 bg-slate-50 border border-slate-100 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="text-center py-12 space-y-2">
        <span className="text-3xl">📭</span>
        <p className="text-xs font-bold text-slate-400">No split roster records found for active selections</p>
      </div>
    )
  }

  const totalPresent = rows.filter((r) => r.present).length
  const totalAbsent  = rows.length - totalPresent
  const pct          = rows.length > 0 ? Math.round((totalPresent / rows.length) * 100) : 0

  return (
    <div className="space-y-6">
      {/* Summary grid stats */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-5">
        <div className="flex flex-wrap gap-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-600">
            Total Students: <span className="text-slate-800">{rows.length}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-700">
            ✅ Present: {totalPresent}
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-700">
            ❌ Absent: {totalAbsent}
          </span>
          <span className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold border',
            pct >= 75 ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
            : pct >= 50 ? 'bg-amber-50 border-amber-200 text-amber-700'
            : 'bg-red-50 border-red-200 text-red-700'
          )}>
            Attendance Rate: {pct}%
          </span>
        </div>

        {/* Export buttons */}
        {showExport && (
          <div className="flex gap-2">
            <button
              onClick={handleExcel}
              disabled={exporting}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 shadow-sm transition-all active:scale-95 disabled:opacity-50"
            >
              <span>📊</span> Export Excel
            </button>
            <button
              onClick={handlePDF}
              disabled={exporting}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 shadow-sm transition-all active:scale-95 disabled:opacity-50"
            >
              <span>📄</span> Export PDF
            </button>
          </div>
        )}
      </div>

      {/* Roster classroom groups accordions */}
      <div className="space-y-4">
        {groups.map((g) => {
          const key       = `${g.dept}__${g.section}`
          const isOpen    = !collapsed.has(key)
          const present   = g.rows.filter((r) => r.present).length
          const absent    = g.rows.length - present
          const groupPct  = Math.round((present / g.rows.length) * 100)

          return (
            <div key={key} className="border border-slate-100 rounded-2xl overflow-hidden bg-white/50 backdrop-blur-md">
              {/* Group header */}
              <button
                onClick={() => toggleGroup(key)}
                className="w-full flex items-center justify-between px-4 py-3 bg-slate-50/50 hover:bg-slate-100/50 border-b border-slate-100 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="text-slate-400 text-xs transition-transform duration-300">{isOpen ? '▼' : '▶'}</span>
                  <span className="font-extrabold text-slate-800 text-xs uppercase tracking-wider">{g.dept} Department</span>
                  <span className="badge bg-brand-50 text-brand-600 text-[10px] font-bold border border-brand-200">Sec {g.section}</span>
                </div>
                <div className="flex items-center gap-3 text-xs font-semibold">
                  <span className="text-emerald-600">✅ {present}</span>
                  <span className="text-slate-300">|</span>
                  <span className="text-red-500">❌ {absent}</span>
                  <span className="text-slate-300">|</span>
                  <span className={cn(
                    'badge border font-bold text-[10px]',
                    groupPct >= 75 ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    : groupPct >= 50 ? 'bg-amber-50 border-amber-200 text-amber-700'
                    : 'bg-red-50 border-red-200 text-red-600'
                  )}>
                    {groupPct}%
                  </span>
                </div>
              </button>

              {/* Student list elements */}
              {isOpen && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 bg-white/30">
                        <th className="px-4 py-3 text-left font-extrabold text-slate-500 uppercase tracking-widest">Student ID</th>
                        <th className="px-4 py-3 text-left font-extrabold text-slate-500 uppercase tracking-widest">Full Name</th>
                        <th className="px-4 py-3 text-center font-extrabold text-slate-500 uppercase tracking-widest">Year</th>
                        <th className="px-4 py-3 text-center font-extrabold text-slate-500 uppercase tracking-widest">Attendance Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white/20">
                      {g.rows.map((r) => (
                        <tr
                          key={r.student_id}
                          className={cn(
                            'transition-colors duration-300',
                            r.present ? 'hover:bg-emerald-50/20' : 'hover:bg-red-50/20'
                          )}
                        >
                          <td className="px-4 py-2.5 font-mono font-bold text-slate-400">{r.student_id}</td>
                          <td className="px-4 py-2.5 font-bold text-slate-800 text-sm">{r.name}</td>
                          <td className="px-4 py-2.5 text-center font-bold text-slate-600">{r.year}</td>
                          <td className="px-4 py-2.5 text-center">
                            {r.present ? (
                              <span className="badge bg-emerald-50 border border-emerald-200 text-emerald-700 font-extrabold text-[10px]">Present</span>
                            ) : (
                              <span className="badge bg-red-50 border border-red-200 text-red-600 font-extrabold text-[10px]">Absent</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
