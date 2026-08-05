'use client'

import React from 'react'
import ModuleShell from '@/components/shell/ModuleShell'
import TrainingDashboard from '@/modules/training/components/TrainingDashboard'

export default function AdminTrainingPage() {
  return (
    <ModuleShell module="training">
      <TrainingDashboard />
    </ModuleShell>
  )
}
