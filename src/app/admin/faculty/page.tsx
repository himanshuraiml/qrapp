'use client'

import { useEffect, useState, FormEvent } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types'

export default function ManageFacultyPage() {
  const supabase = createClient()
  const [faculty, setFaculty]   = useState<Profile[]>([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formError, setFormError] = useState('')
  const [saving, setSaving]     = useState(false)

  const [form, setForm] = useState({
    name: '', email: '', department: '', password: '',
  })

  async function loadFaculty() {
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'Faculty')
      .order('department')
      .order('name')
    setFaculty(data ?? [])
    setLoading(false)
  }

  useEffect(() => { loadFaculty() }, [])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setFormError('')

    const res = await fetch('/api/admin/create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, role: 'Faculty' }),
    })
    const json = await res.json()

    if (!json.success) {
      setFormError(json.error ?? 'Failed to create faculty')
    } else {
      setShowForm(false)
      setForm({ name: '', email: '', department: '', password: '' })
      loadFaculty()
    }
    setSaving(false)
  }

  async function toggleStatus(f: Profile) {
    const newStatus = f.status === 'Active' ? 'Inactive' : 'Active'
    await supabase.from('profiles').update({ status: newStatus }).eq('id', f.id)
    loadFaculty()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-slate-900">Faculty</h1>
        <button onClick={() => setShowForm(true)} className="btn-primary w-fit">
          + Add Faculty
        </button>
      </div>

      {showForm && (
        <div className="card border border-brand-100">
          <h2 className="text-base font-semibold text-slate-800 mb-4">New Faculty Member</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
              <input required className="input" placeholder="Dr. Name"
                value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input required type="email" className="input" placeholder="faculty@srmist.ac.in"
                value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Department</label>
              <input required className="input" placeholder="CSE"
                value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
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
                {saving ? 'Creating…' : 'Create Faculty'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        {loading ? (
          <p className="text-sm text-slate-400 text-center py-8">Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-slate-100">
                  {['Name', 'Department', 'Status', ''].map((h) => (
                    <th key={h} className="pb-3 pr-4 font-semibold text-slate-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {faculty.map((f) => (
                  <tr key={f.id} className="hover:bg-slate-50">
                    <td className="py-2.5 pr-4 font-medium">{f.name}</td>
                    <td className="py-2.5 pr-4">{f.department}</td>
                    <td className="py-2.5 pr-4">
                      <span className={`badge ${f.status === 'Active'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-slate-100 text-slate-500'
                      }`}>{f.status}</span>
                    </td>
                    <td className="py-2.5">
                      <button onClick={() => toggleStatus(f)}
                        className="text-xs text-brand-600 hover:text-brand-800 font-medium">
                        {f.status === 'Active' ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {faculty.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-8">No faculty members yet.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
