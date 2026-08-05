'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useModule } from '@/context/ModuleContext'
import CdcDashboard from '@/modules/cdc/components/CdcDashboard'
import TrainingDashboard from '@/modules/training/components/TrainingDashboard'
import PlacementsDashboard from '@/modules/placements/components/PlacementsDashboard'
import ModuleShell from '@/components/shell/ModuleShell'

export default function AdminDashboard() {
  const { activeModule } = useModule()
  const router = useRouter()

  useEffect(() => {
    if (activeModule === 'placements') {
      router.replace('/admin/placement-drives')
    }
  }, [activeModule, router])

  if (activeModule === 'cdc') {
    return (
      <ModuleShell module="cdc" showNav={false}>
        <CdcDashboard />
      </ModuleShell>
    )
  }

  if (activeModule === 'placements') {
    return (
      <ModuleShell module="placements" showNav={false}>
        <div className="py-12 flex flex-col items-center justify-center space-y-2">
          <span className="w-8 h-8 border-3 border-brand-600 border-t-transparent rounded-full animate-spin"></span>
          <span className="text-xs text-slate-400 font-medium">Redirecting to Placement Drives...</span>
        </div>
      </ModuleShell>
    )
  }

  return (
    <ModuleShell module="training" showNav={false}>
      <TrainingDashboard />
    </ModuleShell>
  )
}
