'use client'

import { useEffect, useState, FormEvent } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SessionSettings } from '@/types'

export default function SettingsPage() {
  const supabase = createClient()
  const [settings, setSettings] = useState<SessionSettings | null>(null)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)

  useEffect(() => {
    supabase.from('session_settings').select('*').eq('id', 1).single()
      .then(({ data }) => { setSettings(data); setLoading(false) })
  }, [])

  function setField(key: keyof SessionSettings, value: string | boolean) {
    setSettings((s) => s ? { ...s, [key]: value } : s)
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!settings) return
    setSaving(true)
    await supabase.from('session_settings').update({
      morning_start:   settings.morning_start,
      morning_end:     settings.morning_end,
      afternoon_start: settings.afternoon_start,
      afternoon_end:   settings.afternoon_end,
      enabled:         settings.enabled,
    }).eq('id', 1)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  if (loading) return <p className="text-sm text-slate-400 py-12 text-center">Loading…</p>

  return (
    <div className="space-y-6 max-w-lg">
      <h1 className="text-2xl font-bold text-slate-900">Session Settings</h1>

      <div className="card">
        <form onSubmit={handleSave} className="space-y-5">
          <div className="flex items-center justify-between py-2 border-b border-slate-100">
            <div>
              <p className="font-medium text-slate-800">Enforce session hours</p>
              <p className="text-sm text-slate-500">Only allow scanning within defined windows</p>
            </div>
            <button
              type="button"
              onClick={() => setField('enabled', !settings?.enabled)}
              className={`relative inline-flex h-6 w-11 rounded-full transition-colors
                ${settings?.enabled ? 'bg-brand-600' : 'bg-slate-200'}`}
            >
              <span className={`inline-block h-4 w-4 rounded-full bg-white shadow translate-y-1 transition-transform
                ${settings?.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">FN Start</label>
              <input type="time" className="input" value={settings?.morning_start ?? ''}
                onChange={(e) => setField('morning_start', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">FN End</label>
              <input type="time" className="input" value={settings?.morning_end ?? ''}
                onChange={(e) => setField('morning_end', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">AN Start</label>
              <input type="time" className="input" value={settings?.afternoon_start ?? ''}
                onChange={(e) => setField('afternoon_start', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">AN End</label>
              <input type="time" className="input" value={settings?.afternoon_end ?? ''}
                onChange={(e) => setField('afternoon_end', e.target.value)} />
            </div>
          </div>

          <button type="submit" disabled={saving} className="btn-primary w-full">
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Settings'}
          </button>
        </form>
      </div>
    </div>
  )
}
