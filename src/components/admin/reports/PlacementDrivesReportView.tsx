'use client'

import React, { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDate, formatTime } from '@/lib/utils'
import {
  exportPlacementDriveToExcel,
  exportPlacementDriveToPDF,
  exportPlacementOverviewToExcel,
  exportPlacementOverviewToPDF,
} from '@/lib/export'
import type { PlacementDrive } from '@/types'

interface DriveSummaryItem {
  id: string
  company_name: string
  title: string
  drive_date: string
  venue: string
  status: string
  eligible_count: number
  present_count: number
  absent_count: number
  turnout_pct: number
}

interface DriveStudentRosterRecord {
  id: string
  drive_id: string
  company_name: string
  drive_title: string
  drive_date: string
  venue: string
  student_id: string
  name: string
  department: string
  year: number
  section: string
  batch: string
  mobile: string | null
  assessment_date: string | null
  test_time: string | null
  slot: string | null
  status: 'Eligible' | 'Present' | 'Absent'
  marked_at: string | null
  marked_by_name: string | null
}

type DriveTab = 'overview' | 'roster'

export default function PlacementDrivesReportView() {
  const supabase = createClient()

  const [tab, setTab] = useState<DriveTab>('overview')
  const [drivesList, setDrivesList] = useState<PlacementDrive[]>([])
  const [selectedDriveId, setSelectedDriveId] = useState<string>('all')

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [statusFilter, setStatusFilter] = useState<'All' | 'Present' | 'Absent' | 'Eligible'>('All')
  const [department, setDepartment] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  const [deptsList, setDeptsList] = useState<string[]>([])
  const [drivesSummary, setDrivesSummary] = useState<DriveSummaryItem[]>([])
  const [rosterRecords, setRosterRecords] = useState<DriveStudentRosterRecord[]>([])

  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Load distinct departments and drives list
  useEffect(() => {
    async function loadInitialData() {
      const [{ data: filtersData }, { data: drivesData }] = await Promise.all([
        supabase.rpc('get_distinct_filters'),
        supabase.from('placement_drives').select('*').order('drive_date', { ascending: false }),
      ])

      if (filtersData) {
        setDeptsList(filtersData.departments ?? [])
      }
      if (drivesData) {
        setDrivesList(drivesData)
      }
    }
    loadInitialData()
  }, [supabase])

  // Fetch report data
  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      try {
        if (tab === 'overview') {
          // Fetch drives summary with attendance turnout counts
          let q = supabase.from('placement_drives').select('*, placement_drive_students(id, status)')
          if (dateFrom) q = q.gte('drive_date', dateFrom)
          if (dateTo) q = q.lte('drive_date', dateTo)
          q = q.order('drive_date', { ascending: false })

          const { data, error } = await q
          if (!error && data) {
            const summaryItems: DriveSummaryItem[] = data.map((d: any) => {
              const students = d.placement_drive_students || []
              const eligible_count = students.length
              const present_count = students.filter((s: any) => s.status === 'Present').length
              const absent_count = students.filter((s: any) => s.status === 'Absent').length
              const turnout_pct = eligible_count > 0 ? Math.round((present_count / eligible_count) * 100) : 0

              return {
                id: d.id,
                company_name: d.company_name,
                title: d.title,
                drive_date: d.drive_date,
                venue: d.venue,
                status: d.status,
                eligible_count,
                present_count,
                absent_count,
                turnout_pct,
              }
            })

            let filtered = summaryItems
            if (searchQuery.trim()) {
              const query = searchQuery.toLowerCase()
              filtered = filtered.filter(
                (d) => d.company_name.toLowerCase().includes(query) || d.title.toLowerCase().includes(query)
              )
            }

            setDrivesSummary(filtered)
          } else {
            setDrivesSummary([])
          }
        } else if (tab === 'roster') {
          // Fetch student roster across drives
          let q = supabase
            .from('placement_drive_students')
            .select(`
              id, drive_id, student_id, status, marked_at, marked_by_name,
              placement_drives ( company_name, title, drive_date, venue )
            `)

          if (selectedDriveId !== 'all') {
            q = q.eq('drive_id', selectedDriveId)
          }
          if (statusFilter !== 'All') {
            q = q.eq('status', statusFilter)
          }

          const { data, error } = await q
          if (!error && data) {
            // We also fetch student profiles to display department, year, section, name
            const studentIds = Array.from(new Set(data.map((r: any) => r.student_id)))
            let profileMap: Record<string, any> = {}

            if (studentIds.length > 0) {
              const { data: profs } = await supabase
                .from('profiles')
                .select('student_id, name, department, year, section, batch, mobile')
                .in('student_id', studentIds.slice(0, 1000))

              if (profs) {
                profs.forEach((p: any) => {
                  profileMap[p.student_id] = p
                })
              }
            }

            let rows: DriveStudentRosterRecord[] = data.map((r: any) => {
              const drive = r.placement_drives || {}
              const prof = profileMap[r.student_id] || {}
              return {
                id: r.id,
                drive_id: r.drive_id,
                company_name: drive.company_name || '—',
                drive_title: drive.title || '—',
                drive_date: drive.drive_date || '—',
                venue: drive.venue || '—',
                student_id: r.student_id,
                name: prof.name || '—',
                department: prof.department || '—',
                year: prof.year || 0,
                section: prof.section || '—',
                batch: prof.batch || '—',
                mobile: prof.mobile || null,
                assessment_date: drive.drive_date,
                test_time: null,
                slot: null,
                status: r.status,
                marked_at: r.marked_at,
                marked_by_name: r.marked_by_name,
              }
            })

            if (department) {
              rows = rows.filter((r) => r.department === department)
            }

            if (searchQuery.trim()) {
              const query = searchQuery.toLowerCase()
              rows = rows.filter(
                (r) =>
                  r.student_id.toLowerCase().includes(query) ||
                  r.name.toLowerCase().includes(query) ||
                  r.company_name.toLowerCase().includes(query)
              )
            }

            setRosterRecords(rows)
          } else {
            setRosterRecords([])
          }
        }
      } catch (e) {
        console.error('Error fetching Placement Drives report data:', e)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [supabase, tab, selectedDriveId, dateFrom, dateTo, statusFilter, department, searchQuery])

  // Summary Card calculations
  const totalDrives = drivesSummary.length
  const totalEligible = drivesSummary.reduce((acc, d) => acc + d.eligible_count, 0)
  const totalPresent = drivesSummary.reduce((acc, d) => acc + d.present_count, 0)
  const overallTurnout = totalEligible > 0 ? Math.round((totalPresent / totalEligible) * 100) : 0

  async function handleExportExcel() {
    setExporting(true)
    try {
      if (tab === 'overview') {
        await exportPlacementOverviewToExcel(drivesSummary)
      } else {
        const driveObj =
          selectedDriveId !== 'all'
            ? drivesList.find((d) => d.id === selectedDriveId) || {
                company_name: 'All Drives',
                title: 'Combined Report',
                drive_date: new Date().toISOString().split('T')[0],
                venue: 'Various',
              }
            : {
                company_name: 'All Placement Drives',
                title: 'Master Roster',
                drive_date: new Date().toISOString().split('T')[0],
                venue: 'Campus',
              }

        await exportPlacementDriveToExcel(driveObj, rosterRecords, selectedDriveId)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setExporting(false)
    }
  }

  async function handleExportPDF() {
    setExporting(true)
    try {
      if (tab === 'overview') {
        await exportPlacementOverviewToPDF(drivesSummary)
      } else {
        const driveObj =
          selectedDriveId !== 'all'
            ? drivesList.find((d) => d.id === selectedDriveId) || {
                company_name: 'All Drives',
                title: 'Combined Report',
                drive_date: new Date().toISOString().split('T')[0],
                venue: 'Various',
              }
            : {
                company_name: 'All Placement Drives',
                title: 'Master Roster',
                drive_date: new Date().toISOString().split('T')[0],
                venue: 'Campus',
              }

        await exportPlacementDriveToPDF(driveObj, rosterRecords, selectedDriveId)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Banner & Export Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-emerald-950 font-heading flex items-center gap-2">
            <span>🚀</span> Placement Drives Attendance Reports
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            Company drive participation, eligible candidate tracking, and present/absent student records.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleExportPDF}
            disabled={exporting || loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-emerald-200 bg-white text-emerald-700 font-bold text-xs shadow-sm hover:bg-emerald-50 transition-all disabled:opacity-50"
          >
            📄 Export PDF
          </button>
          <button
            onClick={handleExportExcel}
            disabled={exporting || loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs shadow-md shadow-emerald-500/20 hover:bg-emerald-700 transition-all disabled:opacity-50"
          >
            📊 Export Excel
          </button>
        </div>
      </div>

      {/* Summary Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="card p-4 bg-gradient-to-br from-emerald-600 to-emerald-800 text-white shadow-md shadow-emerald-500/10">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-100">Total Placement Drives</p>
          <p className="text-2xl font-black mt-1">{totalDrives} Drives</p>
        </div>
        <div className="card p-4 bg-white border border-slate-200 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Eligible Registrations</p>
          <p className="text-2xl font-black text-slate-800 mt-1">{totalEligible}</p>
        </div>
        <div className="card p-4 bg-white border border-slate-200 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Students Attended (Present)</p>
          <p className="text-2xl font-black text-emerald-600 mt-1">{totalPresent}</p>
        </div>
        <div className="card p-4 bg-white border border-slate-200 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Overall Drive Turnout</p>
          <p className="text-2xl font-black text-indigo-600 mt-1">{overallTurnout}%</p>
        </div>
      </div>

      {/* Sub-Tabs */}
      <div className="flex bg-slate-200/60 p-1 rounded-2xl gap-1 w-fit border border-slate-200">
        <button
          onClick={() => setTab('overview')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            tab === 'overview' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          🚀 Drives Overview
        </button>
        <button
          onClick={() => setTab('roster')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            tab === 'roster' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          👤 Drive Student Roster
        </button>
      </div>

      {/* Filter Bar */}
      <div className="card bg-white p-4 border border-slate-200/80 shadow-sm space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-4">
          {tab === 'roster' && (
            <div className="col-span-2">
              <label className="block text-[10px] font-extrabold uppercase text-slate-400 tracking-wider mb-1">
                Select Placement Drive
              </label>
              <select
                value={selectedDriveId}
                onChange={(e) => setSelectedDriveId(e.target.value)}
                className="input text-xs font-bold text-slate-800"
              >
                <option value="all">All Placement Drives</option>
                {drivesList.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.company_name} — {d.title} ({d.drive_date})
                  </option>
                ))}
              </select>
            </div>
          )}

          {tab === 'overview' && (
            <>
              <div>
                <label className="block text-[10px] font-extrabold uppercase text-slate-400 tracking-wider mb-1">
                  From Date
                </label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="input text-xs font-semibold"
                />
              </div>
              <div>
                <label className="block text-[10px] font-extrabold uppercase text-slate-400 tracking-wider mb-1">
                  To Date
                </label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="input text-xs font-semibold"
                />
              </div>
            </>
          )}

          {tab === 'roster' && (
            <div>
              <label className="block text-[10px] font-extrabold uppercase text-slate-400 tracking-wider mb-1">
                Attendance Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="input text-xs font-semibold text-slate-700"
              >
                <option value="All">All Statuses</option>
                <option value="Present">✅ Present Only</option>
                <option value="Absent">❌ Absent Only</option>
                <option value="Eligible">⏳ Eligible (Unmarked)</option>
              </select>
            </div>
          )}

          <div>
            <label className="block text-[10px] font-extrabold uppercase text-slate-400 tracking-wider mb-1">
              Department
            </label>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="input text-xs font-semibold text-slate-700"
            >
              <option value="">All Departments</option>
              {deptsList.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          <div className="col-span-2 sm:col-span-1">
            <label className="block text-[10px] font-extrabold uppercase text-slate-400 tracking-wider mb-1">
              Search
            </label>
            <input
              type="text"
              placeholder={tab === 'overview' ? 'Company or title...' : 'Student ID or name...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input text-xs"
            />
          </div>
        </div>
      </div>

      {/* Content Table */}
      <div className="card bg-white border border-slate-200/80 shadow-sm overflow-hidden rounded-2xl">
        {loading ? (
          <div className="py-12 text-center text-slate-400 font-semibold animate-pulse">
            Loading Placement Drives Report Data…
          </div>
        ) : tab === 'overview' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-left text-slate-500 font-extrabold uppercase tracking-wider">
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Drive Title</th>
                  <th className="px-4 py-3">Drive Date</th>
                  <th className="px-4 py-3">Venue</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-center">Eligible</th>
                  <th className="px-4 py-3 text-center">Present</th>
                  <th className="px-4 py-3 text-center">Absent</th>
                  <th className="px-4 py-3 text-right">Turnout %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {drivesSummary.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-8 text-slate-400 font-semibold">No placement drives found matching filters.</td></tr>
                ) : (
                  drivesSummary.map((d) => (
                    <tr key={d.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-extrabold text-slate-900">{d.company_name}</td>
                      <td className="px-4 py-3 font-semibold text-slate-700">{d.title}</td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(d.drive_date)}</td>
                      <td className="px-4 py-3 text-slate-600">{d.venue}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          d.status === 'Active'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : d.status === 'Completed'
                            ? 'bg-slate-100 text-slate-600'
                            : 'bg-amber-50 text-amber-700'
                        }`}>
                          {d.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center font-bold text-slate-800">{d.eligible_count}</td>
                      <td className="px-4 py-3 text-center font-bold text-emerald-700">{d.present_count}</td>
                      <td className="px-4 py-3 text-center text-rose-600 font-bold">{d.absent_count}</td>
                      <td className="px-4 py-3 text-right font-black text-indigo-700">{d.turnout_pct}%</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-left text-slate-500 font-extrabold uppercase tracking-wider">
                  <th className="px-4 py-3">Company / Drive</th>
                  <th className="px-4 py-3">Student ID</th>
                  <th className="px-4 py-3">Student Name</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Sec</th>
                  <th className="px-4 py-3 text-center">Attendance Status</th>
                  <th className="px-4 py-3">Marked Time</th>
                  <th className="px-4 py-3">Marked By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rosterRecords.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-8 text-slate-400 font-semibold">No placement drive student records found matching filters.</td></tr>
                ) : (
                  rosterRecords.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-extrabold text-slate-900">
                        {r.company_name}
                        <span className="block text-[10px] text-slate-400 font-normal">{r.drive_title} ({r.drive_date})</span>
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-emerald-900">{r.student_id}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800">{r.name}</td>
                      <td className="px-4 py-3 text-slate-600">{r.department}</td>
                      <td className="px-4 py-3 text-slate-600">{r.section}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold border ${
                          r.status === 'Present'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : r.status === 'Absent'
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}>
                          {r.status === 'Present' ? '✅ Present' : r.status === 'Absent' ? '❌ Absent' : '⏳ Eligible'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{r.marked_at ? formatTime(r.marked_at) : '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{r.marked_by_name || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
