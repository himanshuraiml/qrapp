'use client'

import { useEffect, useState, FormEvent } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types'

export default function ManageFacultyPage() {
  const supabase = createClient()
  const [faculty, setFaculty] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

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

  // Filter based on search query
  const filtered = faculty.filter(f => 
    f.name.toLowerCase().includes(search.toLowerCase()) ||
    (f.department ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-8 animate-fade-in pb-12 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Title Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-600 text-xs font-bold uppercase tracking-wider">
            <span>🏫</span> Instructor Registry
          </div>
          <h1 className="text-3xl font-extrabold text-slate-800 font-heading">Faculty Directory</h1>
          <p className="text-xs text-slate-400 font-medium">Add, activate, or audit SRMIST faculty members</p>
        </div>

        <button
          onClick={() => setShowForm(true)}
          className="btn-primary inline-flex items-center gap-1.5 text-xs py-2.5 font-bold"
        >
          <span>+</span> Add Faculty Member
        </button>
      </div>

      {/* Form Drawer (Glass Card) */}
      {showForm && (
        <div className="card-premium border border-brand-200/50 p-8 space-y-6 relative overflow-hidden bg-white/90 backdrop-blur-xl">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-brand-500 to-indigo-500"></div>
          <div>
            <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-widest font-heading">Register New Faculty Account</h3>
            <p className="text-xs text-slate-400">Account login credentials will match the provided professional email address</p>
          </div>

          <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Full Name</label>
              <input required className="input" placeholder="Dr. Arjun Kumar"
                value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Academic Email</label>
              <input required type="email" className="input" placeholder="arjun.k@srmist.edu.in"
                value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Department</label>
              <input required className="input" placeholder="CSE"
                value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
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
                {saving ? 'Registering...' : 'Create Account'}
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
              placeholder="Search by faculty name or department..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 font-bold"
            />
            <span className="absolute right-4 top-3 text-xs text-slate-400">🔍</span>
          </div>
        </div>

        {/* Faculty Table */}
        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center space-y-2">
            <span className="w-8 h-8 border-3 border-brand-600 border-t-transparent rounded-full animate-spin"></span>
            <span className="text-xs text-slate-400 font-medium">Fetching faculty logs...</span>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white/50">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left border-b border-slate-100 bg-slate-50/50">
                  <th className="p-4 font-extrabold text-slate-500 uppercase tracking-widest">Faculty Name</th>
                  <th className="p-4 font-extrabold text-slate-500 uppercase tracking-widest">Department</th>
                  <th className="p-4 font-extrabold text-slate-500 uppercase tracking-widest">Status</th>
                  <th className="p-4 font-extrabold text-slate-500 uppercase tracking-widest text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((f) => (
                  <tr key={f.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4 font-bold text-slate-800 text-sm">{f.name}</td>
                    <td className="p-4 font-semibold text-slate-500 uppercase">{f.department}</td>
                    <td className="p-4">
                      <span className={`badge border font-bold ${f.status === 'Active'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}>{f.status}</span>
                    </td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => toggleStatus(f)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-extrabold transition-all border active:scale-95
                          ${f.status === 'Active'
                            ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                          }`}
                      >
                        {f.status === 'Active' ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {filtered.length === 0 && (
              <div className="text-center py-12 space-y-2 bg-white">
                <span className="text-3xl">📭</span>
                <p className="text-xs font-bold text-slate-400">No faculty members match your search criteria</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
