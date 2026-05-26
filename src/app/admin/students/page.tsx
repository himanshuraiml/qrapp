'use client'

import { useEffect, useState, FormEvent } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types'

export default function ManageStudentsPage() {
  const supabase = createClient()
  const [students, setStudents] = useState<Profile[]>([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [showForm, setShowForm] = useState(false)
  const [formError, setFormError] = useState('')
  const [saving, setSaving]     = useState(false)

  const [form, setForm] = useState({
    student_id: '', name: '', department: '', year: '1', section: '', password: '',
  })

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

  const filtered = students.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.student_id ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (s.department ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-slate-900">Students</h1>
        <button onClick={() => setShowForm(true)} className="btn-primary w-fit">
          + Add Student
        </button>
      </div>

      {showForm && (
        <div className="card border border-brand-100">
          <h2 className="text-base font-semibold text-slate-800 mb-4">New Student</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Roll Number</label>
              <input required className="input" placeholder="RA2311003010001"
                value={form.student_id} onChange={(e) => setForm({ ...form, student_id: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
              <input required className="input" placeholder="John Doe"
                value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Department</label>
              <input required className="input" placeholder="CSE"
                value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Year</label>
              <select required className="input" value={form.year}
                onChange={(e) => setForm({ ...form, year: e.target.value })}>
                {[1,2,3,4].map((y) => <option key={y} value={y}>Year {y}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Section</label>
              <input required className="input" placeholder="A"
                value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Initial Password</label>
              <input required type="password" className="input" placeholder="••••••••"
                value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
            {formError && (
              <p className="col-span-full text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2">{formError}</p>
            )}
            <div className="col-span-full flex gap-3">
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? 'Creating…' : 'Create Student'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <input
          type="search" placeholder="Search by name, roll number, or department…"
          value={search} onChange={(e) => setSearch(e.target.value)}
          className="input mb-4"
        />

        {loading ? (
          <p className="text-sm text-slate-400 text-center py-8">Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-slate-100">
                  {['Roll No', 'Name', 'Dept', 'Year', 'Section', 'Status', ''].map((h) => (
                    <th key={h} className="pb-3 pr-4 font-semibold text-slate-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="py-2.5 pr-4 font-mono text-xs text-slate-500">{s.student_id}</td>
                    <td className="py-2.5 pr-4 font-medium">{s.name}</td>
                    <td className="py-2.5 pr-4">{s.department}</td>
                    <td className="py-2.5 pr-4">{s.year}</td>
                    <td className="py-2.5 pr-4">{s.section}</td>
                    <td className="py-2.5 pr-4">
                      <span className={`badge ${s.status === 'Active'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-slate-100 text-slate-500'
                      }`}>{s.status}</span>
                    </td>
                    <td className="py-2.5">
                      <button
                        onClick={() => toggleStatus(s)}
                        className="text-xs text-brand-600 hover:text-brand-800 font-medium"
                      >
                        {s.status === 'Active' ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-8">No students found.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
