'use client'

import React, { useState, useRef, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useModule } from '@/context/ModuleContext'
import type { ModuleType } from '@/types'
import { cn } from '@/lib/utils'

interface ModuleConfig {
  id: ModuleType
  name: string
  shortName: string
  icon: string
  badgeClass: string
  hoverClass: string
}

const MODULE_CONFIGS: ModuleConfig[] = [
  {
    id: 'cdc',
    name: 'CDC Classes',
    shortName: 'CDC',
    icon: '📚',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200/80 hover:bg-indigo-100',
    hoverClass: 'hover:bg-indigo-50 text-indigo-900',
  },
  {
    id: 'training',
    name: 'Placement Training',
    shortName: 'Training',
    icon: '🎯',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200/80 hover:bg-amber-100',
    hoverClass: 'hover:bg-amber-50 text-amber-900',
  },
  {
    id: 'placements',
    name: 'Placement Drives',
    shortName: 'Drives',
    icon: '🚀',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200/80 hover:bg-emerald-100',
    hoverClass: 'hover:bg-emerald-50 text-emerald-900',
  },
]

export default function ModuleNav({ className }: { className?: string }) {
  const { activeModule, availableModules, setActiveModule, loading } = useModule()
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const pathname = usePathname()

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (loading || availableModules.length <= 1) return null

  const visibleConfigs = MODULE_CONFIGS.filter((config) => availableModules.includes(config.id))
  const currentConfig = visibleConfigs.find((c) => c.id === activeModule) || visibleConfigs[0]

  const handleSelectModule = (moduleId: ModuleType) => {
    setActiveModule(moduleId)
    setOpen(false)

    // If on reports or settings page, stay on current page so view updates dynamically for the selected module
    if (
      pathname.startsWith('/admin/reports') ||
      pathname.startsWith('/faculty/reports') ||
      pathname.startsWith('/admin/settings') ||
      pathname.startsWith('/faculty/settings')
    ) {
      return
    }

    if (moduleId === 'placements') {
      if (pathname.startsWith('/faculty')) {
        router.push('/faculty/placement-drives')
        return
      }
      if (pathname.startsWith('/admin')) {
        router.push('/admin/placement-drives')
        return
      }
    }

    if (pathname !== '/admin' && pathname !== '/faculty' && (pathname.startsWith('/admin') || pathname.startsWith('/faculty'))) {
      const targetBase = pathname.startsWith('/faculty') ? '/faculty' : '/admin'
      router.push(targetBase)
    }
  }

  return (
    <div ref={dropdownRef} className={cn('relative inline-block text-left', className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold border shadow-sm transition-all duration-200 active:scale-95 cursor-pointer',
          currentConfig.badgeClass
        )}
      >
        <span className="text-sm">{currentConfig.icon}</span>
        <span className="font-extrabold">{currentConfig.name}</span>
        <svg
          className={cn('w-3.5 h-3.5 transition-transform duration-200 ml-0.5 opacity-70', open && 'rotate-180')}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 w-56 bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl border border-slate-200/80 p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
          <div className="px-2.5 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 border-b border-slate-100 mb-1">
            Switch Module
          </div>
          <div className="space-y-0.5">
            {visibleConfigs.map((m) => {
              const isActive = activeModule === m.id
              return (
                <button
                  key={m.id}
                  onClick={() => handleSelectModule(m.id)}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all text-left cursor-pointer',
                    isActive
                      ? 'bg-slate-900 text-white shadow-sm font-extrabold'
                      : cn('text-slate-700 hover:bg-slate-100', m.hoverClass)
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-base">{m.icon}</span>
                    <span>{m.name}</span>
                  </div>
                  {isActive && <span className="text-xs text-white">✓</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

