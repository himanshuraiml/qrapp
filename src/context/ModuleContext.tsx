'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { safeStorage } from '@/lib/safeStorage'
import type { ModuleType, ModuleFeatureFlags, CdcPeriodTiming } from '@/types'

interface ModuleContextType {
  activeModule: ModuleType
  availableModules: ModuleType[]
  featureFlags: ModuleFeatureFlags
  cdcPeriods: CdcPeriodTiming[]
  loading: boolean
  setActiveModule: (module: ModuleType) => void
  refreshSettings: () => Promise<void>
}

const DEFAULT_FEATURE_FLAGS: ModuleFeatureFlags = {
  training: true,
  cdc: true,
  placements: true,
}

const DEFAULT_CDC_PERIODS: CdcPeriodTiming[] = [
  { period: 1, start_time: '09:00', end_time: '09:50' },
  { period: 2, start_time: '09:50', end_time: '10:40' },
  { period: 3, start_time: '10:50', end_time: '11:40' },
  { period: 4, start_time: '11:40', end_time: '12:30' },
  { period: 5, start_time: '13:20', end_time: '14:10' },
  { period: 6, start_time: '14:10', end_time: '15:00' },
  { period: 7, start_time: '15:10', end_time: '16:00' },
  { period: 8, start_time: '16:00', end_time: '16:50' },
]

const ModuleContext = createContext<ModuleContextType>({
  activeModule: 'cdc',
  availableModules: ['training', 'cdc', 'placements'],
  featureFlags: DEFAULT_FEATURE_FLAGS,
  cdcPeriods: DEFAULT_CDC_PERIODS,
  loading: true,
  setActiveModule: () => {},
  refreshSettings: async () => {},
})

export const ModuleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const supabase = createClient()
  const [featureFlags, setFeatureFlags] = useState<ModuleFeatureFlags>(DEFAULT_FEATURE_FLAGS)
  const [cdcPeriods, setCdcPeriods] = useState<CdcPeriodTiming[]>(DEFAULT_CDC_PERIODS)
  const [activeModuleState, setActiveModuleState] = useState<ModuleType>('cdc')
  const [loading, setLoading] = useState(true)

  const refreshSettings = async () => {
    try {
      const { data, error } = await supabase.from('session_settings').select('*').eq('id', 1).single()
      if (!error && data) {
        const flags: ModuleFeatureFlags = {
          training: data.module_training_enabled ?? true,
          cdc: data.module_cdc_enabled ?? true,
          placements: data.module_drives_enabled ?? true,
        }
        setFeatureFlags(flags)

        const periods: CdcPeriodTiming[] = [
          { period: 1, start_time: data.p1_start || '09:00', end_time: data.p1_end || '09:50' },
          { period: 2, start_time: data.p2_start || '09:50', end_time: data.p2_end || '10:40' },
          { period: 3, start_time: data.p3_start || '10:50', end_time: data.p3_end || '11:40' },
          { period: 4, start_time: data.p4_start || '11:40', end_time: data.p4_end || '12:30' },
          { period: 5, start_time: data.p5_start || '13:20', end_time: data.p5_end || '14:10' },
          { period: 6, start_time: data.p6_start || '14:10', end_time: data.p6_end || '15:00' },
          { period: 7, start_time: data.p7_start || '15:10', end_time: data.p7_end || '16:00' },
          { period: 8, start_time: data.p8_start || '16:00', end_time: data.p8_end || '16:50' },
        ]
        setCdcPeriods(periods)
      }
    } catch (e) {
      console.error('Failed to load module feature flags', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refreshSettings()
  }, [])

  // Derive available modules
  const availableModules: ModuleType[] = (['training', 'cdc', 'placements'] as ModuleType[]).filter(
    (m) => featureFlags[m]
  )

  // Initialize activeModule from localStorage or default to first available
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = safeStorage.getItem('qrapp_active_module') as ModuleType | null
      if (stored && featureFlags[stored]) {
        setActiveModuleState(stored)
      } else if (availableModules.length > 0 && !availableModules.includes(activeModuleState)) {
        setActiveModuleState(availableModules[0])
      }
    }
  }, [featureFlags])

  const setActiveModule = (module: ModuleType) => {
    if (featureFlags[module]) {
      setActiveModuleState(module)
      safeStorage.setItem('qrapp_active_module', module)
    }
  }

  // Ensure activeModule is valid
  const activeModule = featureFlags[activeModuleState]
    ? activeModuleState
    : availableModules[0] || 'cdc'

  return (
    <ModuleContext.Provider
      value={{
        activeModule,
        availableModules,
        featureFlags,
        cdcPeriods,
        loading,
        setActiveModule,
        refreshSettings,
      }}
    >
      {children}
    </ModuleContext.Provider>
  )
}

export const useModule = () => useContext(ModuleContext)
