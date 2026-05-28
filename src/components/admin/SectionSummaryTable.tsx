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
        <p className="text-xs font-bold text-slate-400">No attendance data registered for this date/department</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
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
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 shadow-sm transition-all active:scale-95 disabled:opacity-50"
          >
            <span>📄</span> Export PDF
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white/50 backdrop-blur-md">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left border-b border-slate-100 bg-slate-50/50">
              <th className="p-4 font-extrabold text-slate-500 uppercase tracking-widest">Dept</th>
              <th className="p-4 font-extrabold text-slate-500 uppercase tracking-widest">Yr</th>
              <th className="p-4 font-extrabold text-slate-500 uppercase tracking-widest">Sec</th>
              {/* FN sessions */}
              {['FN1','FN2','FN3'].map((s) => (
                <th key={s} className="p-4 font-extrabold text-brand-600 text-center uppercase tracking-widest">{s}</th>
              ))}
              {/* AN sessions */}
              {['AN1','AN2','AN3'].map((s) => (
                <th key={s} className="p-4 font-extrabold text-indigo-600 text-center uppercase tracking-widest">{s}</th>
              ))}
              <th className="p-4 font-extrabold text-slate-500 text-center uppercase tracking-widest">Total</th>
              <th className="p-4 font-extrabold text-slate-500 text-center uppercase tracking-widest">%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r, i) => {
              const pct = r.attendance_pct
              return (
                <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-4 font-bold text-slate-800 uppercase">{r.department}</td>
                  <td className="p-4 font-semibold text-slate-500">{r.year}</td>
                  <td className="p-4 font-semibold text-slate-500 uppercase">{r.section}</td>
                  <td className="p-4 text-center text-brand-600 font-bold">
                    {r.fn1_count || <span className="text-slate-300 font-normal">—</span>}
                  </td>
                  <td className="p-4 text-center text-brand-600 font-bold">
                    {r.fn2_count || <span className="text-slate-300 font-normal">—</span>}
                  </td>
                  <td className="p-4 text-center text-brand-600 font-bold">
                    {r.fn3_count || <span className="text-slate-300 font-normal">—</span>}
                  </td>
                  <td className="p-4 text-center text-indigo-600 font-bold">
                    {r.an1_count || <span className="text-slate-300 font-normal">—</span>}
                  </td>
                  <td className="p-4 text-center text-indigo-600 font-bold">
                    {r.an2_count || <span className="text-slate-300 font-normal">—</span>}
                  </td>
                  <td className="p-4 text-center text-indigo-600 font-bold">
                    {r.an3_count || <span className="text-slate-300 font-normal">—</span>}
                  </td>
                  <td className="p-4 text-center font-extrabold text-slate-700">
                    {r.total_students}
                  </td>
                  <td className="p-4 text-center">
                    <span
                      className={cn(
                        'badge border font-bold',
                        pct >= 75 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                        pct >= 50 ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                    'bg-red-50 text-red-600 border-red-200'
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
