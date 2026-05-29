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

  // Get unique departments for filter dropdown
  const uniqueDepts = Array.from(new Set(students.map(s => s.department).filter(Boolean))) as string[]

  async function loadStudents() {
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'Student')
      .order('department')
      .order('year')
      .order('section')
      .order('name')
    setStudents(data ?? [])
    setLoading(false)
  }

  useEffect(() => { loadStudents() }, [])

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
      setForm({ student_id: '', name: '', department: '', year: '1', section: '', password: '' })
      loadStudents()
    }
    setSaving(false)
  }

  async function toggleStatus(student: Profile) {
    const newStatus = student.status === 'Active' ? 'Inactive' : 'Active'
    await supabase.from('profiles').update({ status: newStatus }).eq('id', student.id)
    loadStudents()
  }

  // Filter based on search query, department filter, and year filter
  const filtered = students.filter((s) => {
    const matchesSearch = 
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.student_id ?? '').toLowerCase().includes(search.toLowerCase())
    
    const matchesDept = deptFilter === 'all' || s.department?.toLowerCase() === deptFilter.toLowerCase()
    const matchesYear = yearFilter === 'all' || String(s.year) === yearFilter

    return matchesSearch && matchesDept && matchesYear
  })

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
              onChange={(e) => setSearch(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 font-bold"
            />
            <span className="absolute right-4 top-3 text-xs text-slate-400">🔍</span>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 font-bold text-slate-700 w-36"
            >
              <option value="all">All Departments</option>
              {uniqueDepts.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>

            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
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
                  <th className="p-4 font-extrabold text-slate-500 uppercase tracking-widest">Roll Number</th>
                  <th className="p-4 font-extrabold text-slate-500 uppercase tracking-widest">Full Name</th>
                  <th className="p-4 font-extrabold text-slate-500 uppercase tracking-widest">Dept</th>
                  <th className="p-4 font-extrabold text-slate-500 uppercase tracking-widest text-center">Year</th>
                  <th className="p-4 font-extrabold text-slate-500 uppercase tracking-widest text-center">Sec</th>
                  <th className="p-4 font-extrabold text-slate-500 uppercase tracking-widest">Status</th>
                  <th className="p-4 font-extrabold text-slate-500 uppercase tracking-widest text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4 font-mono font-bold text-brand-600 bg-brand-50/40">{s.student_id}</td>
                    <td className="p-4 font-bold text-slate-800 text-sm">{s.name}</td>
                    <td className="p-4 font-semibold text-slate-500 uppercase">{s.department}</td>
                    <td className="p-4 font-bold text-slate-600 text-center">{s.year}</td>
                    <td className="p-4 font-bold text-slate-600 text-center uppercase">{s.section}</td>
                    <td className="p-4">
                      <span className={`badge border font-bold ${s.status === 'Active'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}>{s.status}</span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
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
    </div>
  )
}
