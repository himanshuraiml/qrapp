'use client'

import { useEffect, useState, FormEvent } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SessionSettings } from '@/types'

const PRESETS = [
  {
    name: 'Standard SRMIST',
    description: 'Default academic scheduling hours',
    values: {
      fn1_start: '08:00', fn1_end: '09:40',
      fn2_start: '09:50', fn2_end: '11:30',
      an1_start: '12:30', an1_end: '14:10',
      an2_start: '14:20', an2_end: '16:00'
    }
  },
  {
    name: 'Exam Schedule',
    description: '3-hour examination sessions',
    values: {
      fn1_start: '09:30', fn1_end: '12:30',
      fn2_start: '12:30', fn2_end: '13:30',
      an1_start: '13:30', an1_end: '16:30',
      an2_start: '16:30', an2_end: '17:30'
    }
  },
  {
    name: 'Short Slots',
    description: 'Condensed 60-minute classes',
    values: {
      fn1_start: '08:30', fn1_end: '09:30',
      fn2_start: '09:45', fn2_end: '10:45',
      an1_start: '11:30', an1_end: '12:30',
      an2_start: '12:45', an2_end: '13:45'
    }
  }
]

function calculateDuration(start: string, end: string): string {
  if (!start || !end) return ''
  const [sH, sM] = start.split(':').map(Number)
  const [eH, eM] = end.split(':').map(Number)
  if (isNaN(sH) || isNaN(sM) || isNaN(eH) || isNaN(eM)) return ''
  const startMins = sH * 60 + sM
  const endMins = eH * 60 + eM
  const diffMins = endMins - startMins
  if (diffMins <= 0) return 'Invalid range'
  const hrs = Math.floor(diffMins / 60)
  const mins = diffMins % 60
  return `${hrs > 0 ? `${hrs}h ` : ''}${mins > 0 ? `${mins}m` : ''}`
}

export default function SettingsPage() {
  const supabase = createClient()
  const [settings, setSettings] = useState<SessionSettings | null>(null)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)

  // Tabs
  const [activeTab, setActiveTab] = useState<'policies' | 'schedule' | 'batches'>('policies')

  // Batch Venues States
  const [venues, setVenues] = useState<{ batch: string; venue: string }[]>([])
  const [originalVenues, setOriginalVenues] = useState<{ [batch: string]: string }>({})
  const [venuesLoading, setVenuesLoading] = useState(true)
  const [newBatchName, setNewBatchName] = useState('')
  const [newVenueText, setNewVenueText] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  // Toast System
  const [toasts, setToasts] = useState<{ id: string; type: 'success' | 'error' | 'info'; message: string }[]>([])

  // Modal State
  const [confirmDeleteBatch, setConfirmDeleteBatch] = useState<string | null>(null)

  // Individual card actions loader state
  const [savingVenues, setSavingVenues] = useState<Set<string>>(new Set())
  const [deletingVenues, setDeletingVenues] = useState<Set<string>>(new Set())

  // Custom Toast helper
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Math.random().toString(36).substr(2, 9)
    setToasts((prev) => [...prev, { id, type, message }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000)
  }

  // Load configuration
  useEffect(() => {
    async function loadSettings() {
      try {
        const { data, error } = await supabase.from('session_settings').select('*').eq('id', 1).single()
        if (error) throw error
        if (data) setSettings(data)
      } catch (err) {
        console.error(err)
        showToast('Failed to fetch settings data', 'error')
      } finally {
        setLoading(false)
      }
    }
    loadSettings()
  }, [])

  // Load batch venues
  useEffect(() => {
    async function loadBatchVenues() {
      setVenuesLoading(true)
      try {
        const { data: dbVenues } = await supabase.from('batch_venues').select('*').order('batch')
        const { data: studentBatches } = await supabase
          .from('profiles')
          .select('batch')
          .eq('role', 'Student')
          .not('batch', 'is', null)
          .neq('batch', '')

        const uniqueStudentBatches = Array.from(new Set(studentBatches?.map((p: any) => p.batch) || [])) as string[]

        const merged = [...(dbVenues || [])]
        uniqueStudentBatches.forEach((sb) => {
          if (!merged.some((v) => v.batch === sb)) {
            merged.push({ batch: sb, venue: '' })
          }
        })
        merged.sort((a, b) => a.batch.localeCompare(b.batch))
        setVenues(merged)

        // Track original states to display unsaved indicators
        const initialMap: { [batch: string]: string } = {}
        merged.forEach(v => {
          initialMap[v.batch] = v.venue
        })
        setOriginalVenues(initialMap)
      } catch (e) {
        console.error(e)
        showToast('Failed to load batch list', 'error')
      } finally {
        setVenuesLoading(false)
      }
    }
    loadBatchVenues()
  }, [])

  async function handleSaveVenue(batch: string, venue: string) {
    if (!venue.trim()) {
      showToast('Venue cannot be empty. If you want to delete, click Delete.', 'error')
      return
    }

    setSavingVenues((prev) => {
      const next = new Set(prev)
      next.add(batch)
      return next
    })

    const { error } = await supabase.from('batch_venues').upsert({ batch, venue })
    
    setSavingVenues((prev) => {
      const next = new Set(prev)
      next.delete(batch)
      return next
    })

    if (error) {
      showToast('Failed to save venue: ' + error.message, 'error')
    } else {
      showToast(`Venue for Batch ${batch} saved!`, 'success')
      setOriginalVenues((prev) => ({ ...prev, [batch]: venue }))
    }
  }

  async function handleDeleteVenue(batch: string) {
    setConfirmDeleteBatch(null)
    setDeletingVenues((prev) => {
      const next = new Set(prev)
      next.add(batch)
      return next
    })

    const { error } = await supabase.from('batch_venues').delete().eq('batch', batch)
    
    setDeletingVenues((prev) => {
      const next = new Set(prev)
      next.delete(batch)
      return next
    })

    if (error) {
      showToast('Failed to delete venue: ' + error.message, 'error')
    } else {
      showToast(`Deleted Batch ${batch} venue details`, 'success')
      setVenues((prev) => prev.filter((v) => v.batch !== batch))
      setOriginalVenues((prev) => {
        const next = { ...prev }
        delete next[batch]
        return next
      })
    }
  }

  async function handleAddCustomBatch() {
    const batch = newBatchName.trim().toUpperCase()
    const venue = newVenueText.trim()
    if (!batch || !venue) {
      showToast('Please fill in both Batch code and Venue location.', 'error')
      return
    }
    if (venues.some((v) => v.batch === batch)) {
      showToast(`Batch ${batch} already exists.`, 'error')
      return
    }

    const { error } = await supabase.from('batch_venues').insert({ batch, venue })
    if (error) {
      showToast('Failed to add batch: ' + error.message, 'error')
    } else {
      showToast(`Successfully added Batch ${batch}`, 'success')
      const updatedList = [...venues, { batch, venue }].sort((a, b) => a.batch.localeCompare(b.batch))
      setVenues(updatedList)
      setOriginalVenues((prev) => ({ ...prev, [batch]: venue }))
      setNewBatchName('')
      setNewVenueText('')
    }
  }

  function setField(key: keyof SessionSettings, value: string | boolean) {
    setSettings((s) => s ? { ...s, [key]: value } : s)
  }

  const applyPreset = (presetValues: typeof PRESETS[0]['values']) => {
    if (!settings) return
    setSettings((s) => s ? { ...s, ...presetValues } : s)
    showToast('Applied time presets. Remember to save settings below!', 'info')
  }

  async function handleSaveSettings(e: FormEvent) {
    e.preventDefault()
    if (!settings) return
    setSaving(true)
    const { error } = await supabase.from('session_settings').update({
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
      block_immediate: settings.block_immediate ?? false,
      qr_blocking_enabled: settings.qr_blocking_enabled ?? true,
      restrict_faculty_batch: settings.restrict_faculty_batch ?? false,
    }).eq('id', 1)

    setSaving(false)
    if (error) {
      showToast('Failed to update settings: ' + error.message, 'error')
    } else {
      showToast('System configuration saved successfully!', 'success')
    }
  }

  if (loading) {
    return (
      <div className="space-y-8 max-w-6xl mx-auto animate-pulse">
        {/* Header Block Loader */}
        <div className="h-32 bg-slate-200/80 rounded-3xl border border-slate-100/50"></div>

        {/* Stats Grid Loader */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="h-28 bg-slate-200/80 rounded-2xl border border-slate-100/50"></div>
          <div className="h-28 bg-slate-200/80 rounded-2xl border border-slate-100/50"></div>
          <div className="h-28 bg-slate-200/80 rounded-2xl border border-slate-100/50"></div>
        </div>

        {/* Tabs Bar Loader */}
        <div className="h-12 bg-slate-200/80 rounded-2xl max-w-sm"></div>

        {/* Content Panel Loader */}
        <div className="h-80 bg-slate-200/80 rounded-3xl border border-slate-100/50"></div>
      </div>
    )
  }

  const activeTogglesCount = [
    settings?.enabled,
    settings?.qr_blocking_enabled,
    settings?.block_immediate && settings?.qr_blocking_enabled,
    settings?.restrict_faculty_batch
  ].filter(Boolean).length

  const configuredVenuesCount = venues.filter(v => v.venue.trim() !== '').length

  const filteredVenues = venues.filter(v => 
    v.batch.toLowerCase().includes(searchQuery.toLowerCase()) || 
    v.venue.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="space-y-8 max-w-6xl mx-auto relative pb-12">
      
      {/* Premium Gradient Header Card */}
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-slate-800 shadow-xl p-8 md:p-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#080f25_1px,transparent_1px),linear-gradient(to_bottom,#080f25_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-35"></div>
        <div className="relative z-10 space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-brand-500/10 border border-brand-500/25 text-brand-300">
            System Control Hub
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight font-heading">
            Admin Configuration
          </h1>
          <p className="text-slate-400 text-sm max-w-xl leading-relaxed">
            Manage attendance enforcement rules, scan safety settings, session time intervals, and batch class locations.
          </p>
        </div>

        <div className="relative z-10 flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 text-slate-300 backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            Live settings active
          </span>
        </div>
      </div>

      {/* Stats Counter Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card bg-white/60 hover:bg-white/90 shadow-[0_8px_30px_rgb(0,0,0,0.015)] border border-slate-100 flex items-center justify-between p-6">
          <div className="space-y-1">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Enforced Policies</p>
            <h3 className="text-2xl font-extrabold text-slate-800 font-heading">{activeTogglesCount} Active</h3>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
        </div>

        <div className="card bg-white/60 hover:bg-white/90 shadow-[0_8px_30px_rgb(0,0,0,0.015)] border border-slate-100 flex items-center justify-between p-6">
          <div className="space-y-1">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Configured Locations</p>
            <h3 className="text-2xl font-extrabold text-slate-800 font-heading">{configuredVenuesCount} Venues</h3>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
        </div>

        <div className="card bg-white/60 hover:bg-white/90 shadow-[0_8px_30px_rgb(0,0,0,0.015)] border border-slate-100 flex items-center justify-between p-6">
          <div className="space-y-1">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Scheduling</p>
            <h3 className="text-2xl font-extrabold text-slate-800 font-heading">{settings?.enabled ? 'Restricted' : 'Open Scanning'}</h3>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-slate-200 gap-1 overflow-x-auto">
        <button
          onClick={() => setActiveTab('policies')}
          className={`flex items-center gap-2.5 px-5 py-3.5 border-b-2 font-bold text-xs tracking-wider uppercase whitespace-nowrap transition-all ${
            activeTab === 'policies'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          Security Policies
        </button>
        <button
          onClick={() => setActiveTab('schedule')}
          className={`flex items-center gap-2.5 px-5 py-3.5 border-b-2 font-bold text-xs tracking-wider uppercase whitespace-nowrap transition-all ${
            activeTab === 'schedule'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Session Schedules
        </button>
        <button
          onClick={() => setActiveTab('batches')}
          className={`flex items-center gap-2.5 px-5 py-3.5 border-b-2 font-bold text-xs tracking-wider uppercase whitespace-nowrap transition-all ${
            activeTab === 'batches'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Batch Venues
        </button>
      </div>

      {/* Tab Panels */}
      <div className="transition-all duration-300">
        
        {/* Policies Panel */}
        {activeTab === 'policies' && (
          <form onSubmit={handleSaveSettings} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Card 1: Enforce session hours */}
              <div className="card bg-white hover:border-indigo-200 transition-all duration-300 flex flex-col justify-between h-full group p-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 group-hover:scale-105 transition-transform">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <button
                      type="button"
                      onClick={() => setField('enabled', !settings?.enabled)}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        settings?.enabled ? 'bg-brand-600' : 'bg-slate-200'
                      }`}
                    >
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        settings?.enabled ? 'translate-x-5' : 'translate-x-0'
                      }`} />
                    </button>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800 font-heading">Enforce Session Hours</h4>
                    <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                      Restricts students from checking in unless they scan during the official slot times (FN1, FN2, AN1, AN2). Any scan request outside of these hours will be automatically rejected.
                    </p>
                  </div>
                </div>
              </div>

              {/* Card 2: Student QR Blocking */}
              <div className="card bg-white hover:border-indigo-200 transition-all duration-300 flex flex-col justify-between h-full group p-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 group-hover:scale-105 transition-transform">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                    <button
                      type="button"
                      onClick={() => setField('qr_blocking_enabled', !(settings?.qr_blocking_enabled ?? true))}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        (settings?.qr_blocking_enabled ?? true) ? 'bg-brand-600' : 'bg-slate-200'
                      }`}
                    >
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        (settings?.qr_blocking_enabled ?? true) ? 'translate-x-5' : 'translate-x-0'
                      }`} />
                    </button>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800 font-heading">Enable Student QR Blocking</h4>
                    <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                      Activates the strict QR compliance policy. If a student misses any attendance sessions, their scanner view will be locked down, requiring them to contact faculty for an override.
                    </p>
                  </div>
                </div>
              </div>

              {/* Card 3: Block QR Immediately */}
              <div className={`card bg-white transition-all duration-300 flex flex-col justify-between h-full group p-6 ${
                (settings?.qr_blocking_enabled ?? true) ? 'hover:border-indigo-200 opacity-100' : 'opacity-40 pointer-events-none'
              }`}>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 group-hover:scale-105 transition-transform">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <button
                      type="button"
                      disabled={!(settings?.qr_blocking_enabled ?? true)}
                      onClick={() => setField('block_immediate', !settings?.block_immediate)}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        settings?.block_immediate ? 'bg-brand-600' : 'bg-slate-200'
                      }`}
                    >
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        settings?.block_immediate ? 'translate-x-5' : 'translate-x-0'
                      }`} />
                    </button>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800 font-heading">Block QR Immediately on Miss</h4>
                    <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                      Imposes the attendance lock immediately after the session time windows closes. If toggled off, students who miss a session remain active for the rest of today and get blocked from tomorrow morning.
                    </p>
                  </div>
                </div>
              </div>

              {/* Card 4: Restrict Faculty Batches */}
              <div className="card bg-white hover:border-indigo-200 transition-all duration-300 flex flex-col justify-between h-full group p-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 group-hover:scale-105 transition-transform">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                    </div>
                    <button
                      type="button"
                      onClick={() => setField('restrict_faculty_batch', !settings?.restrict_faculty_batch)}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        settings?.restrict_faculty_batch ? 'bg-brand-600' : 'bg-slate-200'
                      }`}
                    >
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        settings?.restrict_faculty_batch ? 'translate-x-5' : 'translate-x-0'
                      }`} />
                    </button>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800 font-heading">Restrict Faculty to Assigned Batches</h4>
                    <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                      Forces strict access roles for faculty. Faculty members will only be allowed to generate QR codes and mark attendance for batches assigned to them, unless they have special override clearance.
                    </p>
                  </div>
                </div>
              </div>

            </div>

            {/* Sticky Save Bar */}
            <div className="flex justify-end p-4 bg-slate-50 border border-slate-200/80 rounded-2xl">
              <button 
                type="submit" 
                disabled={saving} 
                className="btn-primary flex items-center gap-2 shadow-lg shadow-brand-500/20 w-full md:w-auto px-8"
              >
                {saving ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Saving changes...
                  </>
                ) : 'Save Configuration'}
              </button>
            </div>
          </form>
        )}

        {/* Schedule Panel */}
        {activeTab === 'schedule' && (
          <form onSubmit={handleSaveSettings} className="space-y-6">
            
            {/* Presets Selector Card */}
            <div className="card bg-white p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 gap-2">
                <div>
                  <h4 className="text-sm font-bold text-slate-800 font-heading">Time Schedule Presets</h4>
                  <p className="text-xs text-slate-500">Fast-configure slot configurations with pre-arranged timings.</p>
                </div>
                <span className="text-[10px] font-extrabold tracking-widest text-slate-400 uppercase">One-Click Presets</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => applyPreset(preset.values)}
                    className="flex flex-col text-left p-4 rounded-2xl border border-slate-200 hover:border-brand-500 hover:bg-slate-50/50 hover:shadow-[0_4px_20px_rgba(37,99,235,0.04)] active:scale-[0.98] transition-all group"
                  >
                    <span className="text-xs font-bold text-slate-800 group-hover:text-brand-600 transition-colors">
                      {preset.name}
                    </span>
                    <span className="text-[10px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                      {preset.description}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Time Slots 2x2 Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Slot 1: FN1 */}
              <div className="card bg-white border border-slate-100 p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="space-y-0.5">
                    <span className="text-[9px] font-extrabold uppercase tracking-wider text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-md">Forenoon</span>
                    <h4 className="text-xs font-bold text-slate-800 font-heading">Session Slot 1 (FN1)</h4>
                  </div>
                  {settings && (
                    <span className={`badge text-[10px] font-bold ${
                      calculateDuration(settings.fn1_start, settings.fn1_end) === 'Invalid range'
                        ? 'bg-red-50 text-red-700'
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      {calculateDuration(settings.fn1_start, settings.fn1_end) || 'Empty'}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Start Time</label>
                    <div className="relative">
                      <input 
                        type="time" 
                        className="input text-xs font-semibold py-2.5" 
                        value={settings?.fn1_start ?? ''}
                        onChange={(e) => setField('fn1_start', e.target.value)} 
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">End Time</label>
                    <div className="relative">
                      <input 
                        type="time" 
                        className="input text-xs font-semibold py-2.5" 
                        value={settings?.fn1_end ?? ''}
                        onChange={(e) => setField('fn1_end', e.target.value)} 
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Slot 2: FN2 */}
              <div className="card bg-white border border-slate-100 p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="space-y-0.5">
                    <span className="text-[9px] font-extrabold uppercase tracking-wider text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-md">Forenoon</span>
                    <h4 className="text-xs font-bold text-slate-800 font-heading">Session Slot 2 (FN2)</h4>
                  </div>
                  {settings && (
                    <span className={`badge text-[10px] font-bold ${
                      calculateDuration(settings.fn2_start, settings.fn2_end) === 'Invalid range'
                        ? 'bg-red-50 text-red-700'
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      {calculateDuration(settings.fn2_start, settings.fn2_end) || 'Empty'}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Start Time</label>
                    <div className="relative">
                      <input 
                        type="time" 
                        className="input text-xs font-semibold py-2.5" 
                        value={settings?.fn2_start ?? ''}
                        onChange={(e) => setField('fn2_start', e.target.value)} 
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">End Time</label>
                    <div className="relative">
                      <input 
                        type="time" 
                        className="input text-xs font-semibold py-2.5" 
                        value={settings?.fn2_end ?? ''}
                        onChange={(e) => setField('fn2_end', e.target.value)} 
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Slot 3: AN1 */}
              <div className="card bg-white border border-slate-100 p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="space-y-0.5">
                    <span className="text-[9px] font-extrabold uppercase tracking-wider text-rose-500 bg-rose-50 px-2 py-0.5 rounded-md">Afternoon</span>
                    <h4 className="text-xs font-bold text-slate-800 font-heading">Session Slot 3 (AN1)</h4>
                  </div>
                  {settings && (
                    <span className={`badge text-[10px] font-bold ${
                      calculateDuration(settings.an1_start, settings.an1_end) === 'Invalid range'
                        ? 'bg-red-50 text-red-700'
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      {calculateDuration(settings.an1_start, settings.an1_end) || 'Empty'}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Start Time</label>
                    <div className="relative">
                      <input 
                        type="time" 
                        className="input text-xs font-semibold py-2.5" 
                        value={settings?.an1_start ?? ''}
                        onChange={(e) => setField('an1_start', e.target.value)} 
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">End Time</label>
                    <div className="relative">
                      <input 
                        type="time" 
                        className="input text-xs font-semibold py-2.5" 
                        value={settings?.an1_end ?? ''}
                        onChange={(e) => setField('an1_end', e.target.value)} 
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Slot 4: AN2 */}
              <div className="card bg-white border border-slate-100 p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="space-y-0.5">
                    <span className="text-[9px] font-extrabold uppercase tracking-wider text-rose-500 bg-rose-50 px-2 py-0.5 rounded-md">Afternoon</span>
                    <h4 className="text-xs font-bold text-slate-800 font-heading">Session Slot 4 (AN2)</h4>
                  </div>
                  {settings && (
                    <span className={`badge text-[10px] font-bold ${
                      calculateDuration(settings.an2_start, settings.an2_end) === 'Invalid range'
                        ? 'bg-red-50 text-red-700'
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      {calculateDuration(settings.an2_start, settings.an2_end) || 'Empty'}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Start Time</label>
                    <div className="relative">
                      <input 
                        type="time" 
                        className="input text-xs font-semibold py-2.5" 
                        value={settings?.an2_start ?? ''}
                        onChange={(e) => setField('an2_start', e.target.value)} 
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">End Time</label>
                    <div className="relative">
                      <input 
                        type="time" 
                        className="input text-xs font-semibold py-2.5" 
                        value={settings?.an2_end ?? ''}
                        onChange={(e) => setField('an2_end', e.target.value)} 
                      />
                    </div>
                  </div>
                </div>
              </div>

            </div>

            {/* Sticky Save Bar */}
            <div className="flex justify-end p-4 bg-slate-50 border border-slate-200/80 rounded-2xl">
              <button 
                type="submit" 
                disabled={saving} 
                className="btn-primary flex items-center gap-2 shadow-lg shadow-brand-500/20 w-full md:w-auto px-8"
              >
                {saving ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Saving schedule...
                  </>
                ) : 'Save Schedule'}
              </button>
            </div>
          </form>
        )}

        {/* Batch Venues Panel */}
        {activeTab === 'batches' && (
          <div className="space-y-6">
            
            {/* Search & Add Header Controls */}
            <div className="flex flex-col lg:flex-row gap-6">
              
              {/* Search Control Card */}
              <div className="card bg-white p-5 flex-1 space-y-3">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-heading">Search Batches</h4>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </span>
                  <input
                    type="text"
                    placeholder="Search by Batch code or Venue location..."
                    className="input text-xs pl-10 py-2.5"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              {/* Add Custom Batch Card */}
              <div className="card bg-white p-5 lg:w-[48%] space-y-4">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-heading">Add New Batch Venue</h4>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="Batch Code (e.g. C)"
                    className="input text-xs py-2 bg-slate-50 focus:bg-white"
                    value={newBatchName}
                    onChange={(e) => setNewBatchName(e.target.value)}
                  />
                  <input
                    type="text"
                    placeholder="Venue (e.g. Tech Park 204)"
                    className="input text-xs py-2 bg-slate-50 focus:bg-white"
                    value={newVenueText}
                    onChange={(e) => setNewVenueText(e.target.value)}
                  />
                </div>
                <button
                  onClick={handleAddCustomBatch}
                  className="w-full py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider active:scale-95 transition-all shadow-md shadow-brand-500/10"
                >
                  Create Batch Venue
                </button>
              </div>

            </div>

            {/* Batch Venues Grid */}
            {venuesLoading ? (
              <div className="py-16 flex flex-col items-center justify-center space-y-3">
                <span className="w-8 h-8 border-3 border-brand-600 border-t-transparent rounded-full animate-spin"></span>
                <span className="text-xs text-slate-400 font-semibold">Retrieving batch locations...</span>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between px-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Showing {filteredVenues.length} of {venues.length} Batches
                  </span>
                </div>

                {filteredVenues.length === 0 ? (
                  <div className="card bg-white p-12 text-center text-slate-400 space-y-2">
                    <svg className="w-12 h-12 mx-auto text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 13.5a3 3 0 100-6 3 3 0 000 6z" />
                    </svg>
                    <p className="text-xs font-semibold text-slate-500">No batches match your query</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredVenues.map((v) => {
                      const isDirty = originalVenues[v.batch] !== v.venue
                      const isSaving = savingVenues.has(v.batch)
                      const isDeleting = deletingVenues.has(v.batch)

                      return (
                        <div 
                          key={v.batch} 
                          className={`card bg-white border transition-all duration-300 p-5 space-y-4 flex flex-col justify-between hover:shadow-[0_12px_24px_rgba(0,0,0,0.02)] relative ${
                            isDeleting ? 'opacity-40 pointer-events-none' : ''
                          } ${
                            isDirty ? 'border-amber-200 shadow-[0_4px_20px_rgba(245,158,11,0.02)]' : 'border-slate-100'
                          }`}
                        >
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-900 to-slate-800 text-white flex items-center justify-center font-extrabold text-sm shadow-sm flex-shrink-0">
                                  {v.batch}
                                </div>
                                <div className="space-y-0.5">
                                  <h4 className="text-xs font-bold text-slate-700">Batch {v.batch}</h4>
                                  <p className="text-[10px] text-slate-400">Class location</p>
                                </div>
                              </div>

                              {isDirty && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-amber-50 text-amber-700 border border-amber-100 uppercase tracking-wider">
                                  Unsaved
                                </span>
                              )}
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Venue Location</label>
                              <input
                                type="text"
                                placeholder="E.g., Tech Park 402"
                                className="input text-xs font-semibold py-2 bg-slate-50 focus:bg-white"
                                value={v.venue}
                                disabled={isSaving}
                                onChange={(e) => {
                                  const val = e.target.value
                                  setVenues((prev) => 
                                    prev.map((item) => item.batch === v.batch ? { ...item, venue: val } : item)
                                  )
                                }}
                              />
                            </div>
                          </div>

                          <div className="flex items-center gap-2 pt-2 border-t border-slate-50">
                            <button
                              disabled={!isDirty || isSaving}
                              onClick={() => handleSaveVenue(v.batch, v.venue)}
                              className={`flex-1 py-1.5 rounded-xl text-[10px] font-bold transition-all flex items-center justify-center gap-1 active:scale-95 ${
                                isDirty 
                                  ? 'bg-brand-600 hover:bg-brand-700 text-white shadow-sm' 
                                  : 'bg-slate-50 text-slate-400 cursor-not-allowed border border-slate-100'
                              }`}
                            >
                              {isSaving ? (
                                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                              ) : (
                                <>
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                  </svg>
                                  Save
                                </>
                              )}
                            </button>
                            <button
                              disabled={isSaving}
                              onClick={() => setConfirmDeleteBatch(v.batch)}
                              className="px-3 py-1.5 border border-red-100 hover:border-red-200 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-[10px] font-bold active:scale-95 transition-all flex items-center justify-center gap-1"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                              Delete
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

          </div>
        )}

      </div>

      {/* Confirmation Modal */}
      {confirmDeleteBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-2xl max-w-sm w-full mx-4 space-y-4 animate-slide-up">
            <div className="flex items-center gap-3 text-red-600">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <h3 className="text-lg font-bold font-heading">Delete Batch Venue?</h3>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Are you sure you want to remove the venue details for Batch <span className="font-extrabold text-slate-800">{confirmDeleteBatch}</span>? This will clear the venue showing to students and faculty.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmDeleteBatch(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-50 border border-slate-200 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteVenue(confirmDeleteBatch)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 shadow-md shadow-red-200 transition-all active:scale-95"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Toast Container */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border animate-slide-up max-w-sm transition-all duration-300 ${
              toast.type === 'success'
                ? 'bg-emerald-50 border-emerald-100 text-emerald-800'
                : toast.type === 'error'
                ? 'bg-red-50 border-red-100 text-red-800'
                : 'bg-indigo-50 border-indigo-100 text-indigo-800'
            }`}
          >
            {/* Toast Icons */}
            {toast.type === 'success' && (
              <svg className="w-5 h-5 text-emerald-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            )}
            {toast.type === 'error' && (
              <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            )}
            {toast.type === 'info' && (
              <svg className="w-5 h-5 text-indigo-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            <span className="text-xs font-semibold">{toast.message}</span>
          </div>
        ))}
      </div>

    </div>
  )
}

