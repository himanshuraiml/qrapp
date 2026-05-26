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
}

export default function AttendanceRosterTable({ rows, loading, date, session }: Props) {
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
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 bg-slate-100 rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <p className="text-sm text-slate-400 text-center py-12">
        No data — select a date &amp; session, then click Generate Report.
      </p>
    )
  }

  const totalPresent = rows.filter((r) => r.present).length
  const totalAbsent  = rows.length - totalPresent
  const pct          = rows.length > 0 ? Math.round((totalPresent / rows.length) * 100) : 0

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-sm font-medium text-slate-700">
            Total <span className="font-bold text-slate-900">{rows.length}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 border border-green-200 text-sm font-medium text-green-700">
            ✅ Present <span className="font-bold">{totalPresent}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-sm font-medium text-red-700">
            ❌ Absent <span className="font-bold">{totalAbsent}</span>
          </span>
          <span className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold border',
            pct >= 75 ? 'bg-green-50 border-green-200 text-green-700'
            : pct >= 50 ? 'bg-amber-50 border-amber-200 text-amber-700'
            : 'bg-red-50 border-red-200 text-red-700'
          )}>
            {pct}%
          </span>
        </div>

        {/* Export buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleExcel}
            disabled={exporting}
            className="btn-secondary text-sm flex items-center gap-1.5"
          >
            <span>📊</span> Excel
          </button>
          <button
            onClick={handlePDF}
            disabled={exporting}
            className="btn-secondary text-sm flex items-center gap-1.5"
          >
            <span>📄</span> PDF
          </button>
        </div>
      </div>

      {/* Groups */}
      <div className="space-y-3">
        {groups.map((g) => {
          const key       = `${g.dept}__${g.section}`
          const isOpen    = !collapsed.has(key)
          const present   = g.rows.filter((r) => r.present).length
          const absent    = g.rows.length - present
          const groupPct  = Math.round((present / g.rows.length) * 100)

          return (
            <div key={key} className="border border-slate-100 rounded-xl overflow-hidden">
              {/* Group header — click to collapse */}
              <button
                onClick={() => toggleGroup(key)}
                className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="text-slate-400 text-xs">{isOpen ? '▼' : '▶'}</span>
                  <span className="font-semibold text-slate-800 text-sm">{g.dept}</span>
                  <span className="badge bg-slate-200 text-slate-600">Sec {g.section}</span>
                </div>
                <div className="flex items-center gap-2 text-xs font-medium">
                  <span className="text-green-600">✅ {present}</span>
                  <span className="text-slate-300">|</span>
                  <span className="text-red-500">❌ {absent}</span>
                  <span className="text-slate-300">|</span>
                  <span className={cn(
                    'badge font-semibold',
                    groupPct >= 75 ? 'bg-green-100 text-green-700'
                    : groupPct >= 50 ? 'bg-amber-100 text-amber-700'
                    : 'bg-red-100 text-red-600'
                  )}>
                    {groupPct}%
                  </span>
                </div>
              </button>

              {/* Student rows — only shown when expanded */}
              {isOpen && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-white">
                        <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">Student ID</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">Name</th>
                        <th className="px-4 py-2 text-center text-xs font-semibold text-slate-500">Year</th>
                        <th className="px-4 py-2 text-center text-xs font-semibold text-slate-500">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {g.rows.map((r) => (
                        <tr
                          key={r.student_id}
                          className={cn(
                            'transition-colors',
                            r.present ? 'hover:bg-green-50/40' : 'hover:bg-red-50/40'
                          )}
                        >
                          <td className="px-4 py-2.5 font-mono text-xs text-slate-400">{r.student_id}</td>
                          <td className="px-4 py-2.5 font-medium text-slate-800">{r.name}</td>
                          <td className="px-4 py-2.5 text-center text-slate-500">{r.year}</td>
                          <td className="px-4 py-2.5 text-center">
                            {r.present ? (
                              <span className="badge bg-green-100 text-green-700 font-semibold">✅ Present</span>
                            ) : (
                              <span className="badge bg-red-100 text-red-600 font-semibold">❌ Absent</span>
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
