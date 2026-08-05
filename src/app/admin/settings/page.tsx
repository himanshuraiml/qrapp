'use client'

import { useEffect, useState, FormEvent } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SessionSettings, ModuleType } from '@/types'
import { useModule } from '@/context/ModuleContext'
import CdcTimetableSettings from '@/modules/cdc/components/CdcTimetableSettings'

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

type ModuleTabType = ModuleType | 'global'
type SubTabType = 'timetable' | 'schedule' | 'policies' | 'venues' | 'modules'

const MODULE_DEFINITIONS: { id: ModuleTabType; name: string; icon: string; description: string; colorClass: string; activeTabClass: string }[] = [
  {
    id: 'cdc',
    name: 'CDC Classes',
    icon: '📚',
    description: 'Manage CDC 8-period timetable schedules, daily period allocations, security policies, and batch venues.',
    colorClass: 'indigo',
    activeTabClass: 'bg-indigo-600 text-white shadow-md',
  },
  {
    id: 'training',
    name: 'Placement Training',
    icon: '🎯',
    description: 'Configure training session slot schedules (FN1-AN2), slot presets, compliance policies, and training venues.',
    colorClass: 'amber',
    activeTabClass: 'bg-amber-600 text-white shadow-md',
  },
  {
    id: 'placements',
    name: 'Placement Drives',
    icon: '🚀',
    description: 'Configure drive scanning safety policies, faculty drive assignments, and interview hall locations.',
    colorClass: 'emerald',
    activeTabClass: 'bg-emerald-600 text-white shadow-md',
  },
  {
    id: 'global',
    name: 'Module Feature Flags',
    icon: '🎛️',
    description: 'Enable or disable mini-application modules across the institution.',
    colorClass: 'slate',
    activeTabClass: 'bg-slate-900 text-white shadow-md',
  },
]

export default function SettingsPage() {
  const supabase = createClient()
  const { activeModule, setActiveModule } = useModule()

  const [settings, setSettings] = useState<SessionSettings | null>(null)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [dbQrBlockingEnabled, setDbQrBlockingEnabled] = useState<boolean>(false)

  // Module Tab state (CDC | Placement Training | Placement Drives | Global)
  const [selectedModule, setSelectedModule] = useState<ModuleTabType>('cdc')
  // Sub tab inside module
  const [subTab, setSubTab] = useState<SubTabType>('timetable')

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

  // Keep selectedModule in sync with activeModule from context if user changes top header dropdown
  useEffect(() => {
    if (activeModule && selectedModule !== 'global') {
      setSelectedModule(activeModule)
    }
  }, [activeModule])

  // Adjust default subTab when selectedModule changes
  const handleSelectModuleTab = (mod: ModuleTabType) => {
    setSelectedModule(mod)
    if (mod !== 'global') {
      setActiveModule(mod)
    }

    if (mod === 'cdc') setSubTab('timetable')
    else if (mod === 'training') setSubTab('schedule')
    else if (mod === 'placements') setSubTab('policies')
    else setSubTab('modules')
  }

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
        if (data) {
          setSettings(data)
          setDbQrBlockingEnabled(data.qr_blocking_enabled ?? false)
        }
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

    const turningOnBlocking = !dbQrBlockingEnabled && (settings.qr_blocking_enabled ?? false)

    const payload: Record<string, unknown> = {
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
      qr_scan_open:    settings.qr_scan_open ?? true,
      block_immediate: settings.block_immediate ?? false,
      qr_blocking_enabled: settings.qr_blocking_enabled ?? false,
      restrict_faculty_batch: settings.restrict_faculty_batch ?? false,
      module_training_enabled: settings.module_training_enabled ?? true,
      module_cdc_enabled:      settings.module_cdc_enabled ?? true,
      module_drives_enabled:   settings.module_drives_enabled ?? true,
      p1_start: settings.p1_start ?? '09:00', p1_end: settings.p1_end ?? '09:50',
      p2_start: settings.p2_start ?? '09:50', p2_end: settings.p2_end ?? '10:40',
      p3_start: settings.p3_start ?? '10:50', p3_end: settings.p3_end ?? '11:40',
      p4_start: settings.p4_start ?? '11:40', p4_end: settings.p4_end ?? '12:30',
      p5_start: settings.p5_start ?? '13:20', p5_end: settings.p5_end ?? '14:10',
      p6_start: settings.p6_start ?? '14:10', p6_end: settings.p6_end ?? '15:00',
      p7_start: settings.p7_start ?? '15:10', p7_end: settings.p7_end ?? '16:00',
      p8_start: settings.p8_start ?? '16:00', p8_end: settings.p8_end ?? '16:50',
    }

    if (turningOnBlocking) {
      payload.qr_blocking_enabled_at = new Date().toISOString()
    }

    const { error } = await supabase.from('session_settings').update(payload).eq('id', 1)

    setSaving(false)
    if (error) {
      showToast('Failed to update settings: ' + error.message, 'error')
    } else {
      if (turningOnBlocking) {
        setDbQrBlockingEnabled(true)
      } else if (!(settings.qr_blocking_enabled ?? true)) {
        setDbQrBlockingEnabled(false)
      }
      showToast('Module configuration saved successfully!', 'success')
    }
  }

  if (loading) {
    return (
      <div className="space-y-8 max-w-6xl mx-auto animate-pulse">
        <div className="h-32 bg-slate-200/80 rounded-3xl border border-slate-100/50"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="h-28 bg-slate-200/80 rounded-2xl border border-slate-100/50"></div>
          <div className="h-28 bg-slate-200/80 rounded-2xl border border-slate-100/50"></div>
          <div className="h-28 bg-slate-200/80 rounded-2xl border border-slate-100/50"></div>
        </div>
        <div className="h-12 bg-slate-200/80 rounded-2xl max-w-sm"></div>
        <div className="h-80 bg-slate-200/80 rounded-3xl border border-slate-100/50"></div>
      </div>
    )
  }

  const currentModuleDef = MODULE_DEFINITIONS.find((m) => m.id === selectedModule) || MODULE_DEFINITIONS[0]

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
    <div className="relative space-y-8 max-w-6xl mx-auto pb-12">
      {/* Background Mesh */}
      <div className="absolute inset-0 z-[-1] pointer-events-none opacity-45 overflow-hidden">
        <div className="absolute top-[-10%] left-[-15%] w-[45vw] h-[45vw] rounded-full bg-brand-500/10 blur-[130px] mix-blend-multiply animate-pulse" style={{ animationDuration: '10s' }}></div>
        <div className="absolute bottom-[-10%] right-[-15%] w-[45vw] h-[45vw] rounded-full bg-indigo-500/10 blur-[130px] mix-blend-multiply animate-pulse" style={{ animationDuration: '12s' }}></div>
      </div>
      
      {/* Header Card */}
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-slate-800 shadow-xl p-8 md:p-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#080f25_1px,transparent_1px),linear-gradient(to_bottom,#080f25_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-35"></div>
        <div className="relative z-10 space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-brand-500/10 border border-brand-500/25 text-brand-300">
            <span>{currentModuleDef.icon}</span>
            <span>{currentModuleDef.name} Settings</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight font-heading flex items-center gap-3">
            <span>Admin Configuration</span>
          </h1>
          <p className="text-slate-400 text-sm max-w-xl leading-relaxed">
            {currentModuleDef.description}
          </p>
        </div>

        <div className="relative z-10 flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 text-slate-300 backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            Per-Module Configuration Active
          </span>
        </div>
      </div>

      {/* Stats Counter Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card bg-white/60 hover:bg-white/90 shadow-[0_8px_30px_rgb(0,0,0,0.015)] border border-slate-100 flex items-center justify-between p-6">
          <div className="space-y-1">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Enforced Security Policies</p>
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
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Configured Batch Locations</p>
            <h3 className="text-2xl font-extrabold text-slate-800 font-heading">{configuredVenuesCount} Venues</h3>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
        </div>

        <div className={`card hover:bg-white/90 shadow-[0_8px_30px_rgb(0,0,0,0.015)] flex items-center justify-between p-6 transition-colors ${
          (settings?.qr_scan_open ?? true) ? 'bg-emerald-50/60 border-emerald-100' : 'bg-red-50/60 border-red-100'
        }`}>
          <div className="space-y-1">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">QR Scan Window</p>
            <h3 className={`text-2xl font-extrabold font-heading ${(settings?.qr_scan_open ?? true) ? 'text-emerald-700' : 'text-red-600'}`}>
              {(settings?.qr_scan_open ?? true) ? 'Scan Open' : 'Scan Closed'}
            </h3>
          </div>
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
            (settings?.qr_scan_open ?? true) ? 'bg-emerald-100 border border-emerald-200 text-emerald-600' : 'bg-red-100 border border-red-200 text-red-600'
          }`}>
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Module Selector Bar */}
      <div className="bg-white/80 backdrop-blur-md p-2 rounded-2xl border border-slate-200/80 shadow-[0_8px_30px_rgb(0,0,0,0.02)] space-y-3">
        <div className="px-2 pt-1 flex items-center justify-between">
          <span className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400">Select Settings Module Context</span>
          <span className="text-xs font-bold text-slate-500">Active Module: <strong className="text-slate-800">{currentModuleDef.name}</strong></span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {MODULE_DEFINITIONS.map((m) => {
            const isSelected = selectedModule === m.id
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => handleSelectModuleTab(m.id)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all duration-200 active:scale-95 text-left cursor-pointer border ${
                  isSelected
                    ? `${m.activeTabClass} border-transparent shadow-md`
                    : 'bg-slate-50/70 hover:bg-slate-100/80 text-slate-700 border-slate-200/60'
                }`}
              >
                <span className="text-lg flex-shrink-0">{m.icon}</span>
                <div className="truncate">
                  <div className="font-extrabold truncate">{m.name}</div>
                  <div className={`text-[10px] font-semibold truncate ${isSelected ? 'text-white/80' : 'text-slate-400'}`}>
                    {m.id === 'global' ? 'System Flags' : 'Module Settings'}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Sub-Tabs per Selected Module */}
      <div className="flex bg-white/70 backdrop-blur-md p-1.5 rounded-2xl gap-1 border border-slate-200/50 w-fit shadow-[0_8px_30px_rgb(0,0,0,0.01)] overflow-x-auto">
        
        {/* CDC Sub-tabs */}
        {selectedModule === 'cdc' && (
          <>
            <button
              onClick={() => setSubTab('timetable')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 active:scale-95 whitespace-nowrap ${
                subTab === 'timetable'
                  ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/80 font-extrabold'
                  : 'text-slate-600 hover:text-slate-900 font-semibold'
              }`}
            >
              <span className="text-sm">📚</span>
              CDC 8-Period Timetable
            </button>
            <button
              onClick={() => setSubTab('policies')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 active:scale-95 whitespace-nowrap ${
                subTab === 'policies'
                  ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/80 font-extrabold'
                  : 'text-slate-600 hover:text-slate-900 font-semibold'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Security Policies
            </button>
            <button
              onClick={() => setSubTab('venues')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 active:scale-95 whitespace-nowrap ${
                subTab === 'venues'
                  ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/80 font-extrabold'
                  : 'text-slate-600 hover:text-slate-900 font-semibold'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              CDC Batch Venues
            </button>
          </>
        )}

        {/* Placement Training Sub-tabs */}
        {selectedModule === 'training' && (
          <>
            <button
              onClick={() => setSubTab('schedule')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 active:scale-95 whitespace-nowrap ${
                subTab === 'schedule'
                  ? 'bg-white text-amber-600 shadow-sm border border-slate-200/80 font-extrabold'
                  : 'text-slate-600 hover:text-slate-900 font-semibold'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Session Schedules
            </button>
            <button
              onClick={() => setSubTab('policies')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 active:scale-95 whitespace-nowrap ${
                subTab === 'policies'
                  ? 'bg-white text-amber-600 shadow-sm border border-slate-200/80 font-extrabold'
                  : 'text-slate-600 hover:text-slate-900 font-semibold'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Security Policies
            </button>
            <button
              onClick={() => setSubTab('venues')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 active:scale-95 whitespace-nowrap ${
                subTab === 'venues'
                  ? 'bg-white text-amber-600 shadow-sm border border-slate-200/80 font-extrabold'
                  : 'text-slate-600 hover:text-slate-900 font-semibold'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Training Batch Venues
            </button>
          </>
        )}

        {/* Placement Drives Sub-tabs */}
        {selectedModule === 'placements' && (
          <>
            <button
              onClick={() => setSubTab('policies')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 active:scale-95 whitespace-nowrap ${
                subTab === 'policies'
                  ? 'bg-white text-emerald-600 shadow-sm border border-slate-200/80 font-extrabold'
                  : 'text-slate-600 hover:text-slate-900 font-semibold'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Drive Security Policies
            </button>
            <button
              onClick={() => setSubTab('venues')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 active:scale-95 whitespace-nowrap ${
                subTab === 'venues'
                  ? 'bg-white text-emerald-600 shadow-sm border border-slate-200/80 font-extrabold'
                  : 'text-slate-600 hover:text-slate-900 font-semibold'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Drive & Hall Venues
            </button>
          </>
        )}

        {/* Global Feature Flags */}
        {selectedModule === 'global' && (
          <button
            onClick={() => setSubTab('modules')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold bg-white text-slate-900 shadow-sm border border-slate-200/80 whitespace-nowrap"
          >
            <span className="text-sm">🎛️</span>
            Institution Module Feature Flags
          </button>
        )}

      </div>

      {/* Main Content Panels */}
      <div className="transition-all duration-300">

        {/* CDC Timetable Schedule & Grid Panel */}
        {selectedModule === 'cdc' && subTab === 'timetable' && (
          <div className="space-y-6">
            <form onSubmit={handleSaveSettings} className="space-y-6">
              <div className="card bg-white p-6 space-y-4 border border-slate-100">
                <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                  <div>
                    <h4 className="text-base font-bold text-slate-800 font-heading">CDC Classes 8-Period Timetable Schedule</h4>
                    <p className="text-xs text-slate-500 mt-1">
                      Set the exact start and end times for all 8 daily periods (9:00 AM to 5:00 PM) for CDC ongoing classes.
                    </p>
                  </div>
                  <span className="badge bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-bold">
                    8 Daily Periods
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((pNum) => {
                    const startKey = `p${pNum}_start` as keyof SessionSettings
                    const endKey = `p${pNum}_end` as keyof SessionSettings
                    const defaultStarts = ['09:00', '09:50', '10:50', '11:40', '13:20', '14:10', '15:10', '16:00']
                    const defaultEnds   = ['09:50', '10:40', '11:40', '12:30', '14:10', '15:00', '16:00', '16:50']
                    
                    const valStart = (settings?.[startKey] as string) || defaultStarts[pNum - 1]
                    const valEnd = (settings?.[endKey] as string) || defaultEnds[pNum - 1]

                    return (
                      <div key={pNum} className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200 space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                          <span className="text-xs font-bold text-indigo-700 font-heading">Period {pNum}</span>
                          <span className="text-[10px] text-slate-400 font-semibold">{pNum <= 4 ? 'Forenoon' : 'Afternoon'}</span>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[9px] font-extrabold uppercase text-slate-400">Start</label>
                            <input
                              type="time"
                              className="input text-xs font-semibold py-1.5 px-2"
                              value={valStart}
                              onChange={(e) => setField(startKey, e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="text-[9px] font-extrabold uppercase text-slate-400">End</label>
                            <input
                              type="time"
                              className="input text-xs font-semibold py-1.5 px-2"
                              value={valEnd}
                              onChange={(e) => setField(endKey, e.target.value)}
                            />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="flex justify-end p-4 bg-slate-50 border border-slate-200/80 rounded-2xl">
                <button type="submit" disabled={saving} className="btn-primary shadow-lg px-8">
                  {saving ? 'Saving...' : 'Save CDC Period Timetable'}
                </button>
              </div>
            </form>

            <CdcTimetableSettings />
          </div>
        )}

        {/* Placement Training Session Schedules Panel */}
        {selectedModule === 'training' && subTab === 'schedule' && (
          <form onSubmit={handleSaveSettings} className="space-y-6">
            
            {/* Presets Selector Card */}
            <div className="card bg-white p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 gap-2">
                <div>
                  <h4 className="text-sm font-bold text-slate-800 font-heading">Placement Training Slot Presets</h4>
                  <p className="text-xs text-slate-500">Fast-configure slot configurations with pre-arranged timings.</p>
                </div>
                <span className="text-[10px] font-extrabold tracking-widest text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg uppercase">One-Click Presets</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => applyPreset(preset.values)}
                    className="flex flex-col text-left p-4 rounded-2xl border border-slate-200 hover:border-amber-500 hover:bg-amber-50/30 hover:shadow-[0_4px_20px_rgba(245,158,11,0.04)] active:scale-[0.98] transition-all group"
                  >
                    <span className="text-xs font-bold text-slate-800 group-hover:text-amber-600 transition-colors">
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
                    <h4 className="text-xs font-bold text-slate-800 font-heading">Training Slot 1 (FN1)</h4>
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
                    <input 
                      type="time" 
                      className="input text-xs font-semibold py-2.5" 
                      value={settings?.fn1_start ?? ''}
                      onChange={(e) => setField('fn1_start', e.target.value)} 
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">End Time</label>
                    <input 
                      type="time" 
                      className="input text-xs font-semibold py-2.5" 
                      value={settings?.fn1_end ?? ''}
                      onChange={(e) => setField('fn1_end', e.target.value)} 
                    />
                  </div>
                </div>
              </div>

              {/* Slot 2: FN2 */}
              <div className="card bg-white border border-slate-100 p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="space-y-0.5">
                    <span className="text-[9px] font-extrabold uppercase tracking-wider text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-md">Forenoon</span>
                    <h4 className="text-xs font-bold text-slate-800 font-heading">Training Slot 2 (FN2)</h4>
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
                    <input 
                      type="time" 
                      className="input text-xs font-semibold py-2.5" 
                      value={settings?.fn2_start ?? ''}
                      onChange={(e) => setField('fn2_start', e.target.value)} 
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">End Time</label>
                    <input 
                      type="time" 
                      className="input text-xs font-semibold py-2.5" 
                      value={settings?.fn2_end ?? ''}
                      onChange={(e) => setField('fn2_end', e.target.value)} 
                    />
                  </div>
                </div>
              </div>

              {/* Slot 3: AN1 */}
              <div className="card bg-white border border-slate-100 p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="space-y-0.5">
                    <span className="text-[9px] font-extrabold uppercase tracking-wider text-rose-500 bg-rose-50 px-2 py-0.5 rounded-md">Afternoon</span>
                    <h4 className="text-xs font-bold text-slate-800 font-heading">Training Slot 3 (AN1)</h4>
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
                    <input 
                      type="time" 
                      className="input text-xs font-semibold py-2.5" 
                      value={settings?.an1_start ?? ''}
                      onChange={(e) => setField('an1_start', e.target.value)} 
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">End Time</label>
                    <input 
                      type="time" 
                      className="input text-xs font-semibold py-2.5" 
                      value={settings?.an1_end ?? ''}
                      onChange={(e) => setField('an1_end', e.target.value)} 
                    />
                  </div>
                </div>
              </div>

              {/* Slot 4: AN2 */}
              <div className="card bg-white border border-slate-100 p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="space-y-0.5">
                    <span className="text-[9px] font-extrabold uppercase tracking-wider text-rose-500 bg-rose-50 px-2 py-0.5 rounded-md">Afternoon</span>
                    <h4 className="text-xs font-bold text-slate-800 font-heading">Training Slot 4 (AN2)</h4>
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
                    <input 
                      type="time" 
                      className="input text-xs font-semibold py-2.5" 
                      value={settings?.an2_start ?? ''}
                      onChange={(e) => setField('an2_start', e.target.value)} 
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">End Time</label>
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

            <div className="flex justify-end p-4 bg-slate-50 border border-slate-200/80 rounded-2xl">
              <button 
                type="submit" 
                disabled={saving} 
                className="btn-primary flex items-center gap-2 shadow-lg shadow-amber-500/20 w-full md:w-auto px-8 bg-amber-600 hover:bg-amber-700"
              >
                {saving ? 'Saving schedule...' : 'Save Placement Training Schedule'}
              </button>
            </div>
          </form>
        )}

        {/* Security Policies Panel (Filtered per module context) */}
        {subTab === 'policies' && (
          <form onSubmit={handleSaveSettings} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

              {/* Card 0: QR Scan Window */}
              <div className={`md:col-span-2 card transition-all duration-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 p-6 group ${
                (settings?.qr_scan_open ?? true)
                  ? 'bg-emerald-50/40 border-emerald-200/60 hover:border-emerald-300'
                  : 'bg-red-50/40 border-red-200/60 hover:border-red-300'
              }`}>
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform ${
                    (settings?.qr_scan_open ?? true)
                      ? 'bg-emerald-100 border border-emerald-200 text-emerald-600'
                      : 'bg-red-100 border border-red-200 text-red-600'
                  }`}>
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                    </svg>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-slate-800 font-heading">
                        {selectedModule === 'cdc' && 'CDC QR Scan Window'}
                        {selectedModule === 'training' && 'Training QR Scan Window'}
                        {selectedModule === 'placements' && 'Drive QR Scan Window'}
                      </h4>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                        (settings?.qr_scan_open ?? true)
                          ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                          : 'bg-red-100 text-red-700 border border-red-200'
                      }`}>
                        {(settings?.qr_scan_open ?? true) ? 'Open' : 'Closed'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed max-w-lg">
                      Master switch for student QR code visibility during active {currentModuleDef.name} sessions. When closed, students see a &ldquo;Scanning closed&rdquo; alert instead of their QR code.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setField('qr_scan_open', !(settings?.qr_scan_open ?? true))}
                  className={`relative inline-flex h-7 w-14 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    (settings?.qr_scan_open ?? true) ? 'bg-emerald-500' : 'bg-slate-300'
                  }`}
                >
                  <span className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    (settings?.qr_scan_open ?? true) ? 'translate-x-7' : 'translate-x-0'
                  }`} />
                </button>
              </div>

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
                    <h4 className="text-sm font-bold text-slate-800 font-heading">Enforce Session Slot Hours</h4>
                    <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                      Restricts students from checking in unless they scan during official slot time windows. Any scan request outside of these hours will be automatically rejected.
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
                    <h4 className="text-sm font-bold text-slate-800 font-heading">Enable Student QR Blocking Policy</h4>
                    <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                      Activates the strict QR compliance policy. If a student misses required attendance sessions, their scanner view will be locked down until reset.
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
                      Imposes attendance lockdown immediately after a session closes. If toggled off, missing students remain active for the rest of today and get blocked starting tomorrow morning.
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
                    <h4 className="text-sm font-bold text-slate-800 font-heading">Restrict Faculty to Assigned Batches / Drives</h4>
                    <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                      Forces strict access roles for faculty. Faculty members will only be allowed to generate QR codes and mark attendance for batches assigned to them in {currentModuleDef.name}.
                    </p>
                  </div>
                </div>
              </div>

            </div>

            <div className="flex justify-end p-4 bg-slate-50 border border-slate-200/80 rounded-2xl">
              <button 
                type="submit" 
                disabled={saving} 
                className="btn-primary flex items-center gap-2 shadow-lg shadow-brand-500/20 w-full md:w-auto px-8"
              >
                {saving ? 'Saving policies...' : `Save ${currentModuleDef.name} Policies`}
              </button>
            </div>
          </form>
        )}

        {/* Batch & Venue Locations Panel */}
        {subTab === 'venues' && (
          <div className="space-y-6">
            
            {/* Search & Add Header Controls */}
            <div className="flex flex-col lg:flex-row gap-6">
              
              <div className="card bg-white p-5 flex-1 space-y-3">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-heading">Search Batches & Venues</h4>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </span>
                  <input
                    type="text"
                    placeholder={`Search ${currentModuleDef.name} batch code or venue location...`}
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

              <div className="card bg-white p-5 lg:w-[48%] space-y-4">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-heading">Add New Venue Location</h4>
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
                  Create Batch Venue Location
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
                    Showing {filteredVenues.length} of {venues.length} Batches for {currentModuleDef.name}
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
                                  <p className="text-[10px] text-slate-400">Classroom venue location</p>
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
                                  Save Location
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

        {/* Global Module Feature Flags Panel */}
        {selectedModule === 'global' && subTab === 'modules' && (
          <form onSubmit={handleSaveSettings} className="space-y-6">
            <div className="card bg-white p-6 space-y-4 border border-slate-100">
              <div className="border-b border-slate-100 pb-3">
                <h4 className="text-base font-bold text-slate-800 font-heading">Institution Module Feature Flags</h4>
                <p className="text-xs text-slate-500 mt-1">
                  Enable or disable mini-application modules for your institution. Disabling a module hides its menus, dashboard widgets, reports, filters, and buttons without deleting any underlying data.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
                {/* Module 1: Placement Training */}
                <div className={`p-5 rounded-2xl border transition-all ${
                  (settings?.module_training_enabled ?? true) ? 'bg-amber-50/50 border-amber-200' : 'bg-slate-50 border-slate-200'
                }`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-2xl">🎯</span>
                    <button
                      type="button"
                      onClick={() => setField('module_training_enabled', !(settings?.module_training_enabled ?? true))}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                        (settings?.module_training_enabled ?? true) ? 'bg-amber-600' : 'bg-slate-300'
                      }`}
                    >
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${
                        (settings?.module_training_enabled ?? true) ? 'translate-x-5' : 'translate-x-0'
                      }`} />
                    </button>
                  </div>
                  <h5 className="text-sm font-bold text-slate-800">Placement Training</h5>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Training sessions, attendance tracking, batch analytics, and training performance reports.
                  </p>
                </div>

                {/* Module 2: CDC Classes */}
                <div className={`p-5 rounded-2xl border transition-all ${
                  (settings?.module_cdc_enabled ?? true) ? 'bg-indigo-50/50 border-indigo-200' : 'bg-slate-50 border-slate-200'
                }`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-2xl">📚</span>
                    <button
                      type="button"
                      onClick={() => setField('module_cdc_enabled', !(settings?.module_cdc_enabled ?? true))}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                        (settings?.module_cdc_enabled ?? true) ? 'bg-indigo-600' : 'bg-slate-300'
                      }`}
                    >
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${
                        (settings?.module_cdc_enabled ?? true) ? 'translate-x-5' : 'translate-x-0'
                      }`} />
                    </button>
                  </div>
                  <h5 className="text-sm font-bold text-slate-800">CDC Classes</h5>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    8-Period class timetable, subject-wise period attendance, CDC class logs, and reports.
                  </p>
                </div>

                {/* Module 3: Placement Drives */}
                <div className={`p-5 rounded-2xl border transition-all ${
                  (settings?.module_drives_enabled ?? true) ? 'bg-emerald-50/50 border-emerald-200' : 'bg-slate-50 border-slate-200'
                }`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-2xl">🚀</span>
                    <button
                      type="button"
                      onClick={() => setField('module_drives_enabled', !(settings?.module_drives_enabled ?? true))}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                        (settings?.module_drives_enabled ?? true) ? 'bg-emerald-600' : 'bg-slate-300'
                      }`}
                    >
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${
                        (settings?.module_drives_enabled ?? true) ? 'translate-x-5' : 'translate-x-0'
                      }`} />
                    </button>
                  </div>
                  <h5 className="text-sm font-bold text-slate-800">Placement Drives</h5>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Company profiles, recruitment drives, eligible candidate lists, drive attendance, and selection reports.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end p-4 bg-slate-50 border border-slate-200/80 rounded-2xl">
              <button type="submit" disabled={saving} className="btn-primary shadow-lg px-8">
                {saving ? 'Saving...' : 'Save Module Configuration'}
              </button>
            </div>
          </form>
        )}

      </div>

      {/* Delete Confirmation Modal */}
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
