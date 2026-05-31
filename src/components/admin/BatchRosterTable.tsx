'use client'

import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { exportBatchRosterToExcel, exportBatchRosterToPDF, exportBatchRosterMultiToExcel, exportBatchRosterMultiToPDF } from '@/lib/export'
import type { BatchRosterRecord, BatchRosterMultiRecord } from '@/types'

const SESSION_COLS: Array<{ key: keyof BatchRosterMultiRecord; label: string; isFN: boolean }> = [
  { key: 'fn1_present', label: 'FN1', isFN: true },
  { key: 'fn2_present', label: 'FN2', isFN: true },
  { key: 'an1_present', label: 'AN1', isFN: false },
  { key: 'an2_present', label: 'AN2', isFN: false },
]

interface Props {
  rows:      BatchRosterRecord[]
  multiRows: BatchRosterMultiRecord[]
  loading:   boolean
  date:      string
  session:   string
  showExport?: boolean
}

export default function BatchRosterTable({ rows, multiRows, loading, date, session, showExport = true }: Props) {
  const [exporting, setExporting] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const isMulti = session === 'All Sessions' || session === ''

  // Only show session columns that had at least one present student
  const activeCols = useMemo(
    () => SESSION_COLS.filter(({ key }) => multiRows.some((r) => r[key] === true)),
    [multiRows]
  )

  // Group single-session rows by batch
  const singleGroups = useMemo(() => {
    const map = new Map<string, { batch: string; rows: BatchRosterRecord[] }>()
    rows.forEach((r) => {
      if (!map.has(r.batch)) map.set(r.batch, { batch: r.batch, rows: [] })
      map.get(r.batch)!.rows.push(r)
    })
    return [...map.values()].sort((a, b) => a.batch.localeCompare(b.batch))
  }, [rows])

  // Group multi-session rows by batch
  const multiGroups = useMemo(() => {
    const map = new Map<string, { batch: string; rows: BatchRosterMultiRecord[] }>()
    multiRows.forEach((r) => {
      if (!map.has(r.batch)) map.set(r.batch, { batch: r.batch, rows: [] })
      map.get(r.batch)!.rows.push(r)
    })
    return [...map.values()].sort((a, b) => a.batch.localeCompare(b.batch))
  }, [multiRows])

  function toggleGroup(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  async function handleExcel() {
    setExporting(true)
    if (isMulti) await exportBatchRosterMultiToExcel(multiRows, date)
    else await exportBatchRosterToExcel(rows, date, session)
    setExporting(false)
  }

  async function handlePDF() {
    setExporting(true)
    if (isMulti) await exportBatchRosterMultiToPDF(multiRows, date)
    else await exportBatchRosterToPDF(rows, date, session)
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

  const isEmpty = isMulti ? multiRows.length === 0 : rows.length === 0
  if (isEmpty) {
    return (
      <div className="text-center py-12 space-y-2">
        <span className="text-3xl">📭</span>
        <p className="text-xs font-bold text-slate-400">No split batch roster records found for active selections</p>
      </div>
    )
  }

  // ── Summary badge counts ──────────────────────────────────────────────────
  let summaryEl: React.ReactNode

  if (isMulti) {
    summaryEl = (
      <div className="flex flex-wrap gap-3">
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-600">
          Total Students: <span className="text-slate-800">{multiRows.length}</span>
        </span>
        {activeCols.map(({ key, label, isFN }) => {
          const count = multiRows.filter((r) => r[key]).length
          return (
            <span
              key={label}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border',
                isFN
                  ? 'bg-blue-50 border-blue-200 text-blue-700'
                  : 'bg-amber-50 border-amber-200 text-amber-700'
              )}
            >
              {label}: <span className="font-extrabold">{count}</span> present
            </span>
          )
        })}
      </div>
    )
  } else {
    const totalPresent = rows.filter((r) => r.present).length
    const totalAbsent  = rows.length - totalPresent
    const pct          = rows.length > 0 ? Math.round((totalPresent / rows.length) * 100) : 0
    summaryEl = (
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
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary + export row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-5">
        {summaryEl}
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

      {/* Batch group accordions */}
      <div className="space-y-4">
        {isMulti
          ? multiGroups.map((g) => <MultiGroup key={g.batch} g={g} activeCols={activeCols} collapsed={collapsed} toggle={toggleGroup} />)
          : singleGroups.map((g) => <SingleGroup key={g.batch} g={g} collapsed={collapsed} toggle={toggleGroup} />)
        }
      </div>
    </div>
  )
}

// ── Single-session group ────────────────────────────────────────────────────
function SingleGroup({
  g, collapsed, toggle
}: {
  g: { batch: string; rows: BatchRosterRecord[] }
  collapsed: Set<string>
  toggle: (k: string) => void
}) {
  const isOpen   = !collapsed.has(g.batch)
  const present  = g.rows.filter((r) => r.present).length
  const absent   = g.rows.length - present
  const pct      = Math.round((present / g.rows.length) * 100)

  return (
    <div className="border border-slate-100 rounded-2xl overflow-hidden bg-white/50 backdrop-blur-md">
      <button
        onClick={() => toggle(g.batch)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50/50 hover:bg-slate-100/50 border-b border-slate-100 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-slate-400 text-xs">{isOpen ? '▼' : '▶'}</span>
          <span className="px-3 py-1 rounded-xl bg-slate-900 text-white text-[11px] font-extrabold uppercase">Batch {g.batch}</span>
        </div>
        <div className="flex items-center gap-3 text-xs font-semibold">
          <span className="text-emerald-600">✅ {present}</span>
          <span className="text-slate-300">|</span>
          <span className="text-red-500">❌ {absent}</span>
          <span className="text-slate-300">|</span>
          <span className={cn(
            'badge border font-bold text-[10px]',
            pct >= 75 ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
            : pct >= 50 ? 'bg-amber-50 border-amber-200 text-amber-700'
            : 'bg-red-50 border-red-200 text-red-600'
          )}>{pct}%</span>
        </div>
      </button>

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
                <tr key={r.student_id} className={cn('transition-colors', r.present ? 'hover:bg-emerald-50/20' : 'hover:bg-red-50/20')}>
                  <td className="px-4 py-2.5 font-mono font-bold text-slate-400">{r.student_id}</td>
                  <td className="px-4 py-2.5 font-bold text-slate-800 text-sm">{r.name}</td>
                  <td className="px-4 py-2.5 text-center font-bold text-slate-600">{r.year}</td>
                  <td className="px-4 py-2.5 text-center">
                    {r.present
                      ? <span className="badge bg-emerald-50 border border-emerald-200 text-emerald-700 font-extrabold text-[10px]">Present</span>
                      : <span className="badge bg-red-50 border border-red-200 text-red-600 font-extrabold text-[10px]">Absent</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Multi-session group ─────────────────────────────────────────────────────
function MultiGroup({
  g, activeCols, collapsed, toggle
}: {
  g: { batch: string; rows: BatchRosterMultiRecord[] }
  activeCols: typeof SESSION_COLS
  collapsed: Set<string>
  toggle: (k: string) => void
}) {
  const isOpen = !collapsed.has(g.batch)

  const sessionStats = activeCols.map(({ key, label, isFN }) => ({
    label,
    isFN,
    present: g.rows.filter((r) => r[key]).length,
    total: g.rows.length,
  }))

  return (
    <div className="border border-slate-100 rounded-2xl overflow-hidden bg-white/50 backdrop-blur-md">
      <button
        onClick={() => toggle(g.batch)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50/50 hover:bg-slate-100/50 border-b border-slate-100 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-slate-400 text-xs">{isOpen ? '▼' : '▶'}</span>
          <span className="px-3 py-1 rounded-xl bg-slate-900 text-white text-[11px] font-extrabold uppercase">Batch {g.batch}</span>
          <span className="text-slate-400 text-[10px] font-semibold">{g.rows.length} students</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {sessionStats.map(({ label, isFN, present, total }) => {
            const pct = Math.round((present / total) * 100)
            return (
              <span
                key={label}
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold border',
                  isFN ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-amber-50 border-amber-200 text-amber-700'
                )}
              >
                {label}: {present}/{total} <span className="opacity-70">({pct}%)</span>
              </span>
            )
          })}
        </div>
      </button>

      {isOpen && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-white/30">
                <th className="px-4 py-3 text-left font-extrabold text-slate-500 uppercase tracking-widest">Student ID</th>
                <th className="px-4 py-3 text-left font-extrabold text-slate-500 uppercase tracking-widest">Full Name</th>
                <th className="px-4 py-3 text-center font-extrabold text-slate-500 uppercase tracking-widest">Year</th>
                {activeCols.map(({ label, isFN }) => (
                  <th
                    key={label}
                    className={cn(
                      'px-4 py-3 text-center font-extrabold uppercase tracking-widest',
                      isFN ? 'text-blue-600' : 'text-amber-600'
                    )}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white/20">
              {g.rows.map((r) => (
                <tr key={r.student_id} className="hover:bg-slate-50/30 transition-colors">
                  <td className="px-4 py-2.5 font-mono font-bold text-slate-400">{r.student_id}</td>
                  <td className="px-4 py-2.5 font-bold text-slate-800 text-sm">{r.name}</td>
                  <td className="px-4 py-2.5 text-center font-bold text-slate-600">{r.year}</td>
                  {activeCols.map(({ key, label }) => (
                    <td key={label} className="px-4 py-2.5 text-center">
                      {r[key]
                        ? <span className="badge bg-emerald-50 border border-emerald-200 text-emerald-700 font-extrabold text-[10px]">Present</span>
                        : <span className="badge bg-red-50 border border-red-200 text-red-600 font-extrabold text-[10px]">Absent</span>
                      }
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
