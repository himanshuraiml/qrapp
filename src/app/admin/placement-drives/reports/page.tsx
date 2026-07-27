'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { exportPlacementDriveToExcel, exportPlacementDriveToPDF } from '@/lib/export'
import type { PlacementDrive, PlacementDriveStudent } from '@/types'

function ReportContent() {
  const searchParams = useSearchParams()
  const initialDriveId = searchParams.get('drive_id')

  const [drives, setDrives] = useState<PlacementDrive[]>([])
  const [selectedDriveId, setSelectedDriveId] = useState<string>('')
  const [driveDetail, setDriveDetail] = useState<(PlacementDrive & { roster?: PlacementDriveStudent[] }) | null>(null)
  const [loadingDrives, setLoadingDrives] = useState(true)
  const [loadingRoster, setLoadingRoster] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'All' | 'Present' | 'Absent'>('All')

  useEffect(() => {
    async function loadDrives() {
      try {
        setLoadingDrives(true)
        const res = await fetch('/api/admin/placement-drives')
        const json = await res.json()
        if (json.success) {
          const list: PlacementDrive[] = json.data || []
          setDrives(list)
          if (initialDriveId && list.some((d) => d.id === initialDriveId)) {
            setSelectedDriveId(initialDriveId)
          } else if (list.length > 0) {
            setSelectedDriveId(list[0].id)
          }
        }
      } finally {
        setLoadingDrives(false)
      }
    }
    loadDrives()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!selectedDriveId) { setDriveDetail(null); return }
    async function loadRoster() {
      try {
        setLoadingRoster(true)
        const res = await fetch(`/api/admin/placement-drives/${selectedDriveId}`)
        const json = await res.json()
        if (json.success) setDriveDetail(json.data)
      } finally {
        setLoadingRoster(false)
      }
    }
    loadRoster()
  }, [selectedDriveId])

  const roster = driveDetail?.roster || []

  const summary = useMemo(() => {
    const total = roster.length
    const present = roster.filter((r) => r.status === 'Present').length
    const absent = total - present
    const pct = total > 0 ? Math.round((present / total) * 100) : 0
    return { total, present, absent, pct }
  }, [roster])

  const deptBreakdown = useMemo(() => {
    const map = new Map<string, { department: string; eligible: number; present: number }>()
    for (const r of roster) {
      const dept = r.department || 'N/A'
      const entry = map.get(dept) || { department: dept, eligible: 0, present: 0 }
      entry.eligible += 1
      if (r.status === 'Present') entry.present += 1
      map.set(dept, entry)
    }
    return Array.from(map.values())
      .map((e) => ({ ...e, absent: e.eligible - e.present, pct: e.eligible > 0 ? Math.round((e.present / e.eligible) * 100) : 0 }))
      .sort((a, b) => a.department.localeCompare(b.department))
  }, [roster])

  const filteredRoster = useMemo(() => {
    const q = search.toLowerCase().trim()
    return roster.filter((item) => {
      const matchesStatus =
        statusFilter === 'All'
          ? true
          : statusFilter === 'Present'
          ? item.status === 'Present'
          : item.status === 'Absent' || item.status === 'Eligible'
      const matchesSearch =
        !q ||
        item.student_id.toLowerCase().includes(q) ||
        (item.name && item.name.toLowerCase().includes(q)) ||
        (item.department && item.department.toLowerCase().includes(q))
      return matchesStatus && matchesSearch
    })
  }, [roster, search, statusFilter])

  async function handleExportExcel() {
    if (!driveDetail) return
    await exportPlacementDriveToExcel(driveDetail, roster)
  }

  async function handleExportPDF() {
    if (!driveDetail) return
    await exportPlacementDriveToPDF(driveDetail, roster)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            📊 Placement Drive Report
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Attendance breakdown for a specific placement drive.
          </p>
        </div>
        <Link
          href="/admin/placement-drives"
          className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs transition-all"
        >
          ← Back to Placements
        </Link>
      </div>

      {/* Drive selector */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row sm:items-center gap-3">
        <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Drive</label>
        <select
          value={selectedDriveId}
          onChange={(e) => setSelectedDriveId(e.target.value)}
          disabled={loadingDrives}
          className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold focus:ring-2 focus:ring-brand-500 outline-none"
        >
          {drives.length === 0 && <option value="">No drives available</option>}
          {drives.map((d) => (
            <option key={d.id} value={d.id}>
              {d.company_name} — {d.title} ({d.drive_date})
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportPDF}
            disabled={!driveDetail || roster.length === 0}
            className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs transition-all disabled:opacity-50"
          >
            📄 Export PDF
          </button>
          <button
            onClick={handleExportExcel}
            disabled={!driveDetail || roster.length === 0}
            className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs shadow-md transition-all disabled:opacity-50"
          >
            📊 Export Excel
          </button>
        </div>
      </div>

      {loadingRoster ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
          <div className="inline-block animate-spin w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full mb-3"></div>
          <p className="text-sm text-slate-500 font-medium">Loading report...</p>
        </div>
      ) : !driveDetail ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 text-sm text-slate-500 font-medium">
          Select a drive above to view its attendance report.
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm text-center">
              <p className="text-2xl font-extrabold text-slate-900">{summary.total}</p>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Total Eligible</p>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm text-center">
              <p className="text-2xl font-extrabold text-emerald-600">{summary.present}</p>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Present</p>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm text-center">
              <p className="text-2xl font-extrabold text-rose-600">{summary.absent}</p>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Absent</p>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm text-center">
              <p className="text-2xl font-extrabold text-brand-600">{summary.pct}%</p>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Attendance</p>
            </div>
          </div>

          {/* Department breakdown */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-800">Department Breakdown</h3>
            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="p-3 font-extrabold text-slate-500 uppercase tracking-widest">Department</th>
                    <th className="p-3 font-extrabold text-slate-500 uppercase tracking-widest text-center">Eligible</th>
                    <th className="p-3 font-extrabold text-emerald-600 uppercase tracking-widest text-center">Present</th>
                    <th className="p-3 font-extrabold text-rose-600 uppercase tracking-widest text-center">Absent</th>
                    <th className="p-3 font-extrabold text-slate-500 uppercase tracking-widest text-center">%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {deptBreakdown.map((d) => (
                    <tr key={d.department} className="hover:bg-slate-50/50">
                      <td className="p-3 font-bold text-slate-800">{d.department}</td>
                      <td className="p-3 text-center font-semibold text-slate-600">{d.eligible}</td>
                      <td className="p-3 text-center font-bold text-emerald-600">{d.present}</td>
                      <td className="p-3 text-center font-bold text-rose-600">{d.absent}</td>
                      <td className="p-3 text-center font-bold text-slate-700">{d.pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Full roster */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-slate-800">Student Roster</h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Search student ID, name, dept..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:ring-2 focus:ring-brand-500 outline-none"
                />
                <select
                  value={statusFilter}
                  onChange={(e: any) => setStatusFilter(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-brand-500 outline-none"
                >
                  <option value="All">All Students</option>
                  <option value="Present">Present Only</option>
                  <option value="Absent">Absent / Pending</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="p-3 font-extrabold text-slate-500 uppercase tracking-widest">#</th>
                    <th className="p-3 font-extrabold text-slate-500 uppercase tracking-widest">Student ID</th>
                    <th className="p-3 font-extrabold text-slate-500 uppercase tracking-widest">Name</th>
                    <th className="p-3 font-extrabold text-slate-500 uppercase tracking-widest">Dept</th>
                    <th className="p-3 font-extrabold text-slate-500 uppercase tracking-widest">Mobile</th>
                    <th className="p-3 font-extrabold text-slate-500 uppercase tracking-widest">Assessment Date</th>
                    <th className="p-3 font-extrabold text-slate-500 uppercase tracking-widest">Slot</th>
                    <th className="p-3 font-extrabold text-slate-500 uppercase tracking-widest">Venue</th>
                    <th className="p-3 font-extrabold text-slate-500 uppercase tracking-widest">Status</th>
                    <th className="p-3 font-extrabold text-slate-500 uppercase tracking-widest">Marked At</th>
                    <th className="p-3 font-extrabold text-slate-500 uppercase tracking-widest">Marked By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRoster.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="p-6 text-center text-slate-400 font-medium">No students found matching current filters.</td>
                    </tr>
                  ) : (
                    filteredRoster.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-slate-50/50">
                        <td className="p-3 text-slate-400">{idx + 1}</td>
                        <td className="p-3 font-mono font-bold text-slate-900">{item.student_id}</td>
                        <td className="p-3 font-semibold text-slate-800">{item.name || 'N/A'}</td>
                        <td className="p-3 text-slate-600">{item.department || 'N/A'}</td>
                        <td className="p-3 font-mono text-slate-600">{item.mobile || '—'}</td>
                        <td className="p-3 text-slate-600">
                          {item.assessment_date || '—'}{item.test_time ? ` · ${item.test_time}` : ''}
                        </td>
                        <td className="p-3 text-slate-600">{item.slot || '—'}</td>
                        <td className="p-3 text-slate-600">{item.venue || '—'}</td>
                        <td className="p-3">
                          <span
                            className={`px-2.5 py-1 rounded-full font-bold text-[11px] ${
                              item.status === 'Present' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {item.status === 'Present' ? '✓ Present' : '✗ Absent'}
                          </span>
                        </td>
                        <td className="p-3 text-slate-500">
                          {item.marked_at ? new Date(item.marked_at).toLocaleString('en-IN') : '—'}
                        </td>
                        <td className="p-3 text-slate-500">{item.marked_by_name || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default function PlacementDriveReportPage() {
  return (
    <Suspense fallback={<div className="text-center py-12 text-sm text-slate-500 font-medium">Loading report...</div>}>
      <ReportContent />
    </Suspense>
  )
}
