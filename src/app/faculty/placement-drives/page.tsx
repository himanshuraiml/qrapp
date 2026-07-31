'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { PlacementDrive, PlacementDriveStudent } from '@/types'

export default function FacultyPlacementDrivesPage() {
  const [drives, setDrives] = useState<PlacementDrive[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedDrive, setSelectedDrive] = useState<(PlacementDrive & { roster?: PlacementDriveStudent[] }) | null>(null)
  const [loadingRoster, setLoadingRoster] = useState(false)
  const [rosterSearch, setRosterSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'All' | 'Present' | 'Absent'>('All')
  const [dateFilter, setDateFilter] = useState<string>('All')

  useEffect(() => {
    fetchDrives()
  }, [])

  async function fetchDrives() {
    try {
      setLoading(true)
      const res = await fetch('/api/admin/placement-drives')
      const json = await res.json()
      if (json.success) {
        setDrives(json.data || [])
      } else {
        setError(json.error || 'Failed to load placement drives')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function openRosterModal(drive: PlacementDrive) {
    setSelectedDrive(drive)
    setDateFilter('All')
    try {
      setLoadingRoster(true)
      const res = await fetch(`/api/admin/placement-drives/${drive.id}`)
      const json = await res.json()
      if (json.success) {
        setSelectedDrive(json.data)
      } else {
        alert(json.error || 'Failed to load drive details')
      }
    } catch (err: any) {
      alert(err.message)
    } finally {
      setLoadingRoster(false)
    }
  }

  async function handleToggleAttendance(studentId: string, currentStatus: string) {
    if (!selectedDrive) return
    const nextStatus = currentStatus === 'Present' ? 'Eligible' : 'Present'

    try {
      const res = await fetch(`/api/admin/placement-drives/${selectedDrive.id}/attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: studentId, status: nextStatus }),
      })
      const json = await res.json()

      if (json.success) {
        setSelectedDrive((prev) => {
          if (!prev || !prev.roster) return prev
          const updatedRoster = prev.roster.map((item) =>
            item.student_id.toUpperCase() === studentId.toUpperCase()
              ? { ...item, status: nextStatus as any, marked_at: nextStatus === 'Present' ? new Date().toISOString() : null }
              : item
          )
          const newPresentCount = updatedRoster.filter((r) => r.status === 'Present').length
          return { ...prev, total_present: newPresentCount, roster: updatedRoster }
        })
        fetchDrives()
      } else {
        alert(json.error || 'Failed to update attendance')
      }
    } catch (err: any) {
      alert(err.message)
    }
  }

  // Unique assessment dates
  const uniqueDates = (selectedDrive?.roster || []).reduce<string[]>((acc, r) => {
    if (r.assessment_date && !acc.includes(r.assessment_date)) acc.push(r.assessment_date)
    return acc
  }, []).sort()

  const dateFilteredRoster = (selectedDrive?.roster || []).filter((r) => {
    if (!dateFilter || dateFilter === 'All') return true
    const itemDate = r.assessment_date || selectedDrive?.drive_date
    return itemDate === dateFilter
  })

  const filteredRoster = dateFilteredRoster.filter((item) => {
    const matchesStatus =
      statusFilter === 'All'
        ? true
        : statusFilter === 'Present'
        ? item.status === 'Present'
        : item.status === 'Absent' || item.status === 'Eligible'

    const q = rosterSearch.toLowerCase().trim()
    const matchesSearch =
      !q ||
      item.student_id.toLowerCase().includes(q) ||
      (item.name && item.name.toLowerCase().includes(q)) ||
      (item.department && item.department.toLowerCase().includes(q))

    return matchesStatus && matchesSearch
  })

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          🚀 Placement Drives
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          View drive schedules, student contact details, and mark attendance.
        </p>
      </div>

      {loading ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
          <div className="inline-block animate-spin w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full mb-3"></div>
          <p className="text-sm text-slate-500 font-medium">Loading placement drives...</p>
        </div>
      ) : error ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-rose-200 text-rose-600 text-sm font-semibold">
          {error}
        </div>
      ) : drives.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 space-y-2">
          <div className="text-4xl">🏢</div>
          <h3 className="text-base font-bold text-slate-800">No Placement Drives Yet</h3>
          <p className="text-xs text-slate-500">Drives created by Admin will appear here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {drives.map((drive) => {
            const pct =
              drive.total_eligible && drive.total_eligible > 0
                ? Math.round(((drive.total_present || 0) / drive.total_eligible) * 100)
                : 0
            return (
              <div key={drive.id} className="bg-white rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all p-5 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-xs font-extrabold uppercase tracking-wider text-brand-600 bg-brand-50 px-2.5 py-1 rounded-md">
                        {drive.company_name}
                      </span>
                      <h3 className="text-lg font-bold text-slate-900 mt-2">{drive.title}</h3>
                    </div>
                    <span
                      className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
                        drive.status === 'Active'
                          ? 'bg-emerald-100 text-emerald-700'
                          : drive.status === 'Upcoming'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {drive.status}
                    </span>
                  </div>
                  <div className="text-xs text-slate-600 space-y-1">
                    <p><span className="font-semibold text-slate-400">📅 Date:</span> {drive.drive_date}</p>
                    <p><span className="font-semibold text-slate-400">📍 Venue:</span> {drive.venue}</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 space-y-2">
                    <div className="flex justify-between text-xs font-bold text-slate-700">
                      <span>Attendance Progress</span>
                      <span>{drive.total_present || 0} / {drive.total_eligible || 0} ({pct}%)</span>
                    </div>
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div className="bg-brand-600 h-full transition-all duration-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
                <div className="pt-4 mt-4 border-t border-slate-100 flex items-center gap-2">
                  <button
                    onClick={() => openRosterModal(drive)}
                    className="flex-1 py-2 px-3 rounded-xl bg-brand-50 hover:bg-brand-100 text-brand-700 font-bold text-xs text-center transition-all"
                  >
                    📋 View Roster
                  </button>
                  <Link
                    href={`/faculty/scan?drive_id=${drive.id}`}
                    className="py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs text-center transition-all flex items-center gap-1"
                  >
                    📷 Scan QR
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ROSTER MODAL */}
      {selectedDrive && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-5xl w-full p-6 shadow-2xl border border-slate-100 space-y-5 max-h-[90vh] flex flex-col">
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-brand-600 bg-brand-50 px-2.5 py-1 rounded-md">
                  {selectedDrive.company_name}
                </span>
                <h2 className="text-xl font-bold text-slate-900 mt-1">{selectedDrive.title}</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Date: {selectedDrive.drive_date} | Venue: {selectedDrive.venue}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/faculty/scan?drive_id=${selectedDrive.id}`}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 transition-all flex items-center gap-1"
                >
                  📷 Scan QR
                </Link>
                <button onClick={() => setSelectedDrive(null)} className="text-slate-400 hover:text-slate-600 font-bold text-lg ml-2">✕</button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
              <input
                type="text"
                placeholder="Search student ID, name, dept..."
                value={rosterSearch}
                onChange={(e) => setRosterSearch(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:ring-2 focus:ring-brand-500 outline-none"
              />
              {uniqueDates.length > 0 && (
                <select
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-brand-300 bg-brand-50/50 text-slate-800 text-xs font-bold focus:ring-2 focus:ring-brand-500 outline-none"
                >
                  <option value="All">📅 All Dates ({uniqueDates.length} Days)</option>
                  {uniqueDates.map((dt) => (
                    <option key={dt} value={dt}>
                      📅 {dt}
                    </option>
                  ))}
                </select>
              )}
              <select
                value={statusFilter}
                onChange={(e: any) => setStatusFilter(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-brand-500 outline-none"
              >
                <option value="All">All Students ({dateFilteredRoster.length})</option>
                <option value="Present">Present Only</option>
                <option value="Absent">Absent / Pending</option>
              </select>
            </div>

            <div className="flex-1 overflow-auto border border-slate-200 rounded-xl">
              {loadingRoster ? (
                <div className="text-center py-10 text-xs text-slate-500 font-medium">Loading roster...</div>
              ) : filteredRoster.length === 0 ? (
                <div className="text-center py-10 text-xs text-slate-500">No students found matching current filters.</div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 sticky top-0 font-bold text-slate-700 border-b border-slate-200">
                    <tr>
                      <th className="p-3">#</th>
                      <th className="p-3">Student ID</th>
                      <th className="p-3">Name</th>
                      <th className="p-3">Dept</th>
                      <th className="p-3">Mobile</th>
                      <th className="p-3">Assessment Date</th>
                      <th className="p-3">Slot</th>
                      <th className="p-3">Venue</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {filteredRoster.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-slate-50 transition-colors">
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
                        <td className="p-3 text-right">
                          <button
                            onClick={() => handleToggleAttendance(item.student_id, item.status)}
                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                              item.status === 'Present'
                                ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                            }`}
                          >
                            {item.status === 'Present' ? 'Mark Absent' : 'Mark Present'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-bold text-slate-600 pt-2 border-t border-slate-100">
              <span>
                Showing {filteredRoster.length} of {dateFilteredRoster.length} students {dateFilter !== 'All' ? `(Date: ${dateFilter})` : ''}
              </span>
              <div className="flex items-center gap-3">
                <span className="text-emerald-600">
                  Present: {dateFilteredRoster.filter((r) => r.status === 'Present').length} / {dateFilteredRoster.length}
                </span>
                <span className="text-rose-600">
                  Absent: {dateFilteredRoster.filter((r) => r.status !== 'Present').length}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
