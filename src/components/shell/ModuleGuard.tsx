'use client'

import React from 'react'
import { useModule } from '@/context/ModuleContext'
import type { ModuleType } from '@/types'

interface ModuleGuardProps {
  module: ModuleType
  children: React.ReactNode
  fallback?: React.ReactNode
}

export default function ModuleGuard({ module, children, fallback }: ModuleGuardProps) {
  const { featureFlags, loading } = useModule()

  if (loading) {
    return (
      <div className="p-8 text-center animate-pulse">
        <div className="h-6 w-32 bg-slate-200 rounded-full mx-auto mb-4" />
        <div className="h-20 max-w-md bg-slate-100 rounded-2xl mx-auto" />
      </div>
    )
  }

  if (!featureFlags[module]) {
    if (fallback) return <>{fallback}</>

    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center p-8 text-center bg-white/60 backdrop-blur-md rounded-3xl border border-slate-200/80 shadow-sm my-6 max-w-2xl mx-auto">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 mb-4 text-2xl shadow-inner">
          🔒
        </div>
        <h3 className="text-xl font-bold text-slate-800 font-heading">Module Not Available</h3>
        <p className="text-sm text-slate-500 max-w-md mt-2 leading-relaxed">
          The <span className="font-semibold text-slate-700 uppercase tracking-wide">{module}</span> module is currently turned off for your institution.
        </p>
        <p className="text-xs text-slate-400 mt-4 bg-slate-100/80 px-4 py-2 rounded-xl">
          Contact your system administrator if you require access to this feature.
        </p>
      </div>
    )
  }

  return <>{children}</>
}
