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
      morning_start:   settings.fn1_start,
      morning_end:     settings.fn2_end,
      afternoon_start: settings.an1_start,
      afternoon_end:   settings.an2_end,
      fn1_start:       settings.fn1_start,
      fn1_end:         settings.fn1_end,
      fn2_start:       settings.fn2_start,
      fn2_end:         settings.fn2_end,
      an1_start:       settings.an1_start,
      an1_end:         settings.an1_end,
      an2_start:       settings.an2_start,
      an2_end:         settings.an2_end,
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
        <form onSubmit={handleSave} className="space-y-6">
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

          <div className="space-y-4">
            {/* FN1 Session */}
            <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl space-y-3">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Forenoon 1 (FN1)</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Start Time</label>
                  <input type="time" className="input" value={settings?.fn1_start ?? ''}
                    onChange={(e) => setField('fn1_start', e.target.value)} />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">End Time</label>
                  <input type="time" className="input" value={settings?.fn1_end ?? ''}
                    onChange={(e) => setField('fn1_end', e.target.value)} />
                </div>
              </div>
            </div>

            {/* FN2 Session */}
            <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl space-y-3">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Forenoon 2 (FN2)</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Start Time</label>
                  <input type="time" className="input" value={settings?.fn2_start ?? ''}
                    onChange={(e) => setField('fn2_start', e.target.value)} />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">End Time</label>
                  <input type="time" className="input" value={settings?.fn2_end ?? ''}
                    onChange={(e) => setField('fn2_end', e.target.value)} />
                </div>
              </div>
            </div>

            {/* AN1 Session */}
            <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl space-y-3">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Afternoon 1 (AN1)</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Start Time</label>
                  <input type="time" className="input" value={settings?.an1_start ?? ''}
                    onChange={(e) => setField('an1_start', e.target.value)} />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">End Time</label>
                  <input type="time" className="input" value={settings?.an1_end ?? ''}
                    onChange={(e) => setField('an1_end', e.target.value)} />
                </div>
              </div>
            </div>

            {/* AN2 Session */}
            <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl space-y-3">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Afternoon 2 (AN2)</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Start Time</label>
                  <input type="time" className="input" value={settings?.an2_start ?? ''}
                    onChange={(e) => setField('an2_start', e.target.value)} />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">End Time</label>
                  <input type="time" className="input" value={settings?.an2_end ?? ''}
                    onChange={(e) => setField('an2_end', e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          <button type="submit" disabled={saving} className="btn-primary w-full py-3 text-xs font-bold uppercase tracking-wider">
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Settings'}
          </button>
        </form>
      </div>
    </div>
  )
}
