'use client'

import React, { useEffect, useState } from 'react'
import { useModule } from '@/context/ModuleContext'
import { createClient } from '@/lib/supabase/client'
import { todayIST } from '@/lib/utils'

interface RosterRow {
  student_id: string
  name: string
  department: string
  section: string
  year: number
  batch: string | null
  present: boolean
}

export default function CdcAttendance() {
  const { cdcPeriods } = useModule()
  const supabase = createClient()
  const [selectedPeriod, setSelectedPeriod] = useState<number>(1)
  const [roster, setRoster] = useState<RosterRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    setLoading(true)
    supabase
      .rpc('get_cdc_attendance_roster', { p_date: todayIST(), p_period: selectedPeriod })
      .then(({ data, error }) => {
        if (!error && data) setRoster(data)
        setLoading(false)
      })
  }, [supabase, selectedPeriod])

  const presentCount = roster.filter((r) => r.present).length
  const filteredRoster = roster.filter((r) =>
    !search ||
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.student_id.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="card bg-white p-6 space-y-6 border border-slate-100 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4 gap-2">
        <div>
          <h3 className="text-xl font-bold text-slate-800 font-heading">CDC Period Attendance Logger</h3>
          <p className="text-xs text-slate-500">Record and review student attendance for specific CDC class periods</p>
        </div>

        {/* Period Selector Pills */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto">
          {cdcPeriods.map((p) => (
            <button
              key={p.period}
              onClick={() => setSelectedPeriod(p.period)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                selectedPeriod === p.period
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-white'
              }`}
            >
              P{p.period}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-indigo-50/60 border border-indigo-100 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <span className="text-[10px] font-extrabold uppercase text-indigo-700 tracking-wider">Active Selection</span>
          <h4 className="text-sm font-bold text-slate-800">
            CDC Class Period {selectedPeriod} ({cdcPeriods[selectedPeriod - 1]?.start_time} - {cdcPeriods[selectedPeriod - 1]?.end_time})
          </h4>
          <p className="text-xs font-bold text-emerald-700">
            {loading ? 'Loading…' : `${presentCount} / ${roster.length} marked present`}
          </p>
        </div>
        <a
          href="/faculty/scan"
          className="btn-primary bg-indigo-600 hover:bg-indigo-700 text-xs px-4 py-2 text-center"
        >
          📷 Scan QR for Period {selectedPeriod}
        </a>
      </div>

      <div className="space-y-3">
        <input
          type="text"
          placeholder="Search student name or ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input text-xs w-full sm:w-72"
        />

        <div className="overflow-x-auto rounded-2xl border border-slate-200/80 max-h-80 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 sticky top-0">
              <tr className="text-left text-slate-500 font-extrabold uppercase tracking-wider">
                <th className="px-4 py-2.5">Student ID</th>
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Dept / Section</th>
                <th className="px-4 py-2.5 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={4} className="text-center py-8 text-slate-400 font-semibold">Loading roster…</td></tr>
              ) : filteredRoster.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-8 text-slate-400 font-semibold">No students found.</td></tr>
              ) : (
                filteredRoster.map((r) => (
                  <tr key={r.student_id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-2.5 font-mono font-bold text-slate-700">{r.student_id}</td>
                    <td className="px-4 py-2.5 font-semibold text-slate-800">{r.name}</td>
                    <td className="px-4 py-2.5 text-slate-500">{r.department} · {r.section}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`badge text-[10px] ${r.present ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                        {r.present ? '✓ Present' : 'Absent'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
