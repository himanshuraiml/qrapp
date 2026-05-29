'use client'

import { useEffect, useState, FormEvent } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types'

export default function ManageStudentsPage() {
  const supabase = createClient()
  const [students, setStudents] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('all')
  const [yearFilter, setYearFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    student_id: '', name: '', department: '', year: '1', section: '', password: '',
  })

  // State for password reset modal
  const [passwordModalUser, setPasswordModalUser] = useState<Profile | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [modalSaving, setModalSaving] = useState(false)
  const [modalError, setModalError] = useState('')
  const [modalSuccess, setModalSuccess] = useState(false)

  // ── NEW: Selection state ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // ── NEW: Edit individual student state ──
  const [editingStudent, setEditingStudent] = useState<Profile | null>(null)
  const [editForm, setEditForm] = useState({
    name: '',
    student_id: '',
    department: '',
    year: '1',
    section: '',
    batch: '',
    status: 'Active' as 'Active' | 'Inactive'
  })
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  // ── NEW: Bulk Edit modal state ──
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [bulkForm, setBulkForm] = useState({
    updateYear: false,
    yearChangeType: 'relative', // 'relative' | 'absolute'
    yearAbsolute: '1',
    yearRelative: 'promote', // 'promote' | 'demote'
    
    updateBatch: false,
    batchAbsolute: '',
    
    updateSection: false,
    sectionAbsolute: '',
    
    updateDept: false,
    deptAbsolute: '',
    
    updateStatus: false,
    statusAbsolute: 'Active' as 'Active' | 'Inactive'
  })
  const [bulkSaving, setBulkSaving] = useState(false)
  const [bulkError, setBulkError] = useState('')

  const [depts, setDepts] = useState<string[]>([])

  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [limit] = useState(50)

  useEffect(() => {
    async function loadUniqueDepts() {
      const { data, error } = await supabase.rpc('get_distinct_filters')
      if (!error && data && data.departments) {
        setDepts(data.departments)
      }
    }
    loadUniqueDepts()
  }, [supabase])

  async function loadStudents(currentPage = page, silent = false) {
    if (!silent) setLoading(true)
    try {
      const queryParams = new URLSearchParams({
        page: String(currentPage),
        limit: String(limit),
        search: search,
        department: deptFilter,
        year: yearFilter,
        t: String(Date.now())
      })
      const res = await fetch(`/api/admin/students?${queryParams.toString()}`, { cache: 'no-store' })
      const json = await res.json()
      if (json.success && json.data) {
        setStudents(json.data)
        setTotalCount(json.count ?? 0)
        
        const cacheKey = `students_cache_${currentPage}_${search}_${deptFilter}_${yearFilter}`
        sessionStorage.setItem(cacheKey, JSON.stringify({ data: json.data, count: json.count }))
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const cacheKey = `students_cache_${page}_${search}_${deptFilter}_${yearFilter}`
    const cached = sessionStorage.getItem(cacheKey)
    if (cached) {
      try {
        const { data, count } = JSON.parse(cached)
        setStudents(data)
        setTotalCount(count ?? 0)
        setLoading(false)
      } catch (e) {}
    }
    loadStudents(page, !!cached)
  }, [page, search, deptFilter, yearFilter])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setFormError('')

    const res = await fetch('/api/admin/create-student', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const json = await res.json()

    if (!json.success) {
      setFormError(json.error ?? 'Failed to create student')
    } else {
      setShowForm(false)
      loadStudents(1, false)
      setForm({ student_id: '', name: '', department: '', year: '1', section: '', password: '' })
    }
    setSaving(false)
  }

  async function toggleStatus(student: Profile) {
    const newStatus: 'Active' | 'Inactive' = student.status === 'Active' ? 'Inactive' : 'Active'
    
    // Local optimistic update
    const updatedList = students.map(s => s.id === student.id ? { ...s, status: newStatus } : s)
    setStudents(updatedList)
    
    const { error } = await supabase.from('profiles').update({ status: newStatus }).eq('id', student.id)
    if (error) {
      loadStudents(page, true)
    }
  }

  // ── NEW: Selection handlers ──
  const isAllSelected = students.length > 0 && students.every(s => selectedIds.has(s.id))
  const toggleSelectAll = () => {
    const next = new Set(selectedIds)
    if (isAllSelected) {
      students.forEach(s => next.delete(s.id))
    } else {
      students.forEach(s => next.add(s.id))
    }
    setSelectedIds(next)
  }

  const toggleSelectStudent = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    setSelectedIds(next)
  }

  // Clear selection on page/search/filter change
  useEffect(() => {
    setSelectedIds(new Set())
  }, [page, search, deptFilter, yearFilter])

  // ── NEW: Edit individual student handlers ──
  const startEdit = (student: Profile) => {
    setEditingStudent(student)
    setEditForm({
      name: student.name || '',
      student_id: student.student_id || '',
      department: student.department || '',
      year: student.year ? String(student.year) : '1',
      section: student.section || '',
      batch: student.batch || '',
      status: student.status || 'Active'
    })
    setEditError('')
  }

  async function handleEditSave(e: FormEvent) {
    e.preventDefault()
    if (!editingStudent) return
    setEditSaving(true)
    setEditError('')

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          name: editForm.name,
          student_id: editForm.student_id ? editForm.student_id.trim() : null,
          department: editForm.department ? editForm.department.trim() : null,
          year: parseInt(editForm.year),
          section: editForm.section ? editForm.section.trim().toUpperCase() : null,
          batch: editForm.batch ? editForm.batch.trim() : null,
          status: editForm.status
        })
        .eq('id', editingStudent.id)

      if (error) throw error

      setEditingStudent(null)
      loadStudents(page, false)
    } catch (err: any) {
      setEditError(err.message || 'Failed to update student profile')
    } finally {
      setEditSaving(false)
    }
  }

  // ── NEW: Bulk update handlers ──
  async function handleBulkStatusChange(newStatus: 'Active' | 'Inactive') {
    if (selectedIds.size === 0) return
    const confirmMsg = `Are you sure you want to set status to ${newStatus} for ${selectedIds.size} selected students?`
    if (!confirm(confirmMsg)) return

    setLoading(true)
    const selectedArray = Array.from(selectedIds)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ status: newStatus })
        .in('id', selectedArray)
      if (error) throw error
      setSelectedIds(new Set())
      loadStudents(page, false)
    } catch (e: any) {
      alert(e.message || 'Failed to update status')
      setLoading(false)
    }
  }

  async function handleBulkSave(e: FormEvent) {
    e.preventDefault()
    if (selectedIds.size === 0) return
    
    if (!bulkForm.updateYear && !bulkForm.updateBatch && !bulkForm.updateSection && !bulkForm.updateDept && !bulkForm.updateStatus) {
      setBulkError('Please enable and configure at least one field to update.')
      return
    }

    setBulkSaving(true)
    setBulkError('')

    const selectedArray = Array.from(selectedIds)

    try {
      // 1. Build standard update object
      const baseUpdate: any = {}
      if (bulkForm.updateBatch) {
        baseUpdate.batch = bulkForm.batchAbsolute.trim() || null
      }
      if (bulkForm.updateSection) {
        baseUpdate.section = bulkForm.sectionAbsolute.trim().toUpperCase() || null
      }
      if (bulkForm.updateDept) {
        baseUpdate.department = bulkForm.deptAbsolute.trim() || null
      }
      if (bulkForm.updateStatus) {
        baseUpdate.status = bulkForm.statusAbsolute
      }

      // If updating year absolutely
      if (bulkForm.updateYear && bulkForm.yearChangeType === 'absolute') {
        baseUpdate.year = parseInt(bulkForm.yearAbsolute)
      }

      // Apply base updates first if there are any
      if (Object.keys(baseUpdate).length > 0) {
        const { error } = await supabase
          .from('profiles')
          .update(baseUpdate)
          .in('id', selectedArray)

        if (error) throw error
      }

      // 2. Relative Year updates
      if (bulkForm.updateYear && bulkForm.yearChangeType === 'relative') {
        const studentsMap = new Map(students.map(s => [s.id, s]))
        const yearGroups: { [key: number]: string[] } = { 1: [], 2: [], 3: [], 4: [] }

        selectedArray.forEach(id => {
          const student = studentsMap.get(id)
          if (student) {
            const currentYear = student.year || 1
            let newYear = currentYear
            if (bulkForm.yearRelative === 'promote') {
              newYear = Math.min(4, currentYear + 1)
            } else if (bulkForm.yearRelative === 'demote') {
              newYear = Math.max(1, currentYear - 1)
            }
            yearGroups[newYear].push(id)
          }
        })

        // Execute parallel updates
        const updatePromises = Object.entries(yearGroups).map(([targetYear, ids]) => {
          if (ids.length === 0) return Promise.resolve()
          return supabase
            .from('profiles')
            .update({ year: parseInt(targetYear) })
            .in('id', ids)
            .then(({ error }) => {
              if (error) throw error
            })
        })

        await Promise.all(updatePromises)
      }

      // Success
      setShowBulkModal(false)
      setSelectedIds(new Set())
      
      // Reset form
      setBulkForm({
        updateYear: false,
        yearChangeType: 'relative',
        yearAbsolute: '1',
        yearRelative: 'promote',
        updateBatch: false,
        batchAbsolute: '',
        updateSection: false,
        sectionAbsolute: '',
        updateDept: false,
        deptAbsolute: '',
        updateStatus: false,
        statusAbsolute: 'Active'
      })
      loadStudents(page, false)
    } catch (err: any) {
      setBulkError(err.message || 'An error occurred during bulk update')
    } finally {
      setBulkSaving(false)
    }
  }

  const filtered = students


  return (
    <div className="space-y-8 animate-fade-in pb-12 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Title Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-600 text-xs font-bold uppercase tracking-wider">
            <span>👥</span> Academic Registry
          </div>
          <h1 className="text-3xl font-extrabold text-slate-800 font-heading">Student Directory</h1>
          <p className="text-xs text-slate-400 font-medium">Add, activate, or audit SRMIST classroom students</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setShowForm(true)}
            className="btn-primary inline-flex items-center gap-1.5 text-xs py-2.5 font-bold"
          >
            <span>+</span> Add New Student
          </button>
        </div>
      </div>

      {/* Form Drawer (Glass Card) */}
      {showForm && (
        <div className="card-premium border border-brand-200/50 p-8 space-y-6 relative overflow-hidden bg-white/90 backdrop-blur-xl">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-brand-500 to-indigo-500"></div>
          <div>
            <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-widest font-heading">Register New Student Profile</h3>
            <p className="text-xs text-slate-400">Account login credentials will be generated automatically matching roll number</p>
          </div>

          <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Roll Number</label>
              <input required className="input" placeholder="RA2311003010001"
                value={form.student_id} onChange={(e) => setForm({ ...form, student_id: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Full Name</label>
              <input required className="input" placeholder="John Doe"
                value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Department</label>
              <input required className="input" placeholder="CSE"
                value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Year</label>
              <select required className="input font-semibold" value={form.year}
                onChange={(e) => setForm({ ...form, year: e.target.value })}>
                {[1,2,3,4].map((y) => <option key={y} value={y}>Year {y}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Section</label>
              <input required className="input" placeholder="A"
                value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Initial Password</label>
              <input required type="password" className="input" placeholder="••••••••"
                value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
            {formError && (
              <div className="col-span-full text-xs font-bold text-red-500 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                ⚠️ {formError}
              </div>
            )}
            <div className="col-span-full flex gap-3 pt-3 border-t border-slate-100">
              <button type="submit" disabled={saving} className="btn-primary text-xs py-2.5 px-6 font-bold shadow-md shadow-brand-500/10">
                {saving ? 'Creating Account...' : 'Create Student'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary text-xs py-2.5 px-6 font-bold">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Directory Filter & Data Table */}
      <div className="card space-y-6">
        {/* Filters Panel */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="relative w-full md:max-w-md">
            <input
              type="search"
              placeholder="Search by name, roll number, or department..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 font-bold"
            />
            <span className="absolute right-4 top-3 text-xs text-slate-400">🔍</span>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={deptFilter}
              onChange={(e) => { setDeptFilter(e.target.value); setPage(1) }}
              className="border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 font-bold text-slate-700 w-36"
            >
              <option value="all">All Departments</option>
              {depts.map((d: string) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>

            <select
              value={yearFilter}
              onChange={(e) => { setYearFilter(e.target.value); setPage(1) }}
              className="border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 font-bold text-slate-700 w-32"
            >
              <option value="all">All Years</option>
              {[1,2,3,4].map(y => (
                <option key={y} value={String(y)}>Year {y}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Students Table */}
        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center space-y-2">
            <span className="w-8 h-8 border-3 border-brand-600 border-t-transparent rounded-full animate-spin"></span>
            <span className="text-xs text-slate-400 font-medium">Fetching classroom registry...</span>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white/50">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left border-b border-slate-100 bg-slate-50/50">
                  <th className="p-4 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={toggleSelectAll}
                      className="rounded text-brand-600 focus:ring-brand-500/20 w-4 h-4 cursor-pointer"
                    />
                  </th>
                  <th className="p-4 font-extrabold text-slate-500 uppercase tracking-widest">Roll Number</th>
                  <th className="p-4 font-extrabold text-slate-500 uppercase tracking-widest">Full Name</th>
                  <th className="p-4 font-extrabold text-slate-500 uppercase tracking-widest">Dept</th>
                  <th className="p-4 font-extrabold text-slate-500 uppercase tracking-widest text-center">Year</th>
                  <th className="p-4 font-extrabold text-slate-500 uppercase tracking-widest text-center">Sec</th>
                  <th className="p-4 font-extrabold text-slate-500 uppercase tracking-widest text-center">Batch</th>
                  <th className="p-4 font-extrabold text-slate-500 uppercase tracking-widest">Status</th>
                  <th className="p-4 font-extrabold text-slate-500 uppercase tracking-widest text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((s) => (
                  <tr key={s.id} className={`hover:bg-slate-50/50 transition-colors ${selectedIds.has(s.id) ? 'bg-brand-50/20' : ''}`}>
                    <td className="p-4 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(s.id)}
                        onChange={() => toggleSelectStudent(s.id)}
                        className="rounded text-brand-600 focus:ring-brand-500/20 w-4 h-4 cursor-pointer"
                      />
                    </td>
                    <td className="p-4 font-mono font-bold text-brand-600 bg-brand-50/40">{s.student_id}</td>
                    <td className="p-4 font-bold text-slate-800 text-sm">{s.name}</td>
                    <td className="p-4 font-semibold text-slate-500 uppercase">{s.department}</td>
                    <td className="p-4 font-bold text-slate-600 text-center">{s.year}</td>
                    <td className="p-4 font-bold text-slate-600 text-center uppercase">{s.section}</td>
                    <td className="p-4 text-center">
                      {s.batch ? (
                        <span className="px-2 py-0.5 rounded bg-slate-900 text-white text-[10px] font-extrabold uppercase">
                          Batch {s.batch}
                        </span>
                      ) : (
                        <span className="text-slate-300 font-medium">—</span>
                      )}
                    </td>
                    <td className="p-4">
                      <span className={`badge border font-bold ${s.status === 'Active'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}>{s.status}</span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => startEdit(s)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-bold transition-all border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 active:scale-95 font-semibold"
                        >
                          ✏️ Edit
                        </button>
                        <button
                          onClick={() => {
                            setPasswordModalUser(s)
                            setNewPassword('')
                            setModalError('')
                            setModalSuccess(false)
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-bold transition-all border border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100 active:scale-95 font-semibold"
                        >
                          🔑 Reset
                        </button>
                        <button
                          onClick={() => toggleStatus(s)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-extrabold transition-all border active:scale-95
                            ${s.status === 'Active'
                              ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                            }`}
                        >
                          {s.status === 'Active' ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>

            </table>
            
            {filtered.length === 0 && (
              <div className="text-center py-12 space-y-2 bg-white">
                <span className="text-3xl">📭</span>
                <p className="text-xs font-bold text-slate-400">No student profiles match your search criteria</p>
              </div>
            )}

            {/* Pagination Controls */}
            {totalCount > limit && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-t border-slate-100 bg-slate-50/50">
                <span className="text-[11px] text-slate-400 font-semibold">
                  Showing <span className="text-slate-700 font-bold">{(page - 1) * limit + 1}</span> to{' '}
                  <span className="text-slate-700 font-bold">{Math.min(page * limit, totalCount)}</span> of{' '}
                  <span className="text-slate-700 font-bold">{totalCount}</span> student profiles
                </span>
                
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 font-bold text-xs disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95"
                  >
                    ◀ Prev
                  </button>
                  
                  {(() => {
                    const totalPages = Math.ceil(totalCount / limit)
                    const pages = []
                    let startPage = Math.max(1, page - 2)
                    let endPage = Math.min(totalPages, page + 2)
                    if (startPage === 1 && totalPages > 5) endPage = 5
                    if (endPage === totalPages && totalPages > 5) startPage = Math.max(1, totalPages - 4)

                    for (let i = startPage; i <= endPage; i++) {
                      pages.push(
                        <button
                          key={i}
                          onClick={() => setPage(i)}
                          className={`w-8 h-8 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                            page === i
                              ? 'bg-brand-600 text-white shadow-md shadow-brand-500/20'
                              : 'border border-slate-200 bg-white hover:bg-slate-50 text-slate-600'
                          }`}
                        >
                          {i}
                        </button>
                      )
                    }
                    return pages
                  })()}
                  
                  <button
                    onClick={() => setPage(p => Math.min(Math.ceil(totalCount / limit), p + 1))}
                    disabled={page >= Math.ceil(totalCount / limit)}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 font-bold text-xs disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95"
                  >
                    Next ▶
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Student Password Reset Modal ── */}
      {passwordModalUser && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 relative overflow-hidden animate-scale-up">
            {/* Decorative Top Accent Bar */}
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-brand-500 to-indigo-500" />
            
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-widest font-heading">
                🔑 Reset Password
              </h3>
              <button
                onClick={() => setPasswordModalUser(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 mb-4">
              <p className="text-xs text-slate-500 font-medium">Resetting password for:</p>
              <p className="text-sm font-bold text-slate-800 mt-1">{passwordModalUser.name}</p>
              {passwordModalUser.student_id && (
                <p className="text-xs font-mono font-bold text-brand-600 mt-0.5">Roll No: {passwordModalUser.student_id}</p>
              )}
            </div>

            {modalSuccess ? (
              <div className="space-y-4 text-center py-6">
                <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center text-xl mx-auto animate-bounce">
                  ✓
                </div>
                <p className="text-sm font-bold text-slate-800">Password Updated Successfully</p>
                <p className="text-xs text-slate-500">The account password has been updated. Provide the new credentials to the student.</p>
                <button
                  onClick={() => setPasswordModalUser(null)}
                  className="btn-primary w-full text-xs font-bold py-2.5 mt-2"
                >
                  Close
                </button>
              </div>
            ) : (
              <form
                onSubmit={async (e) => {
                  e.preventDefault()
                  if (!newPassword || newPassword.length < 6) {
                    setModalError('Password must be at least 6 characters long.')
                    return
                  }
                  setModalSaving(true)
                  setModalError('')
                  try {
                    const res = await fetch('/api/admin/user-details', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ userId: passwordModalUser.id, password: newPassword }),
                    })
                    const data = await res.json()
                    if (data.success) {
                      setModalSuccess(true)
                    } else {
                      setModalError(data.error || 'Failed to update password')
                    }
                  } catch (err: any) {
                    setModalError(err.message || 'An error occurred')
                  } finally {
                    setModalSaving(false)
                  }
                }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">New Password</label>
                  <input
                    required
                    type="password"
                    className="input animate-fade-in"
                    placeholder="Enter new password (min. 6 chars)"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>

                {modalError && (
                  <div className="text-xs font-bold text-red-500 bg-red-50 border border-red-200 rounded-xl px-4 py-3 animate-fade-in">
                    ⚠️ {modalError}
                  </div>
                )}

                <div className="flex gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="submit"
                    disabled={modalSaving}
                    className="btn-primary flex-1 text-xs py-2.5 font-bold shadow-md shadow-brand-500/10"
                  >
                    {modalSaving ? 'Updating...' : 'Update Password'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPasswordModalUser(null)}
                    className="btn-secondary flex-1 text-xs py-2.5 font-bold"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ── NEW: Student Edit Modal ── */}
      {editingStudent && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="w-full max-w-lg bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 relative overflow-hidden animate-scale-up">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-brand-500 to-indigo-500" />
            
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-widest font-heading">
                ✏️ Edit Student Profile
              </h3>
              <button
                onClick={() => setEditingStudent(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEditSave} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1.5">Roll Number</label>
                  <input
                    required
                    type="text"
                    className="input text-xs font-mono font-semibold"
                    value={editForm.student_id}
                    onChange={(e) => setEditForm({ ...editForm, student_id: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1.5">Full Name</label>
                  <input
                    required
                    type="text"
                    className="input text-xs font-bold"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1.5">Department</label>
                  <input
                    required
                    type="text"
                    className="input text-xs uppercase font-semibold"
                    value={editForm.department}
                    onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1.5">Year</label>
                  <select
                    required
                    className="input text-xs font-semibold"
                    value={editForm.year}
                    onChange={(e) => setEditForm({ ...editForm, year: e.target.value })}
                  >
                    {[1, 2, 3, 4].map(y => (
                      <option key={y} value={y}>Year {y}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1.5">Section</label>
                  <input
                    required
                    type="text"
                    className="input text-xs uppercase font-bold"
                    placeholder="e.g. A"
                    value={editForm.section}
                    onChange={(e) => setEditForm({ ...editForm, section: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1.5">Training Batch</label>
                  <input
                    type="text"
                    list="batches-list"
                    className="input text-xs font-bold uppercase"
                    placeholder="e.g. A, B, C, P"
                    value={editForm.batch}
                    onChange={(e) => setEditForm({ ...editForm, batch: e.target.value })}
                  />
                  <datalist id="batches-list">
                    {['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P'].map(b => (
                      <option key={b} value={b}>{`Batch ${b}`}</option>
                    ))}
                  </datalist>
                </div>
                <div className="col-span-full">
                  <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1.5">Status</label>
                  <div className="flex gap-4">
                    <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                      <input
                        type="radio"
                        name="edit-status"
                        checked={editForm.status === 'Active'}
                        onChange={() => setEditForm({ ...editForm, status: 'Active' })}
                        className="text-brand-600 focus:ring-brand-500/20"
                      />
                      Active
                    </label>
                    <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                      <input
                        type="radio"
                        name="edit-status"
                        checked={editForm.status === 'Inactive'}
                        onChange={() => setEditForm({ ...editForm, status: 'Inactive' })}
                        className="text-brand-600 focus:ring-brand-500/20"
                      />
                      Inactive
                    </label>
                  </div>
                </div>
              </div>

              {editError && (
                <div className="text-xs font-bold text-red-500 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  ⚠️ {editError}
                </div>
              )}

              <div className="flex gap-3 pt-3 border-t border-slate-100">
                <button
                  type="submit"
                  disabled={editSaving}
                  className="btn-primary flex-1 text-xs py-2.5 font-bold shadow-md shadow-brand-500/10"
                >
                  {editSaving ? 'Saving Changes...' : 'Save Profile'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingStudent(null)}
                  className="btn-secondary flex-1 text-xs py-2.5 font-bold"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── NEW: Sticky Bulk Action Bar ── */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-full max-w-2xl px-4 animate-slide-up">
          <div className="bg-slate-900/95 backdrop-blur-xl border border-slate-800 text-white rounded-2xl py-3.5 px-5 flex items-center justify-between shadow-2xl gap-4">
            <div className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-brand-500 text-white text-xs font-bold flex items-center justify-center animate-pulse">
                {selectedIds.size}
              </span>
              <div>
                <p className="text-xs font-bold">Students Selected</p>
                <p className="text-[10px] text-slate-400 font-medium">Perform batch or performance operations</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setBulkError('')
                  setBulkSaving(false)
                  setShowBulkModal(true)
                }}
                className="px-3 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 active:scale-95 transition-all text-xs font-extrabold shadow-lg shadow-brand-600/30"
              >
                ✏️ Bulk Update
              </button>
              
              <button
                onClick={() => handleBulkStatusChange('Active')}
                className="px-2.5 py-2 rounded-xl bg-slate-800 border border-slate-700 hover:bg-slate-700 active:scale-95 transition-all text-[11px] font-bold text-emerald-400 hover:text-emerald-300"
              >
                ✓ Activate
              </button>
              
              <button
                onClick={() => handleBulkStatusChange('Inactive')}
                className="px-2.5 py-2 rounded-xl bg-slate-800 border border-slate-700 hover:bg-slate-700 active:scale-95 transition-all text-[11px] font-bold text-red-400 hover:text-red-300"
              >
                ✕ Deactivate
              </button>
              
              <button
                onClick={() => setSelectedIds(new Set())}
                className="p-2 rounded-xl hover:bg-slate-800 transition-colors text-slate-400 hover:text-white font-extrabold text-xs"
                title="Clear Selection"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── NEW: Bulk Update Modal ── */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="w-full max-w-lg bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 relative overflow-hidden animate-scale-up max-h-[90vh] overflow-y-auto">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-brand-500 to-indigo-500" />
            
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-widest font-heading">
                  👥 Bulk Update Operations
                </h3>
                <p className="text-xs text-slate-400 font-medium">Updating {selectedIds.size} selected student profiles</p>
              </div>
              <button
                onClick={() => setShowBulkModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleBulkSave} className="space-y-5">
              <p className="text-[11px] text-slate-500 font-semibold bg-brand-50/50 rounded-xl px-4 py-2.5 border border-brand-100/50">
                💡 Check the fields you want to update. Fields left unchecked will remain unmodified.
              </p>

              {/* 1. Academic Year */}
              <div className="border border-slate-100 rounded-2xl p-4 bg-slate-50/30 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bulkForm.updateYear}
                    onChange={(e) => setBulkForm({ ...bulkForm, updateYear: e.target.checked })}
                    className="rounded text-brand-600 focus:ring-brand-500/20 w-4 h-4"
                  />
                  <span className="text-xs font-bold text-slate-700">Update Academic Year</span>
                </label>
                
                {bulkForm.updateYear && (
                  <div className="pl-6 space-y-3 animate-fade-in">
                    <div className="flex gap-4">
                      <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer">
                        <input
                          type="radio"
                          name="bulk-year-type"
                          checked={bulkForm.yearChangeType === 'relative'}
                          onChange={() => setBulkForm({ ...bulkForm, yearChangeType: 'relative' })}
                          className="text-brand-600 focus:ring-brand-500/20"
                        />
                        Relative (Promote/Demote)
                      </label>
                      <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer">
                        <input
                          type="radio"
                          name="bulk-year-type"
                          checked={bulkForm.yearChangeType === 'absolute'}
                          onChange={() => setBulkForm({ ...bulkForm, yearChangeType: 'absolute' })}
                          className="text-brand-600 focus:ring-brand-500/20"
                        />
                        Absolute Override
                      </label>
                    </div>

                    {bulkForm.yearChangeType === 'relative' ? (
                      <select
                        className="input text-xs font-semibold"
                        value={bulkForm.yearRelative}
                        onChange={(e) => setBulkForm({ ...bulkForm, yearRelative: e.target.value as any })}
                      >
                        <option value="promote">Promote (+1 Year — capped at 4)</option>
                        <option value="demote">Demote (-1 Year — capped at 1)</option>
                      </select>
                    ) : (
                      <select
                        className="input text-xs font-semibold"
                        value={bulkForm.yearAbsolute}
                        onChange={(e) => setBulkForm({ ...bulkForm, yearAbsolute: e.target.value })}
                      >
                        {[1, 2, 3, 4].map(y => (
                          <option key={y} value={y}>Set to Year {y}</option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </div>

              {/* 2. Training Batch */}
              <div className="border border-slate-100 rounded-2xl p-4 bg-slate-50/30 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bulkForm.updateBatch}
                    onChange={(e) => setBulkForm({ ...bulkForm, updateBatch: e.target.checked })}
                    className="rounded text-brand-600 focus:ring-brand-500/20 w-4 h-4"
                  />
                  <span className="text-xs font-bold text-slate-700">Update Training Batch (Performance)</span>
                </label>

                {bulkForm.updateBatch && (
                  <div className="pl-6 animate-fade-in">
                    <input
                      type="text"
                      list="batches-list"
                      className="input text-xs font-bold uppercase"
                      placeholder="Enter target batch e.g. A, B, C, P"
                      value={bulkForm.batchAbsolute}
                      onChange={(e) => setBulkForm({ ...bulkForm, batchAbsolute: e.target.value })}
                    />
                  </div>
                )}
              </div>

              {/* 3. Section Correction */}
              <div className="border border-slate-100 rounded-2xl p-4 bg-slate-50/30 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bulkForm.updateSection}
                    onChange={(e) => setBulkForm({ ...bulkForm, updateSection: e.target.checked })}
                    className="rounded text-brand-600 focus:ring-brand-500/20 w-4 h-4"
                  />
                  <span className="text-xs font-bold text-slate-700">Correct Section (Mistake Uploads)</span>
                </label>

                {bulkForm.updateSection && (
                  <div className="pl-6 animate-fade-in">
                    <input
                      type="text"
                      className="input text-xs font-bold uppercase"
                      placeholder="Enter corrected section e.g. A, B"
                      value={bulkForm.sectionAbsolute}
                      onChange={(e) => setBulkForm({ ...bulkForm, sectionAbsolute: e.target.value })}
                    />
                  </div>
                )}
              </div>

              {/* 4. Department Override */}
              <div className="border border-slate-100 rounded-2xl p-4 bg-slate-50/30 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bulkForm.updateDept}
                    onChange={(e) => setBulkForm({ ...bulkForm, updateDept: e.target.checked })}
                    className="rounded text-brand-600 focus:ring-brand-500/20 w-4 h-4"
                  />
                  <span className="text-xs font-bold text-slate-700">Update Department</span>
                </label>

                {bulkForm.updateDept && (
                  <div className="pl-6 animate-fade-in">
                    <input
                      type="text"
                      className="input text-xs font-semibold uppercase"
                      placeholder="Enter department e.g. CSE"
                      value={bulkForm.deptAbsolute}
                      onChange={(e) => setBulkForm({ ...bulkForm, deptAbsolute: e.target.value })}
                    />
                  </div>
                )}
              </div>

              {/* 5. Status Override */}
              <div className="border border-slate-100 rounded-2xl p-4 bg-slate-50/30 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bulkForm.updateStatus}
                    onChange={(e) => setBulkForm({ ...bulkForm, updateStatus: e.target.checked })}
                    className="rounded text-brand-600 focus:ring-brand-500/20 w-4 h-4"
                  />
                  <span className="text-xs font-bold text-slate-700">Update Status</span>
                </label>

                {bulkForm.updateStatus && (
                  <div className="pl-6 animate-fade-in flex gap-4">
                    <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer">
                      <input
                        type="radio"
                        name="bulk-status-override"
                        checked={bulkForm.statusAbsolute === 'Active'}
                        onChange={() => setBulkForm({ ...bulkForm, statusAbsolute: 'Active' })}
                        className="text-brand-600 focus:ring-brand-500/20"
                      />
                      Active
                    </label>
                    <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer">
                      <input
                        type="radio"
                        name="bulk-status-override"
                        checked={bulkForm.statusAbsolute === 'Inactive'}
                        onChange={() => setBulkForm({ ...bulkForm, statusAbsolute: 'Inactive' })}
                        className="text-brand-600 focus:ring-brand-500/20"
                      />
                      Inactive
                    </label>
                  </div>
                )}
              </div>

              {bulkError && (
                <div className="text-xs font-bold text-red-500 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  ⚠️ {bulkError}
                </div>
              )}

              <div className="flex gap-3 pt-3 border-t border-slate-100">
                <button
                  type="submit"
                  disabled={bulkSaving}
                  className="btn-primary flex-1 text-xs py-2.5 font-bold shadow-md shadow-brand-500/10"
                >
                  {bulkSaving ? 'Executing Bulk Changes...' : 'Execute Operations'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowBulkModal(false)}
                  className="btn-secondary flex-1 text-xs py-2.5 font-bold"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

