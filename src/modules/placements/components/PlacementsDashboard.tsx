'use client'

import React from 'react'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'

export default function PlacementsDashboard() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'Admin'
  const drivesHref = isAdmin ? '/admin/placement-drives' : '/faculty/placement-drives'

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-r from-emerald-900 via-emerald-950 to-slate-900 border border-emerald-800/50 shadow-xl p-6 sm:p-8 text-white">
        <div className="relative z-10 space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-500/20 border border-emerald-400/30 text-emerald-300">
            🚀 Placement Drives Module
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight font-heading">
            Recruitment & Placement Drives
          </h1>
          <p className="text-emerald-200/80 text-xs sm:text-sm max-w-xl leading-relaxed">
            Manage recruiting companies, placement drives, candidate eligibility, drive attendance, and selection rounds.
          </p>
        </div>
      </div>

      {/* Overview Cards */}
      <div className={`grid grid-cols-1 ${isAdmin ? 'sm:grid-cols-3' : 'sm:grid-cols-2'} gap-4`}>
        <div className="card bg-white p-5 border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Placement Drives</p>
            <h3 className="text-2xl font-extrabold text-slate-800 font-heading">Active Drives</h3>
            <p className="text-xs text-emerald-600 font-semibold mt-1">Company Recruitment</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-2xl">
            🏢
          </div>
        </div>

        <div className="card bg-white p-5 border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Drive Actions</p>
            <Link
              href={drivesHref}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-xl shadow-md transition-all mt-2"
            >
              📋 View Placement Drives
            </Link>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-2xl">
            🎯
          </div>
        </div>

        {isAdmin && (
          <div className="card bg-white p-5 border border-slate-100 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Reports & Analytics</p>
              <Link
                href="/admin/placement-drives/reports"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-xl transition-all mt-2"
              >
                📊 Drive Reports
              </Link>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-2xl">
              📈
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
