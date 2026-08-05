'use client'

import React from 'react'
import ModuleNav from './ModuleNav'
import ModuleGuard from './ModuleGuard'
import type { ModuleType } from '@/types'
import { useModule } from '@/context/ModuleContext'

interface ModuleShellProps {
  children: React.ReactNode
  module?: ModuleType
  showNav?: boolean
}

export default function ModuleShell({ children, module, showNav = false }: ModuleShellProps) {
  const { activeModule } = useModule()
  const targetModule = module || activeModule

  return (
    <div className="space-y-6">
      {showNav && (
        <div className="flex items-center justify-between gap-4">
          <ModuleNav />
        </div>
      )}
      <ModuleGuard module={targetModule}>{children}</ModuleGuard>
    </div>
  )
}
