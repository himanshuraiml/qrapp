'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { PlacementDrive, PlacementDriveStudent } from '@/types'
import ModuleGuard from '@/components/shell/ModuleGuard'

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
    <ModuleGuard module="placements">
    <div className="relative space-y-8 animate-fade-in pb-16 max-w-4xl mx-auto px-4 md:px-0">
      {/* Soft Ambient Background Spheres */}
      <div className="absolute inset-0 z-[-1] pointer-events-none opacity-60 overflow-hidden">
        <div className="absolute top-[-5%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-indigo-200/40 blur-[120px] mix-blend-multiply animate-pulse" style={{ animationDuration: '8s' }}></div>
        <div className="absolute bottom-[-5%] right-[-10%] w-[45vw] h-[45vw] rounded-full bg-purple-200/40 blur-[120px] mix-blend-multiply animate-pulse" style={{ animationDuration: '10s' }}></div>
      </div>

      {/* Flagship Claymorphic Placement Header */}
      <div className="clay-card p-6 sm:p-8 rounded-[2.25rem] space-y-2">
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-xs font-black uppercase tracking-wider text-brand-700 bg-brand-50 border border-brand-200 clay-badge">
          <span>💼</span> Placement Portal
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight font-heading">
          🚀 Placement Drives Management
        </h1>
        <p className="text-xs text-slate-500 font-medium max-w-xl">
          View drive schedules, verify student rosters, and mark live placement attendance.
        </p>
      </div>

      {loading ? (
        <div className="clay-card p-12 text-center rounded-[2.25rem] space-y-3">
          <span className="w-8 h-8 border-3 border-brand-600 border-t-transparent rounded-full animate-spin inline-block"></span>
          <p className="text-xs text-slate-400 font-extrabold">Loading placement drives...</p>
        </div>
      ) : error ? (
        <div className="clay-card p-8 text-center rounded-[2.25rem] text-rose-700 text-xs font-black bg-rose-50 border-rose-200">
          {error}
        </div>
      ) : drives.length === 0 ? (
        <div className="clay-card p-12 text-center rounded-[2.25rem] space-y-3">
          <div className="text-4xl">🏢</div>
          <h3 className="text-base font-black text-slate-800 font-heading">No Placement Drives Yet</h3>
          <p className="text-xs text-slate-400 font-semibold">Drives assigned by Placement Coordinators will appear here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {drives.map((drive) => {
            const pct =
              drive.total_eligible && drive.total_eligible > 0
                ? Math.round(((drive.total_present || 0) / drive.total_eligible) * 100)
                : 0
            return (
              <div key={drive.id} className="clay-card p-6 rounded-[2.25rem] flex flex-col justify-between space-y-4 hover:-translate-y-1 transition-all">
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-xs font-black uppercase text-brand-700 bg-brand-100/90 px-3 py-1 rounded-full clay-badge">
                        {drive.company_name}
                      </span>
                      <h3 className="text-lg font-black text-slate-900 mt-2">{drive.title}</h3>
                    </div>
                    <span
                      className={`clay-badge text-[10px] font-black px-3 py-1 ${
                        drive.status === 'Active'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : drive.status === 'Upcoming'
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}
                    >
                      {drive.status}
                    </span>
                  </div>

                  <div className="text-xs text-slate-600 font-semibold space-y-1">
                    <p><span className="text-slate-400 font-bold">📅 Date:</span> {drive.drive_date}</p>
                    <p><span className="text-slate-400 font-bold">📍 Venue:</span> {drive.venue}</p>
                  </div>

                  {/* Tactile Progress Indicator */}
                  <div className="clay-badge p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-2">
                    <div className="flex justify-between text-xs font-black text-slate-700">
                      <span>Attendance Progress</span>
                      <span>{drive.total_present || 0} / {drive.total_eligible || 0} ({pct}%)</span>
                    </div>
                    <div className="w-full bg-slate-200/80 h-2.5 rounded-full overflow-hidden shadow-[inset_1px_1px_3px_rgba(0,0,0,0.12)]">
                      <div className="bg-brand-600 h-full transition-all duration-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center gap-3">
                  <button
                    onClick={() => openRosterModal(drive)}
                    className="clay-button-secondary flex-1 py-2.5 px-4 text-brand-700 font-extrabold text-xs text-center min-h-[44px]"
                  >
                    📋 Roster
                  </button>
                  <Link
                    href={`/faculty/scan?drive_id=${drive.id}`}
                    className="clay-button py-2.5 px-4 text-white font-extrabold text-xs text-center inline-flex items-center gap-1.5 min-h-[44px]"
                  >
                    📷 Scan QR
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Tactile Clay Roster Modal */}
      {selectedDrive && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 md:p-6 animate-fade-in">
          <div className="clay-card bg-white rounded-[2.5rem] border border-white max-w-5xl w-full p-6 sm:p-8 shadow-2xl space-y-5 max-h-[88vh] flex flex-col animate-scale-in">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div>
                <span className="clay-badge text-xs font-black uppercase tracking-wider text-brand-700 bg-brand-100 px-3 py-1">
                  {selectedDrive.company_name}
                </span>
                <h2 className="text-xl font-black text-slate-900 mt-2 font-heading">{selectedDrive.title}</h2>
                <p className="text-xs text-slate-500 font-semibold mt-0.5">
                  Date: {selectedDrive.drive_date} | Venue: {selectedDrive.venue}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Link
                  href={`/faculty/scan?drive_id=${selectedDrive.id}`}
                  className="clay-button px-4 py-2 text-white font-extrabold text-xs inline-flex items-center gap-1.5"
                >
                  📷 Scan QR
                </Link>
                <button
                  onClick={() => setSelectedDrive(null)}
                  className="clay-button-secondary w-10 h-10 rounded-full flex items-center justify-center text-slate-600 font-black text-sm"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50/70 p-4 rounded-2xl border border-slate-100">
              <input
                type="text"
                placeholder="Search student ID, name, dept..."
                value={rosterSearch}
                onChange={(e) => setRosterSearch(e.target.value)}
                className="clay-input px-3.5 py-2 text-xs font-bold text-slate-800"
              />
              {uniqueDates.length > 0 && (
                <select
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="clay-input px-3.5 py-2 text-xs font-extrabold text-slate-800"
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
                className="clay-input px-3.5 py-2 text-xs font-extrabold text-slate-800"
              >
                <option value="All">All Students ({dateFilteredRoster.length})</option>
                <option value="Present">Present Only</option>
                <option value="Absent">Absent / Pending</option>
              </select>
            </div>

            {/* Roster Table */}
            <div className="flex-1 overflow-auto rounded-[1.75rem] border border-slate-200/70 bg-slate-50/40 p-2">
              {loadingRoster ? (
                <div className="text-center py-12 text-xs text-slate-500 font-bold">Loading roster...</div>
              ) : filteredRoster.length === 0 ? (
                <div className="text-center py-12 text-xs text-slate-400 font-bold">No students found matching active filters.</div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100/80 sticky top-0 font-black text-slate-700 border-b border-slate-200">
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
                  <tbody className="divide-y divide-slate-100 bg-white rounded-xl">
                    {filteredRoster.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3 font-semibold text-slate-400">{idx + 1}</td>
                        <td className="p-3 font-mono font-bold text-slate-900">{item.student_id}</td>
                        <td className="p-3 font-bold text-slate-800">{item.name || 'N/A'}</td>
                        <td className="p-3 font-semibold text-slate-600">{item.department || 'N/A'}</td>
                        <td className="p-3 font-mono text-slate-600">{item.mobile || '—'}</td>
                        <td className="p-3 text-slate-600 font-medium">
                          {item.assessment_date || '—'}{item.test_time ? ` · ${item.test_time}` : ''}
                        </td>
                        <td className="p-3 text-slate-600 font-medium">{item.slot || '—'}</td>
                        <td className="p-3 text-slate-600 font-medium">{item.venue || '—'}</td>
                        <td className="p-3">
                          <span
                            className={`clay-badge px-3 py-1 text-[10px] font-black ${
                              item.status === 'Present'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : 'bg-rose-100 text-rose-800 border border-rose-200'
                            }`}
                          >
                            {item.status === 'Present' ? '✓ Present' : '✗ Absent'}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => handleToggleAttendance(item.student_id, item.status)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                              item.status === 'Present'
                                ? 'clay-button-secondary text-slate-700'
                                : 'clay-button text-white'
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

            {/* Modal Footer Summary */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-extrabold text-slate-600 pt-3 border-t border-slate-100">
              <span>
                Showing {filteredRoster.length} of {dateFilteredRoster.length} students {dateFilter !== 'All' ? `(Date: ${dateFilter})` : ''}
              </span>
              <div className="flex items-center gap-4">
                <span className="text-emerald-700">
                  Present: {dateFilteredRoster.filter((r) => r.status === 'Present').length} / {dateFilteredRoster.length}
                </span>
                <span className="text-rose-700">
                  Absent: {dateFilteredRoster.filter((r) => r.status !== 'Present').length}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    </ModuleGuard>
  )
}
