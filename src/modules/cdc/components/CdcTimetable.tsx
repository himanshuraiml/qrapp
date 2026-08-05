'use client'

import React, { useEffect, useState } from 'react'
import { useModule } from '@/context/ModuleContext'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import type { CdcPeriodAllocation } from '@/types'

interface PeriodData {
  subject?: string
  faculty_name?: string
  allocations: CdcPeriodAllocation[]
}

function isAllocationForFaculty(alloc: CdcPeriodAllocation, profile: any): boolean {
  if (!profile) return false
  if (alloc.faculty_id && alloc.faculty_id === profile.id) return true
  
  if (alloc.faculty_name && profile.name) {
    const cleanName = (n: string) =>
      n.toLowerCase().replace(/^(dr|prof|mr|mrs|ms)\.?\s+/i, '').trim()

    const allocFacClean = cleanName(alloc.faculty_name)
    const profileClean = cleanName(profile.name)

    if (allocFacClean === profileClean) return true
    if (allocFacClean.length >= 3 && profileClean.length >= 3 && (allocFacClean.includes(profileClean) || profileClean.includes(allocFacClean))) return true
  }

  return false
}

export default function CdcTimetable() {
  const { cdcPeriods, loading } = useModule()
  const { profile } = useAuth()
  const isFaculty = profile?.role === 'Faculty'

  const supabase = createClient()

  const currentDay = new Date().getDay()
  const initialDay = currentDay === 0 ? 1 : currentDay
  const [selectedDay, setSelectedDay] = useState<number>(initialDay)
  const [timetableMap, setTimetableMap] = useState<Record<number, PeriodData>>({})

  const DAYS = [
    { value: 1, label: 'Mon' },
    { value: 2, label: 'Tue' },
    { value: 3, label: 'Wed' },
    { value: 4, label: 'Thu' },
    { value: 5, label: 'Fri' },
    { value: 6, label: 'Sat' },
  ]

  useEffect(() => {
    supabase
      .from('cdc_timetable')
      .select('period_number, subject, faculty_name, allocations')
      .eq('day_of_week', selectedDay)
      .then(({ data }) => {
        const map: Record<number, PeriodData> = {}
        if (data) {
          data.forEach((row: any) => {
            let allocs: CdcPeriodAllocation[] = []
            if (Array.isArray(row.allocations) && row.allocations.length > 0) {
              allocs = row.allocations
            } else if (row.subject || row.faculty_name) {
              allocs = [
                {
                  id: 'legacy-1',
                  section_name: 'General',
                  subject: row.subject || 'CDC',
                  faculty_name: row.faculty_name || '',
                },
              ]
            }
            map[row.period_number] = {
              subject: row.subject,
              faculty_name: row.faculty_name,
              allocations: allocs,
            }
          })
        }
        setTimetableMap(map)
      })
  }, [supabase, selectedDay])

  if (loading) {
    return <div className="p-8 text-center animate-pulse text-slate-400">Loading CDC Timetable...</div>
  }

  const now = new Date()
  const currentMins = now.getHours() * 60 + now.getMinutes()
  const isTodaySelected = selectedDay === (currentDay === 0 ? 1 : currentDay)

  return (
    <div className="card bg-white p-6 space-y-6 border border-slate-100 shadow-sm rounded-2xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4 gap-2">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-indigo-50 text-indigo-700 border border-indigo-200 mb-1">
            {isFaculty ? 'Your Personal Schedule' : 'Official Daily Schedule'}
          </div>
          <h3 className="text-xl font-bold text-slate-800 font-heading">
            {isFaculty ? 'My Assigned CDC Period Schedule' : 'CDC Classes 8-Period Timetable'}
          </h3>
          <p className="text-xs text-slate-500">
            {isFaculty ? 'Showing your period classes and assigned sections from database' : 'Scheduled class periods from 9:00 AM to 5:00 PM'}
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200/60">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
          Today: {now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
        </div>
      </div>

      {/* Weekday Switcher Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {DAYS.map((d) => (
          <button
            key={d.value}
            onClick={() => setSelectedDay(d.value)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all ${
              selectedDay === d.value
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {d.label} {currentDay === d.value ? '• Today' : ''}
          </button>
        ))}
      </div>

      {/* 8 Periods Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cdcPeriods.map((p) => {
          const [sH, sM] = p.start_time.split(':').map(Number)
          const [eH, eM] = p.end_time.split(':').map(Number)
          const startMins = sH * 60 + sM
          const endMins = eH * 60 + eM
          const isCurrent = isTodaySelected && currentMins >= startMins && currentMins <= endMins
          const isPast = isTodaySelected && currentMins > endMins

          const periodData = timetableMap[p.period]
          const allAllocs = periodData?.allocations || []
          const allocs = isFaculty
            ? allAllocs.filter((alloc) => isAllocationForFaculty(alloc, profile))
            : allAllocs

          return (
            <div
              key={p.period}
              className={`p-4 rounded-2xl border transition-all duration-300 relative overflow-hidden flex flex-col justify-between min-h-[160px] ${
                isCurrent
                  ? 'bg-gradient-to-br from-indigo-50/80 to-indigo-100/60 border-indigo-500 shadow-md ring-2 ring-indigo-400/30'
                  : isPast
                  ? 'bg-slate-50/60 border-slate-200/80 opacity-90'
                  : 'bg-white border-slate-200 hover:border-indigo-200 hover:shadow-sm'
              }`}
            >
              {isCurrent && (
                <div className="absolute top-0 right-0 bg-indigo-600 text-white text-[9px] font-extrabold px-2 py-0.5 rounded-bl-lg uppercase tracking-wider">
                  Live Period
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs font-extrabold uppercase ${isCurrent ? 'text-indigo-700' : 'text-slate-500'}`}>
                    Period {p.period}
                  </span>
                  <span className="text-[10px] font-semibold text-slate-400">
                    {p.period <= 4 ? 'Forenoon' : 'Afternoon'}
                  </span>
                </div>

                {/* Allocated Classes or Free Period */}
                {allocs.length === 0 ? (
                  <div className="py-2 text-xs font-medium text-slate-400 italic">
                    Free Period (No class scheduled)
                  </div>
                ) : (
                  <div className="space-y-1.5 my-1">
                    {allocs.map((alloc, idx) => (
                      <div
                        key={alloc.id || idx}
                        className="p-1.5 bg-white/80 border border-slate-200/70 rounded-lg text-xs flex flex-col gap-0.5"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-extrabold text-indigo-950 bg-indigo-50 text-[11px] px-1.5 py-0.5 rounded border border-indigo-100">
                            {alloc.section_name || 'All Sections'}
                          </span>
                          <span className="text-[10px] font-extrabold text-indigo-600 bg-indigo-50/60 px-1 py-0.2 rounded">
                            {alloc.subject || 'CDC'}
                          </span>
                        </div>
                        {alloc.faculty_name && (
                          <div className="text-[11px] font-medium text-slate-600 truncate flex items-center gap-1">
                            <span>👨‍🏫</span> {alloc.faculty_name}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Time Range & Status */}
              <div className="flex items-center justify-between border-t border-slate-200/60 pt-2 text-xs font-bold text-slate-600 mt-2">
                <span className="flex items-center gap-1 text-indigo-600 text-[11px]">
                  ⏰ {p.start_time} - {p.end_time}
                </span>
                <span className={`text-[10px] font-extrabold ${isCurrent ? 'text-emerald-600' : isPast ? 'text-slate-400' : 'text-amber-600'}`}>
                  {isCurrent ? 'Ongoing' : isPast ? 'Completed' : 'Upcoming'}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
