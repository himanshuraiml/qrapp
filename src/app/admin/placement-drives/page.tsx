'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  exportPlacementDriveToExcel,
  exportPlacementDriveToPDF,
  downloadPlacementStudentTemplate,
} from '@/lib/export'
import type { PlacementDrive, PlacementDriveStudent, PlacementDriveStudentRow } from '@/types'

export default function PlacementDrivesPage() {
  const [drives, setDrives] = useState<PlacementDrive[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [formData, setFormData] = useState({
    company_name: '',
    title: '',
    drive_date: new Date().toISOString().split('T')[0],
    venue: '',
    description: '',
  })
  const [rawStudentIdsText, setRawStudentIdsText] = useState('')
  const [parsedStudentRows, setParsedStudentRows] = useState<PlacementDriveStudentRow[]>([])
  const [uploadFileName, setUploadFileName] = useState('')

  // Roster modal state
  const [selectedDrive, setSelectedDrive] = useState<(PlacementDrive & { roster?: PlacementDriveStudent[] }) | null>(null)
  const [loadingRoster, setLoadingRoster] = useState(false)
  const [rosterSearch, setRosterSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'All' | 'Present' | 'Absent' | 'Eligible'>('All')
  const [manualAddId, setManualAddId] = useState('')
  const [addingManual, setAddingManual] = useState(false)

  // Fetch placement drives on load
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

  // Parse CSV/Excel file input — supports the full TPO format:
  // S.No | Reg No | Name | DEPT | Mobile | Assessment Date | Test Time | Slot | Venue
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadFileName(file.name)

    try {
      const XLSX = await import('xlsx')
      const arrayBuffer = await file.arrayBuffer()
      const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true })
      const firstSheet = wb.Sheets[wb.SheetNames[0]]
      const rows: any[] = XLSX.utils.sheet_to_json(firstSheet, { header: 1 })

      if (rows.length === 0) return

      const header = Array.isArray(rows[0]) ? rows[0] : []
      const findCol = (...keywords: string[]) =>
        header.findIndex((cell: any) => {
          const str = String(cell ?? '').toLowerCase().trim()
          return keywords.some((k) => str.includes(k))
        })

      const idIdx = findCol('reg', 'student id', 'roll')
      const mobileIdx = findCol('mobile', 'phone', 'contact')
      const dateIdx = findCol('assessment date', 'date')
      const timeIdx = findCol('test time', 'time')
      const slotIdx = findCol('slot')
      const venueIdx = findCol('venue')

      // Fall back to first column if no recognizable header (plain single-column ID list)
      const resolvedIdIdx = idIdx !== -1 ? idIdx : 0
      const hasHeader = idIdx !== -1 || mobileIdx !== -1 || dateIdx !== -1 || timeIdx !== -1 || slotIdx !== -1 || venueIdx !== -1
      const startRow = hasHeader ? 1 : 0

      const cellToText = (val: any): string | undefined => {
        if (val === undefined || val === null || val === '') return undefined
        if (val instanceof Date) return val.toISOString().split('T')[0]
        return String(val).trim().replace(/\s+/g, ' ')
      }

      // Excel time-only cells (e.g. "4:38 AM") get parsed by the xlsx library as a
      // Date anchored to 1899-12-30 (Excel's zero-date). Extract via UTC getters —
      // not local ones — since SheetJS constructs these with Date.UTC(...), and
      // reading local components would shift the hour by the browser's timezone offset.
      const cellToTimeText = (val: any): string | undefined => {
        if (val === undefined || val === null || val === '') return undefined
        if (val instanceof Date) {
          const h = val.getUTCHours()
          const m = val.getUTCMinutes()
          const period = h >= 12 ? 'PM' : 'AM'
          const h12 = h % 12 === 0 ? 12 : h % 12
          return `${h12}:${String(m).padStart(2, '0')} ${period}`
        }
        return String(val).trim().replace(/\s+/g, ' ')
      }

      const rowMap = new Map<string, PlacementDriveStudentRow>()
      for (let i = startRow; i < rows.length; i++) {
        const row = rows[i]
        if (!Array.isArray(row) || row[resolvedIdIdx] === undefined) continue
        const sid = String(row[resolvedIdIdx]).trim().toUpperCase()
        if (!sid) continue

        rowMap.set(sid, {
          student_id: sid,
          mobile: mobileIdx !== -1 ? cellToText(row[mobileIdx]) : undefined,
          assessment_date: dateIdx !== -1 ? cellToText(row[dateIdx]) : undefined,
          test_time: timeIdx !== -1 ? cellToTimeText(row[timeIdx]) : undefined,
          slot: slotIdx !== -1 ? cellToText(row[slotIdx]) : undefined,
          venue: venueIdx !== -1 ? cellToText(row[venueIdx]) : undefined,
        })
      }

      const uniqueRows = Array.from(rowMap.values())
      setParsedStudentRows(uniqueRows)
      setRawStudentIdsText(uniqueRows.map((r) => r.student_id).join('\n'))
    } catch (err: any) {
      alert('Error parsing Excel/CSV file: ' + err.message)
    }
  }

  // Parse text changes in textarea (plain paste — IDs only, no rich fields)
  function handleTextareaChange(val: string) {
    setRawStudentIdsText(val)
    const ids = val
      .split(/[\n,;\s]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
    const uniqueIds = Array.from(new Set(ids))
    setParsedStudentRows(uniqueIds.map((student_id) => ({ student_id })))
  }

  // Create drive submit
  async function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!formData.company_name || !formData.title || !formData.drive_date || !formData.venue) {
      alert('Please fill in all required fields.')
      return
    }

    try {
      setCreating(true)
      const res = await fetch('/api/admin/placement-drives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          students: parsedStudentRows,
        }),
      })

      const json = await res.json()
      if (json.success) {
        setShowCreateModal(false)
        setFormData({
          company_name: '',
          title: '',
          drive_date: new Date().toISOString().split('T')[0],
          venue: '',
          description: '',
        })
        setRawStudentIdsText('')
        setParsedStudentRows([])
        setUploadFileName('')
        fetchDrives()
        if (json.student_insert_error) {
          alert(
            `Drive was created, but adding students failed:\n${json.student_insert_error}\n\n` +
            `Open the drive's roster and use "+ Add Reg No" or re-upload to retry.`
          )
        }
      } else {
        alert(json.error || 'Failed to create placement drive')
      }
    } catch (err: any) {
      alert(err.message)
    } finally {
      setCreating(false)
    }
  }

  // View Drive Roster
  async function openRosterModal(drive: PlacementDrive) {
    setSelectedDrive(drive)
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

  // Toggle student attendance status on roster
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
        // Update local roster state
        setSelectedDrive((prev) => {
          if (!prev || !prev.roster) return prev
          const updatedRoster = prev.roster.map((item) =>
            item.student_id.toUpperCase() === studentId.toUpperCase()
              ? {
                  ...item,
                  status: nextStatus as any,
                  marked_at: nextStatus === 'Present' ? new Date().toISOString() : null,
                }
              : item
          )
          const newPresentCount = updatedRoster.filter((r) => r.status === 'Present').length
          return {
            ...prev,
            total_present: newPresentCount,
            roster: updatedRoster,
          }
        })
        fetchDrives()
      } else {
        alert(json.error || 'Failed to update attendance')
      }
    } catch (err: any) {
      alert(err.message)
    }
  }

  // Add manual student to existing drive
  async function handleAddManualStudent(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedDrive || !manualAddId.trim()) return

    const sid = manualAddId.trim().toUpperCase()
    try {
      setAddingManual(true)
      const res = await fetch(`/api/admin/placement-drives/${selectedDrive.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ students: [{ student_id: sid }] }),
      })
      const json = await res.json()
      if (json.success) {
        setManualAddId('')
        openRosterModal(selectedDrive)
        fetchDrives()
      } else {
        alert(json.error || 'Failed to add student')
      }
    } catch (err: any) {
      alert(err.message)
    } finally {
      setAddingManual(false)
    }
  }

  // Delete Drive
  async function handleDeleteDrive(driveId: string, companyName: string) {
    if (!confirm(`Are you sure you want to delete the drive for "${companyName}"? This action cannot be undone.`)) {
      return
    }

    try {
      const res = await fetch(`/api/admin/placement-drives/${driveId}`, {
        method: 'DELETE',
      })
      const json = await res.json()
      if (json.success) {
        if (selectedDrive?.id === driveId) setSelectedDrive(null)
        fetchDrives()
      } else {
        alert(json.error || 'Failed to delete drive')
      }
    } catch (err: any) {
      alert(err.message)
    }
  }

  // Filtered Roster
  const filteredRoster = (selectedDrive?.roster || []).filter((item) => {
    const matchesStatus =
      statusFilter === 'All'
        ? true
        : statusFilter === 'Present'
        ? item.status === 'Present'
        : statusFilter === 'Absent'
        ? item.status === 'Absent' || item.status === 'Eligible'
        : item.status === statusFilter

    const q = rosterSearch.toLowerCase().trim()
    const matchesSearch =
      !q ||
      item.student_id.toLowerCase().includes(q) ||
      (item.name && item.name.toLowerCase().includes(q)) ||
      (item.department && item.department.toLowerCase().includes(q)) ||
      (item.section && item.section.toLowerCase().includes(q))

    return matchesStatus && matchesSearch
  })

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            🚀 Placement Drive Attendance
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage placement drives, upload eligible student rosters, scan QR codes, and track attendance.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => downloadPlacementStudentTemplate()}
            className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold text-xs transition-all flex items-center gap-1.5"
          >
            📥 Download Excel Template
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs shadow-md shadow-brand-600/20 transition-all flex items-center gap-1.5"
          >
            ➕ Create Placement Drive
          </button>
        </div>
      </div>

      {/* Drives Grid */}
      {loading ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
          <div className="inline-block animate-spin w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full mb-3"></div>
          <p className="text-sm text-slate-500 font-medium">Loading placement drives...</p>
        </div>
      ) : drives.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 space-y-3">
          <div className="text-4xl">🏢</div>
          <h3 className="text-base font-bold text-slate-800">No Placement Drives Created Yet</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Click "Create Placement Drive" above to create a new drive, upload eligible students, and start marking attendance.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 rounded-xl bg-brand-600 text-white font-bold text-xs hover:bg-brand-700 transition-all"
          >
            Create First Drive
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {drives.map((drive) => {
            const pct =
              drive.total_eligible && drive.total_eligible > 0
                ? Math.round(((drive.total_present || 0) / drive.total_eligible) * 100)
                : 0

            return (
              <div
                key={drive.id}
                className="bg-white rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all p-5 flex flex-col justify-between"
              >
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
                    <p className="flex items-center gap-1.5">
                      <span className="font-semibold text-slate-400">📅 Date:</span> {drive.drive_date}
                    </p>
                    <p className="flex items-center gap-1.5">
                      <span className="font-semibold text-slate-400">📍 Venue:</span> {drive.venue}
                    </p>
                    {drive.description && (
                      <p className="text-slate-500 line-clamp-2 mt-1 italic">{drive.description}</p>
                    )}
                  </div>

                  {/* Attendance Stats Progress */}
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 space-y-2">
                    <div className="flex justify-between text-xs font-bold text-slate-700">
                      <span>Attendance Progress</span>
                      <span>
                        {drive.total_present || 0} / {drive.total_eligible || 0} ({pct}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-brand-600 h-full transition-all duration-500 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Footer Buttons */}
                <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                  <button
                    onClick={() => openRosterModal(drive)}
                    className="flex-1 py-2 px-3 rounded-xl bg-brand-50 hover:bg-brand-100 text-brand-700 font-bold text-xs text-center transition-all"
                  >
                    📋 View Roster
                  </button>

                  <Link
                    href={`/admin/placement-drives/reports?drive_id=${drive.id}`}
                    className="py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs text-center transition-all flex items-center gap-1"
                  >
                    📊 Report
                  </Link>

                  <Link
                    href={`/faculty/scan?drive_id=${drive.id}`}
                    className="py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs text-center transition-all flex items-center gap-1"
                  >
                    📷 Scan QR
                  </Link>

                  <button
                    onClick={() => handleDeleteDrive(drive.id, drive.company_name)}
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                    title="Delete Drive"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* CREATE DRIVE MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-100 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-lg font-bold text-slate-900">Create Placement Drive</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Company Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. TCS, Wipro, ZoHo"
                    value={formData.company_name}
                    onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Job Title / Drive Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Campus Recruitment 2026"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Drive Date *</label>
                  <input
                    type="date"
                    required
                    value={formData.drive_date}
                    onChange={(e) => setFormData({ ...formData, drive_date: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Venue / Location *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Auditorium / Lab 3"
                    value={formData.venue}
                    onChange={(e) => setFormData({ ...formData, venue: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Description (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="Additional instructions or eligibility notes..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 outline-none resize-none"
                />
              </div>

              {/* Upload Eligible Students Section */}
              <div className="border border-brand-100 bg-brand-50/50 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-extrabold text-brand-900 uppercase tracking-wider">
                    📁 Upload Eligible Students List
                  </h3>
                  <button
                    type="button"
                    onClick={() => downloadPlacementStudentTemplate()}
                    className="text-[11px] font-bold text-brand-600 underline hover:text-brand-800"
                  >
                    Template Excel
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Select Excel / CSV file:
                  </label>
                  <input
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    onChange={handleFileUpload}
                    className="block w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-brand-600 file:text-white hover:file:bg-brand-700 cursor-pointer"
                  />
                  {uploadFileName && (
                    <p className="text-xs text-emerald-600 font-semibold mt-1">✓ Loaded: {uploadFileName}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Or paste Student IDs / Register Numbers (one per line or comma-separated):
                  </label>
                  <textarea
                    rows={4}
                    placeholder="RA2311003010001&#10;RA2311003010002&#10;RA2311003010003"
                    value={rawStudentIdsText}
                    onChange={(e) => handleTextareaChange(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-brand-500 outline-none"
                  />
                  <div className="flex justify-between text-xs font-bold text-brand-700 mt-1">
                    <span>Eligible Students Parsed:</span>
                    <span className="bg-brand-200 text-brand-900 px-2 py-0.5 rounded-full">
                      {parsedStudentRows.length} Students
                    </span>
                  </div>
                  {parsedStudentRows.some((r) => r.mobile || r.venue || r.slot || r.assessment_date) && (
                    <p className="text-[11px] text-emerald-700 font-semibold mt-1">
                      ✓ Detected Mobile / Assessment Date / Test Time / Slot / Venue columns
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs shadow-md transition-all disabled:opacity-50"
                >
                  {creating ? 'Creating Drive...' : 'Save & Create Drive'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ROSTER / MARK ATTENDANCE MODAL */}
      {selectedDrive && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl border border-slate-100 space-y-5 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
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
                <button
                  onClick={() => exportPlacementDriveToExcel(selectedDrive, selectedDrive.roster || [])}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs transition-all"
                >
                  📊 Excel
                </button>
                <button
                  onClick={() => exportPlacementDriveToPDF(selectedDrive, selectedDrive.roster || [])}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs transition-all"
                >
                  📄 PDF
                </button>
                <Link
                  href={`/faculty/scan?drive_id=${selectedDrive.id}`}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 transition-all flex items-center gap-1"
                >
                  📷 Scan QR
                </Link>
                <button
                  onClick={() => setSelectedDrive(null)}
                  className="text-slate-400 hover:text-slate-600 font-bold text-lg ml-2"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Filter Bar & Manual Add */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
              <input
                type="text"
                placeholder="Search student ID, name, dept..."
                value={rosterSearch}
                onChange={(e) => setRosterSearch(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:ring-2 focus:ring-brand-500 outline-none"
              />

              <select
                value={statusFilter}
                onChange={(e: any) => setStatusFilter(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-brand-500 outline-none"
              >
                <option value="All">All Students ({selectedDrive.roster?.length || 0})</option>
                <option value="Present">Present Only</option>
                <option value="Absent">Absent / Pending</option>
              </select>

              <form onSubmit={handleAddManualStudent} className="flex gap-1.5">
                <input
                  type="text"
                  placeholder="+ Add Reg No"
                  value={manualAddId}
                  onChange={(e) => setManualAddId(e.target.value)}
                  className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs uppercase focus:ring-2 focus:ring-brand-500 outline-none"
                />
                <button
                  type="submit"
                  disabled={addingManual}
                  className="px-3 py-1.5 bg-brand-600 text-white font-bold text-xs rounded-lg hover:bg-brand-700 transition-all"
                >
                  Add
                </button>
              </form>
            </div>

            {/* Roster Table */}
            <div className="flex-1 overflow-auto border border-slate-200 rounded-xl">
              {loadingRoster ? (
                <div className="text-center py-10 text-xs text-slate-500 font-medium">
                  Loading roster...
                </div>
              ) : filteredRoster.length === 0 ? (
                <div className="text-center py-10 text-xs text-slate-500">
                  No students found matching current filters.
                </div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 sticky top-0 font-bold text-slate-700 border-b border-slate-200">
                    <tr>
                      <th className="p-3">#</th>
                      <th className="p-3">Student ID</th>
                      <th className="p-3">Name</th>
                      <th className="p-3">Dept</th>
                      <th className="p-3">Yr / Sec</th>
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
                        <td className="p-3 text-slate-600">
                          {item.year ? `${item.year} Yr` : ''} {item.section || ''}
                        </td>
                        <td className="p-3 font-mono text-slate-600">{item.mobile || '—'}</td>
                        <td className="p-3 text-slate-600">
                          {item.assessment_date || '—'}{item.test_time ? ` · ${item.test_time}` : ''}
                        </td>
                        <td className="p-3 text-slate-600">{item.slot || '—'}</td>
                        <td className="p-3 text-slate-600">{item.venue || '—'}</td>
                        <td className="p-3">
                          <span
                            className={`px-2.5 py-1 rounded-full font-bold text-[11px] ${
                              item.status === 'Present'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800'
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

            {/* Footer Summary */}
            <div className="flex justify-between items-center text-xs font-bold text-slate-600 pt-2 border-t border-slate-100">
              <span>Showing {filteredRoster.length} of {selectedDrive.roster?.length || 0} students</span>
              <span className="text-brand-700">
                Total Present: {selectedDrive.total_present || 0} / {selectedDrive.total_eligible || 0}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
