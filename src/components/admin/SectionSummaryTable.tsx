'use client'

import { cn } from '@/lib/utils'
import {
  exportSectionSummaryToExcel,
  exportSectionSummaryToPDF,
} from '@/lib/export'
import type { SectionSummary } from '@/types'
import { useState, useMemo } from 'react'

interface Props {
  rows: SectionSummary[]
  loading: boolean
  date: string
  showExport?: boolean
}

// Colour palette cycling per unique department
const DEPT_BORDER_COLORS = [
  'border-primary-500',
  'border-emerald-500',
  'border-amber-500',
  'border-rose-500',
  'border-violet-500',
  'border-cyan-500',
  'border-orange-500',
  'border-teal-500',
]

// Aggregate section-level rows → one row per department
interface DeptRow {
  department: string
  fn1: number
  fn2: number
  an1: number
  an2: number
  totalStudents: number
  pct: number           // weighted average %
}

function aggregateByDept(rows: SectionSummary[]): DeptRow[] {
  const map = new Map<string, {
    fn1: number; fn2: number; an1: number; an2: number
    totalStudents: number; weightedPct: number
  }>()

  for (const r of rows) {
    const key = r.department
    const existing = map.get(key) ?? { fn1: 0, fn2: 0, an1: 0, an2: 0, totalStudents: 0, weightedPct: 0 }
    map.set(key, {
      fn1:          existing.fn1 + (r.fn1_count ?? 0),
      fn2:          existing.fn2 + (r.fn2_count ?? 0),
      an1:          existing.an1 + (r.an1_count ?? 0),
      an2:          existing.an2 + (r.an2_count ?? 0),
      totalStudents: existing.totalStudents + (r.total_students ?? 0),
      weightedPct:   existing.weightedPct + ((r.attendance_pct ?? 0) * (r.total_students ?? 0)),
    })
  }

  return [...map.entries()]
    .map(([department, val]) => ({
      department,
      fn1: val.fn1,
      fn2: val.fn2,
      an1: val.an1,
      an2: val.an2,
      totalStudents: val.totalStudents,
      pct: val.totalStudents > 0
        ? Math.round(val.weightedPct / val.totalStudents)
        : 0,
    }))
    .sort((a, b) => a.department.localeCompare(b.department))
}

function PctBadge({ pct }: { pct: number }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold border',
      pct >= 75
        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
        : pct >= 50
          ? 'bg-amber-50 text-amber-700 border-amber-200'
          : 'bg-red-50 text-red-600 border-red-200'
    )}>
      <span className={cn(
        'w-1.5 h-1.5 rounded-full',
        pct >= 75 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'
      )} />
      {pct}%
    </span>
  )
}

export default function SectionSummaryTable({ rows, loading, date, showExport = true }: Props) {
  const [exporting, setExporting] = useState(false)

  const deptRows = useMemo(() => aggregateByDept(rows), [rows])

  // Build a stable dept→colour index
  const deptColorMap = useMemo(() => {
    const map = new Map<string, string>()
    deptRows.forEach((r, i) => {
      map.set(r.department, DEPT_BORDER_COLORS[i % DEPT_BORDER_COLORS.length])
    })
    return map
  }, [deptRows])

  async function handleExcel() {
    setExporting(true)
    await exportSectionSummaryToExcel(rows, date)
    setExporting(false)
  }

  async function handlePDF() {
    setExporting(true)
    await exportSectionSummaryToPDF(rows, date)
    setExporting(false)
  }

  // ── Loading skeleton ──────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-2.5 py-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 bg-slate-50 border border-slate-100 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  // ── Empty state ───────────────────────────────────────────────
  if (deptRows.length === 0) {
    return (
      <div className="text-center py-14 space-y-2">
        <span className="text-4xl">📭</span>
        <p className="text-xs font-bold text-slate-400">No attendance data for this date / department</p>
      </div>
    )
  }

  // ── Table ─────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Export buttons */}
      {showExport && (
        <div className="flex justify-end gap-2.5">
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
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-primary-600 to-secondary-600 hover:from-primary-500 hover:to-secondary-500 shadow-sm transition-all active:scale-95 disabled:opacity-50"
          >
            <span>📄</span> Export PDF
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white/60 backdrop-blur-md">
        <table className="w-full text-xs min-w-[480px]">
          <thead>
            <tr className="text-left border-b border-slate-100 bg-slate-50/70">
              {/* Department */}
              <th className="px-5 py-3.5 font-extrabold text-slate-500 uppercase tracking-widest">
                Department
              </th>
              {/* FN group */}
              <th className="px-4 py-3.5 font-extrabold text-primary-600 text-center uppercase tracking-widest">
                FN1
              </th>
              <th className="px-4 py-3.5 font-extrabold text-primary-600 text-center uppercase tracking-widest">
                FN2
              </th>
              {/* AN group */}
              <th className="px-4 py-3.5 font-extrabold text-secondary-600 text-center uppercase tracking-widest">
                AN1
              </th>
              <th className="px-4 py-3.5 font-extrabold text-secondary-600 text-center uppercase tracking-widest">
                AN2
              </th>
              {/* % */}
              <th className="px-5 py-3.5 font-extrabold text-slate-500 text-center uppercase tracking-widest">
                %
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {deptRows.map((r) => {
              const borderColor = deptColorMap.get(r.department) ?? 'border-primary-500'
              return (
                <tr
                  key={r.department}
                  className="hover:bg-slate-50/60 transition-colors duration-200 group"
                >
                  {/* Department cell with coloured left border */}
                  <td className={cn('px-5 py-4 border-l-4', borderColor)}>
                    <span className="font-extrabold text-slate-800 uppercase tracking-wide text-[11px]">
                      {r.department}
                    </span>
                    <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                      {r.totalStudents} students
                    </p>
                  </td>

                  {/* FN1 */}
                  <td className="px-4 py-4 text-center font-bold text-primary-600">
                    {r.fn1 > 0 ? r.fn1 : <span className="text-slate-200 font-normal">—</span>}
                  </td>

                  {/* FN2 */}
                  <td className="px-4 py-4 text-center font-bold text-primary-600">
                    {r.fn2 > 0 ? r.fn2 : <span className="text-slate-200 font-normal">—</span>}
                  </td>

                  {/* AN1 */}
                  <td className="px-4 py-4 text-center font-bold text-secondary-600">
                    {r.an1 > 0 ? r.an1 : <span className="text-slate-200 font-normal">—</span>}
                  </td>

                  {/* AN2 */}
                  <td className="px-4 py-4 text-center font-bold text-secondary-600">
                    {r.an2 > 0 ? r.an2 : <span className="text-slate-200 font-normal">—</span>}
                  </td>

                  {/* % badge */}
                  <td className="px-5 py-4 text-center">
                    <PctBadge pct={r.pct} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
