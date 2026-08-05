'use client'

import React, { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { todayIST } from '@/lib/utils'

interface PeriodRow {
  period_number: number
  subject: string | null
  present_count: number
  total_students: number
  attendance_pct: number
}

export default function CdcReports() {
  const supabase = createClient()
  const [date, setDate] = useState(todayIST())
  const [rows, setRows] = useState<PeriodRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    supabase.rpc('get_cdc_period_summary', { p_date: date }).then(({ data, error }) => {
      if (!error && data) setRows(data)
      setLoading(false)
    })
  }, [supabase, date])

  function exportCsv() {
    const header = ['Period', 'Subject', 'Present', 'Total Students', 'Attendance %']
    const lines = rows.map((r) => [
      r.period_number,
      r.subject || '',
      r.present_count,
      r.total_students,
      r.attendance_pct,
    ].join(','))
    const csv = [header.join(','), ...lines].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cdc-period-summary-${date}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="card bg-white p-6 space-y-6 border border-slate-100 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h3 className="text-xl font-bold text-slate-800 font-heading">CDC Class Attendance Reports</h3>
          <p className="text-xs text-slate-500">Period-wise attendance logs, student attendance %, and export reports</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input text-xs"
          />
          <button onClick={exportCsv} disabled={loading || rows.length === 0} className="btn-secondary text-xs disabled:opacity-50">
            📥 Export CSV
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200/80">
        <table className="w-full text-xs">
          <thead className="bg-slate-50">
            <tr className="text-left text-slate-500 font-extrabold uppercase tracking-wider">
              <th className="px-4 py-2.5">Period</th>
              <th className="px-4 py-2.5">Subject</th>
              <th className="px-4 py-2.5 text-center">Present</th>
              <th className="px-4 py-2.5 text-center">Total</th>
              <th className="px-4 py-2.5 text-right">Attendance %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={5} className="text-center py-8 text-slate-400 font-semibold">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8 text-slate-400 font-semibold">No data for this date.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.period_number} className="hover:bg-slate-50/70">
                  <td className="px-4 py-2.5 font-bold text-slate-800">Period {r.period_number}</td>
                  <td className="px-4 py-2.5 text-slate-600">{r.subject || '—'}</td>
                  <td className="px-4 py-2.5 text-center font-bold text-emerald-700">{r.present_count}</td>
                  <td className="px-4 py-2.5 text-center text-slate-600">{r.total_students}</td>
                  <td className="px-4 py-2.5 text-right font-bold text-indigo-700">{r.attendance_pct}%</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
