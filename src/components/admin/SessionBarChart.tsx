'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import type { SessionLabel } from '@/types'

const SESSION_COLORS: Record<string, string> = {
  FN1: '#3b82f6',
  FN2: '#60a5fa',
  FN3: '#93c5fd',
  AN1: '#f59e0b',
  AN2: '#fbbf24',
  AN3: '#fcd34d',
}

interface Props {
  bySession: Partial<Record<SessionLabel, number>>
}

export default function SessionBarChart({ bySession }: Props) {
  const data: Array<{ session: SessionLabel; count: number }> = (
    ['FN1','FN2','FN3','AN1','AN2','AN3'] as SessionLabel[]
  ).map((s) => ({ session: s, count: bySession[s] ?? 0 }))

  const hasData = data.some((d) => d.count > 0)

  if (!hasData) {
    return (
      <p className="text-sm text-slate-400 text-center py-10">
        No scans recorded for this date.
      </p>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} barSize={36} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis
          dataKey="session"
          tick={{ fontSize: 12, fill: '#64748b', fontWeight: 600 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: '#f8fafc' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const { session, count } = payload[0].payload
            return (
              <div className="bg-white border border-slate-100 rounded-xl shadow-lg px-4 py-2.5">
                <p className="text-xs font-semibold text-slate-500">{session}</p>
                <p className="text-lg font-bold text-slate-900">{count} scans</p>
              </div>
            )
          }}
        />
        <Bar dataKey="count" radius={[6, 6, 0, 0]}>
          {data.map((entry) => (
            <Cell key={entry.session} fill={SESSION_COLORS[entry.session]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
