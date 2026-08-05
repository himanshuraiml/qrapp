'use client'

import React, { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { CdcPeriodAllocation } from '@/types'
import { DEFAULT_INSTITUTIONS, getBranchesForInstitution } from '@/lib/constants/academic'
import { downloadCdcTimetableTemplate } from '@/lib/export'

const DAYS = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
]

const PERIOD_TIMINGS: Record<number, string> = {
  1: '09:00 AM - 09:50 AM',
  2: '09:50 AM - 10:40 AM',
  3: '10:50 AM - 11:40 AM',
  4: '11:40 AM - 12:30 PM',
  5: '01:20 PM - 02:10 PM',
  6: '02:10 PM - 03:00 PM',
  7: '03:10 PM - 04:00 PM',
  8: '04:00 PM - 04:50 PM',
}

interface FacultyOption {
  id: string
  name: string
  department?: string | null
}

const YEAR_ROMAN: Record<number, string> = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' }

export default function CdcTimetableSettings() {
  const supabase = createClient()
  const [dayOfWeek, setDayOfWeek] = useState(1)
  const [faculties, setFaculties] = useState<FacultyOption[]>([])
  const [existingSections, setExistingSections] = useState<string[]>([])
  const [allocationsMap, setAllocationsMap] = useState<Record<number, CdcPeriodAllocation[]>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')

  // Excel Bulk Upload State
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState('')
  const [uploadError, setUploadError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // Load faculty list & existing student sections
  useEffect(() => {
    // 1. Fetch Faculties
    supabase
      .from('profiles')
      .select('id, name, department')
      .eq('role', 'Faculty')
      .eq('status', 'Active')
      .order('name')
      .then(({ data }) => {
        if (data) setFaculties(data)
      })

    // 2. Fetch existing student sections from database profiles
    supabase
      .from('profiles')
      .select('institution, department, year, section')
      .eq('role', 'Student')
      .then(({ data }) => {
        if (data) {
          const sectionSet = new Set<string>()
          data.forEach((p: any) => {
            if (p.section && p.section.trim()) {
              sectionSet.add(p.section.trim())
            }
            if (p.department && p.section) {
              const y = p.year ? (YEAR_ROMAN[p.year] || p.year) : ''
              const inst = p.institution || 'FET'
              const combined = `${inst} • ${p.department} ${y}-${p.section}`.trim()
              if (combined) sectionSet.add(combined)
            }
          })
          setExistingSections(Array.from(sectionSet).sort())
        }
      })
  }, [supabase])

  // Load timetable allocations for selected day
  useEffect(() => {
    setLoading(true)
    supabase
      .from('cdc_timetable')
      .select('period_number, subject, faculty_name, allocations')
      .eq('day_of_week', dayOfWeek)
      .then(({ data }) => {
        const map: Record<number, CdcPeriodAllocation[]> = {}
        for (let i = 1; i <= 8; i++) map[i] = []

        if (data) {
          data.forEach((row: any) => {
            const p = row.period_number
            let allocs: CdcPeriodAllocation[] = []

            if (Array.isArray(row.allocations) && row.allocations.length > 0) {
              allocs = row.allocations.map((a: any, index: number) => ({
                id: a.id || `alloc-${index}`,
                institution: a.institution || 'FET',
                department: a.department || a.branch || 'CSE',
                year: a.year || 3,
                section: a.section || 'A',
                section_name: a.section_name || `${a.institution || 'FET'} • ${a.department || 'CSE'} ${YEAR_ROMAN[a.year] || a.year || ''}-${a.section || 'A'}`,
                subject: a.subject || 'CDC',
                faculty_id: a.faculty_id || '',
                faculty_name: a.faculty_name || '',
              }))
            } else if (row.subject || row.faculty_name) {
              allocs = [
                {
                  id: 'legacy-1',
                  institution: 'FET',
                  department: 'CSE',
                  year: 3,
                  section: 'A',
                  section_name: 'General',
                  subject: row.subject || 'CDC',
                  faculty_name: row.faculty_name || '',
                },
              ]
            }
            map[p] = allocs
          })
        }
        setAllocationsMap(map)
        setLoading(false)
      })
  }, [supabase, dayOfWeek])

  // Add a new section allocation row to a period
  const handleAddAllocation = (period: number) => {
    const defaultInst = 'FET'
    const defaultDept = 'CSE'
    const defaultYear = 3
    const defaultSec = 'A'
    const defaultSecName = `${defaultInst} • ${defaultDept} ${YEAR_ROMAN[defaultYear]}-${defaultSec}`

    const newAlloc: CdcPeriodAllocation = {
      id: crypto.randomUUID(),
      institution: defaultInst,
      department: defaultDept,
      year: defaultYear,
      section: defaultSec,
      section_name: defaultSecName,
      subject: 'CDC',
      faculty_id: '',
      faculty_name: '',
    }
    setAllocationsMap((prev) => ({
      ...prev,
      [period]: [...(prev[period] || []), newAlloc],
    }))
  }

  // Update a specific allocation row
  const handleUpdateAllocation = (
    period: number,
    id: string,
    field: keyof CdcPeriodAllocation,
    value: any
  ) => {
    setAllocationsMap((prev) => {
      const list = prev[period] || []
      const updated = list.map((item) => {
        if (item.id !== id) return item

        const newItem = { ...item, [field]: value }

        if (field === 'faculty_id') {
          const matchedFaculty = faculties.find((f) => f.id === value)
          newItem.faculty_id = value
          newItem.faculty_name = matchedFaculty ? matchedFaculty.name : value
        }

        // Auto format section_name
        const inst = newItem.institution || 'FET'
        const dept = newItem.department || 'CSE'
        const yrNum = typeof newItem.year === 'number' ? newItem.year : parseInt(String(newItem.year || '3'))
        const yrStr = YEAR_ROMAN[yrNum] || (newItem.year ? String(newItem.year) : '')
        const sec = newItem.section ? String(newItem.section).trim().toUpperCase() : 'A'

        if (field === 'institution' || field === 'department' || field === 'year' || field === 'section') {
          newItem.section_name = `${inst} • ${dept} ${yrStr}-${sec}`
        }

        return newItem
      })
      return { ...prev, [period]: updated }
    })
  }

  // Remove an allocation row from a period
  const handleRemoveAllocation = (period: number, id: string) => {
    setAllocationsMap((prev) => ({
      ...prev,
      [period]: (prev[period] || []).filter((item) => item.id !== id),
    }))
  }

  // Save changes to database
  async function handleSave() {
    setSaving(true)
    setSavedMsg('')

    const rows = Array.from({ length: 8 }, (_, i) => i + 1).map((period) => {
      const allocs = (allocationsMap[period] || []).filter(
        (a) => a.section_name.trim() !== '' || (a.faculty_name && a.faculty_name.trim() !== '')
      )

      const subjectSummary = allocs.length > 0 ? 'CDC' : null
      const facultySummary = allocs
        .map((a) => `${a.section_name || 'All'}: ${a.faculty_name || 'TBA'}`)
        .join(', ') || null

      return {
        day_of_week: dayOfWeek,
        period_number: period,
        subject: subjectSummary,
        faculty_name: facultySummary,
        allocations: allocs,
      }
    })

    const { error } = await supabase
      .from('cdc_timetable')
      .upsert(rows, { onConflict: 'day_of_week,period_number' })

    setSaving(false)
    if (error) {
      setSavedMsg(`❌ Failed: ${error.message}`)
    } else {
      setSavedMsg('✅ CDC Timetable saved successfully!')
      setTimeout(() => setSavedMsg(''), 4000)
    }
  }

  // Excel Bulk Timetable Upload Handler
  async function handleBulkUploadFile(file: File) {
    setUploading(true)
    setUploadError('')
    setUploadMsg('')
    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const sheetName = wb.SheetNames.find((n) => n.toLowerCase().includes('timetable')) || wb.SheetNames[0]
      const ws = wb.Sheets[sheetName]
      if (!ws) throw new Error('Could not read sheet in file.')

      const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' })
      if (!rows.length) throw new Error('The uploaded file is empty.')

      // Map rows by (day_of_week, period_number)
      const dayMap: Record<number, Record<number, CdcPeriodAllocation[]>> = {
        1: {}, 2: {}, 3: {}, 4: {}, 5: {}, 6: {}
      }
      for (let d = 1; d <= 6; d++) {
        for (let p = 1; p <= 8; p++) {
          dayMap[d][p] = []
        }
      }

      const dayAlias: Record<string, number> = {
        monday: 1, mon: 1, '1': 1,
        tuesday: 2, tue: 2, '2': 2,
        wednesday: 3, wed: 3, '3': 3,
        thursday: 4, thu: 4, '4': 4,
        friday: 5, fri: 5, '5': 5,
        saturday: 6, sat: 6, '6': 6,
      }

      let parsedCount = 0

      rows.forEach((row: any, idx: number) => {
        const rawDay = String(row['Day'] || row['day'] || '').trim().toLowerCase()
        const dayNum = dayAlias[rawDay] || parseInt(rawDay, 10)
        const periodNum = parseInt(String(row['Period'] || row['period'] || ''), 10)

        if (!dayNum || dayNum < 1 || dayNum > 6 || !periodNum || periodNum < 1 || periodNum > 8) return

        const inst = String(row['Institution'] || row['institution'] || 'FET').trim()
        const branch = String(row['Branch'] || row['department'] || row['Dept'] || 'CSE').trim()
        const year = parseInt(String(row['Year'] || row['year'] || '3'), 10)
        const sec = String(row['Section'] || row['section'] || 'A').trim().toUpperCase()
        const subject = String(row['Subject'] || row['subject'] || 'CDC').trim()
        const rawFaculty = String(row['Faculty'] || row['faculty'] || '').trim()

        // Match faculty by name or department
        let matchedFaculty = faculties.find((f) =>
          f.name.toLowerCase() === rawFaculty.toLowerCase() ||
          f.name.toLowerCase().includes(rawFaculty.toLowerCase())
        )

        const yrStr = YEAR_ROMAN[year] || String(year)
        const secName = `${inst} • ${branch} ${yrStr}-${sec}`

        const alloc: CdcPeriodAllocation = {
          id: `excel-${idx}-${Date.now()}`,
          institution: inst,
          department: branch,
          year: year,
          section: sec,
          section_name: secName,
          subject: subject || 'CDC',
          faculty_id: matchedFaculty?.id || '',
          faculty_name: matchedFaculty ? matchedFaculty.name : rawFaculty,
        }

        dayMap[dayNum][periodNum].push(alloc)
        parsedCount++
      })

      if (parsedCount === 0) {
        throw new Error('No valid timetable rows found. Make sure columns match: Day, Period, Institution, Branch, Year, Section, Faculty.')
      }

      // Upsert allocations for all days and periods into Supabase
      const upsertPayload: any[] = []

      for (let d = 1; d <= 6; d++) {
        for (let p = 1; p <= 8; p++) {
          const allocs = dayMap[d][p]
          if (allocs.length > 0) {
            const subjectSummary = 'CDC'
            const facultySummary = allocs.map((a) => `${a.section_name}: ${a.faculty_name || 'TBA'}`).join(', ')
            upsertPayload.push({
              day_of_week: d,
              period_number: p,
              subject: subjectSummary,
              faculty_name: facultySummary,
              allocations: allocs,
            })
          }
        }
      }

      const { error: dbErr } = await supabase
        .from('cdc_timetable')
        .upsert(upsertPayload, { onConflict: 'day_of_week,period_number' })

      if (dbErr) throw dbErr

      setUploadMsg(`🎉 Successfully uploaded ${parsedCount} class allocations across timetable days!`)
      setShowUploadModal(false)
      
      // Reload current day map
      const { data: refreshed } = await supabase
        .from('cdc_timetable')
        .select('period_number, subject, faculty_name, allocations')
        .eq('day_of_week', dayOfWeek)

      if (refreshed) {
        const map: Record<number, CdcPeriodAllocation[]> = {}
        for (let i = 1; i <= 8; i++) map[i] = []
        refreshed.forEach((row: any) => {
          map[row.period_number] = row.allocations || []
        })
        setAllocationsMap(map)
      }

    } catch (err: any) {
      setUploadError(err.message || 'Failed to process timetable Excel file.')
    } finally {
      setUploading(false)
    }
  }

  const selectedDayLabel = DAYS.find((d) => d.value === dayOfWeek)?.label || 'Monday'

  return (
    <div className="card bg-white p-6 space-y-6 border border-slate-100 shadow-sm rounded-2xl">
      {/* Shared Datalist for autocomplete section options */}
      <datalist id="existing-sections-list">
        {existingSections.map((sec) => (
          <option key={sec} value={sec} />
        ))}
      </datalist>

      {/* Header & Controls */}
      <div className="border-b border-slate-100 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-indigo-50 text-indigo-700 border border-indigo-200 mb-1">
            Institutional Timetable Engine
          </div>
          <h4 className="text-lg font-bold text-slate-800 font-heading">
            CDC 8-Period Timetable Configuration
          </h4>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure classes structured by Institution (FET, FSH, Management), Branch, Year, and Section for each 8-period slot.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => downloadCdcTimetableTemplate()}
            className="btn-secondary text-xs py-2 px-3.5 font-bold flex items-center gap-1.5 border border-slate-200 hover:bg-slate-50"
          >
            <span>⬇️</span> Download Template
          </button>
          
          <button
            type="button"
            onClick={() => setShowUploadModal(true)}
            className="btn-secondary text-xs py-2 px-3.5 font-bold flex items-center gap-1.5 border border-indigo-200 text-indigo-700 bg-indigo-50/60 hover:bg-indigo-100"
          >
            <span>⬆️</span> Bulk Excel Upload
          </button>

          <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
            <label className="text-xs font-bold text-slate-500">Select Day:</label>
            <select
              value={dayOfWeek}
              onChange={(e) => setDayOfWeek(Number(e.target.value))}
              className="input text-xs font-bold py-2 px-3 w-36 border-slate-200 focus:border-indigo-500 rounded-xl"
            >
              {DAYS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {uploadMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-800 animate-fade-in">
          {uploadMsg}
        </div>
      )}

      {/* Bulk Upload Modal Drawer */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="w-full max-w-lg bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 relative overflow-hidden animate-scale-up space-y-4">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-indigo-500 to-brand-500" />

            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-widest font-heading">
                  ⬆️ Bulk Upload CDC Timetable
                </h3>
                <p className="text-xs text-slate-400">Upload an Excel sheet (.xlsx, .xls) containing timetable allocations across days & periods.</p>
              </div>
              <button
                onClick={() => setShowUploadModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 pt-2">
              <div className="flex items-center gap-3">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) setUploadFile(f)
                  }}
                  className="block text-xs text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100 cursor-pointer"
                />
              </div>

              {uploadError && (
                <div className="text-xs font-bold text-red-500 bg-red-50 border border-red-200 rounded-xl p-3">
                  ⚠️ {uploadError}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="btn-secondary text-xs py-2.5 px-4 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={uploading || !uploadFile}
                  onClick={() => uploadFile && handleBulkUploadFile(uploadFile)}
                  className="btn-primary text-xs py-2.5 px-6 font-bold disabled:opacity-50"
                >
                  {uploading ? 'Processing & Saving…' : 'Upload & Save Timetable'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-xs text-slate-400 font-semibold animate-pulse">
          Loading {selectedDayLabel} timetable allocations…
        </div>
      ) : (
        /* 8 Period Configuration Cards */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 8 }, (_, i) => i + 1).map((period) => {
            const allocs = allocationsMap[period] || []
            const isForenoon = period <= 4

            return (
              <div
                key={period}
                className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/40 hover:border-slate-300 transition-all flex flex-col justify-between space-y-3"
              >
                {/* Period Header */}
                <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-indigo-600 text-white text-xs font-extrabold flex items-center justify-center">
                      {period}
                    </span>
                    <div>
                      <h5 className="text-xs font-extrabold text-slate-800 uppercase">
                        Period {period}
                      </h5>
                      <span className="text-[10px] font-semibold text-slate-400">
                        {PERIOD_TIMINGS[period]} • {isForenoon ? 'FN' : 'AN'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        allocs.length > 0
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}
                    >
                      {allocs.length > 0 ? `${allocs.length} Class${allocs.length > 1 ? 'es' : ''}` : 'Free Period'}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleAddAllocation(period)}
                      className="text-xs font-extrabold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg border border-indigo-200 transition-all flex items-center gap-1"
                    >
                      <span>+</span> Add Class
                    </button>
                  </div>
                </div>

                {/* Allocations List */}
                {allocs.length === 0 ? (
                  <div className="py-3 text-center text-xs font-medium text-slate-400 bg-white/60 rounded-lg border border-dashed border-slate-200">
                    No classes scheduled for Period {period} (Free Period)
                  </div>
                ) : (
                  <div className="space-y-3">
                    {allocs.map((item, idx) => {
                      const inst = item.institution || 'FET'
                      const dept = item.department || 'CSE'
                      const branches = getBranchesForInstitution(inst)

                      return (
                        <div
                          key={item.id || idx}
                          className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-2.5 transition-all"
                        >
                          {/* Row Header Badge */}
                          <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                            <span className="text-[10px] font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-md">
                              🏷️ {item.section_name || `${inst} • ${dept} III-A`}
                            </span>
                            
                            <button
                              type="button"
                              onClick={() => handleRemoveAllocation(period, item.id)}
                              title="Remove section class"
                              className="text-xs font-bold text-slate-400 hover:text-red-600 p-1 hover:bg-red-50 rounded"
                            >
                              ✕ Remove
                            </button>
                          </div>

                          {/* Grid Controls: Institution -> Branch -> Year -> Section */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {/* Institution */}
                            <div>
                              <label className="text-[9px] font-extrabold uppercase text-slate-400 block mb-0.5">
                                Institution
                              </label>
                              <select
                                value={inst}
                                onChange={(e) => {
                                  const newInst = e.target.value
                                  const availBranches = getBranchesForInstitution(newInst)
                                  handleUpdateAllocation(period, item.id, 'institution', newInst)
                                  if (availBranches.length > 0) {
                                    handleUpdateAllocation(period, item.id, 'department', availBranches[0])
                                  }
                                }}
                                className="input text-[11px] font-semibold py-1 px-2 w-full border-slate-200 rounded-lg"
                              >
                                {DEFAULT_INSTITUTIONS.map((i) => (
                                  <option key={i} value={i}>{i}</option>
                                ))}
                              </select>
                            </div>

                            {/* Branch / Department */}
                            <div>
                              <label className="text-[9px] font-extrabold uppercase text-slate-400 block mb-0.5">
                                Branch
                              </label>
                              <select
                                value={dept}
                                onChange={(e) => handleUpdateAllocation(period, item.id, 'department', e.target.value)}
                                className="input text-[11px] font-bold py-1 px-2 w-full border-slate-200 rounded-lg"
                              >
                                {branches.map((b) => (
                                  <option key={b} value={b}>{b}</option>
                                ))}
                              </select>
                            </div>

                            {/* Year */}
                            <div>
                              <label className="text-[9px] font-extrabold uppercase text-slate-400 block mb-0.5">
                                Year
                              </label>
                              <select
                                value={item.year || 3}
                                onChange={(e) => handleUpdateAllocation(period, item.id, 'year', parseInt(e.target.value, 10))}
                                className="input text-[11px] font-bold py-1 px-2 w-full border-slate-200 rounded-lg"
                              >
                                {[1, 2, 3, 4].map((y) => (
                                  <option key={y} value={y}>Year {y} ({YEAR_ROMAN[y]})</option>
                                ))}
                              </select>
                            </div>

                            {/* Section */}
                            <div>
                              <label className="text-[9px] font-extrabold uppercase text-slate-400 block mb-0.5">
                                Section
                              </label>
                              <input
                                type="text"
                                placeholder="A, B, C"
                                value={item.section || 'A'}
                                onChange={(e) => handleUpdateAllocation(period, item.id, 'section', e.target.value)}
                                className="input text-[11px] font-bold uppercase py-1 px-2 w-full border-slate-200 rounded-lg"
                              />
                            </div>
                          </div>

                          {/* Faculty & Subject Selection Row */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 border-t border-slate-100">
                            <div className="sm:col-span-2">
                              <label className="text-[9px] font-extrabold uppercase text-slate-400 block mb-0.5">
                                Assigned Faculty
                              </label>
                              <select
                                value={item.faculty_id || ''}
                                onChange={(e) => handleUpdateAllocation(period, item.id, 'faculty_id', e.target.value)}
                                className="input text-xs font-semibold py-1 px-2.5 w-full border-slate-200 rounded-lg focus:border-indigo-500"
                              >
                                <option value="">-- Select Faculty --</option>
                                {faculties.map((f) => (
                                  <option key={f.id} value={f.id}>
                                    {f.name} {f.department ? `(${f.department})` : ''}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="text-[9px] font-extrabold uppercase text-slate-400 block mb-0.5">
                                Subject
                              </label>
                              <input
                                type="text"
                                value={item.subject || 'CDC'}
                                onChange={(e) => handleUpdateAllocation(period, item.id, 'subject', e.target.value)}
                                className="input text-xs font-bold py-1 px-2 w-full border-slate-200 rounded-lg text-indigo-700 bg-indigo-50/40"
                              />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Footer Save Action */}
      <div className="flex items-center justify-between border-t border-slate-100 pt-4">
        <span className="text-xs font-medium text-slate-500">
          * Configure classes for {selectedDayLabel}. Assign Institution, Branch, Year, Section and Faculty per slot.
        </span>

        <div className="flex items-center gap-3">
          {savedMsg && <span className="text-xs font-bold text-slate-700 animate-fade-in">{savedMsg}</span>}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="btn-primary shadow-md px-6 py-2.5 text-xs font-extrabold rounded-xl disabled:opacity-50 transition-all hover:shadow-lg"
          >
            {saving ? 'Saving Timetable…' : `Save ${selectedDayLabel} Timetable`}
          </button>
        </div>
      </div>
    </div>
  )
}
