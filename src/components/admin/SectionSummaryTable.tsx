'use client'

import { cn } from '@/lib/utils'
import {
  exportSectionSummaryToExcel,
  exportSectionSummaryToPDF,
} from '@/lib/export'
import type { SectionSummary } from '@/types'
import { useState } from 'react'

interface Props {
  rows: SectionSummary[]
  loading: boolean
  date: string
  showExport?: boolean
}

export default function SectionSummaryTable({ rows, loading, date, showExport = true }: Props) {
  const [exporting, setExporting] = useState(false)

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

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-9 bg-slate-100 rounded animate-pulse" />
        ))}
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <p className="text-sm text-slate-400 text-center py-10">
        No data for this date / department.
      </p>
    )
  }

  return (
    <div>
      {showExport && (
        <div className="flex justify-end gap-2 mb-3">
          <button
            onClick={handleExcel}
            disabled={exporting}
            className="btn-secondary text-xs flex items-center gap-1"
          >
            📊 Excel
          </button>
          <button
            onClick={handlePDF}
            disabled={exporting}
            className="btn-secondary text-xs flex items-center gap-1"
          >
            📄 PDF
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b-2 border-slate-100">
              <th className="pb-3 pr-3 font-semibold text-slate-600 whitespace-nowrap">Dept</th>
              <th className="pb-3 pr-3 font-semibold text-slate-600">Yr</th>
              <th className="pb-3 pr-3 font-semibold text-slate-600">Sec</th>
              {/* FN sessions */}
              {['FN1','FN2','FN3'].map((s) => (
                <th key={s} className="pb-3 pr-3 font-semibold text-blue-600 text-center">{s}</th>
              ))}
              {/* AN sessions */}
              {['AN1','AN2','AN3'].map((s) => (
                <th key={s} className="pb-3 pr-3 font-semibold text-amber-600 text-center">{s}</th>
              ))}
              <th className="pb-3 pr-3 font-semibold text-slate-600 text-center">Total</th>
              <th className="pb-3 font-semibold text-slate-600 text-center">%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map((r, i) => {
              const pct = r.attendance_pct
              return (
                <tr key={i} className="hover:bg-slate-50 transition-colors">
                  <td className="py-2.5 pr-3 font-medium text-slate-800">{r.department}</td>
                  <td className="py-2.5 pr-3 text-slate-500">{r.year}</td>
                  <td className="py-2.5 pr-3 text-slate-500">{r.section}</td>
                  <td className="py-2.5 pr-3 text-center text-blue-700 font-medium">
                    {r.fn1_count || <span className="text-slate-300">—</span>}
                  </td>
                  <td className="py-2.5 pr-3 text-center text-blue-700 font-medium">
                    {r.fn2_count || <span className="text-slate-300">—</span>}
                  </td>
                  <td className="py-2.5 pr-3 text-center text-blue-700 font-medium">
                    {r.fn3_count || <span className="text-slate-300">—</span>}
                  </td>
                  <td className="py-2.5 pr-3 text-center text-amber-700 font-medium">
                    {r.an1_count || <span className="text-slate-300">—</span>}
                  </td>
                  <td className="py-2.5 pr-3 text-center text-amber-700 font-medium">
                    {r.an2_count || <span className="text-slate-300">—</span>}
                  </td>
                  <td className="py-2.5 pr-3 text-center text-amber-700 font-medium">
                    {r.an3_count || <span className="text-slate-300">—</span>}
                  </td>
                  <td className="py-2.5 pr-3 text-center font-semibold text-slate-700">
                    {r.total_students}
                  </td>
                  <td className="py-2.5 text-center">
                    <span
                      className={cn(
                        'badge font-semibold',
                        pct >= 75 ? 'bg-green-100 text-green-700' :
                        pct >= 50 ? 'bg-amber-100 text-amber-700' :
                                    'bg-red-100 text-red-600'
                      )}
                    >
                      {pct}%
                    </span>
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
