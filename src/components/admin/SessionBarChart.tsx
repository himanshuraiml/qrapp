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
  FN1: '#2563eb', // brand primary
  FN2: '#3b82f6',
  AN1: '#4f46e5', // indigo secondary
  AN2: '#6366f1',
}

interface Props {
  bySession: Partial<Record<SessionLabel, number>>
}

export default function SessionBarChart({ bySession }: Props) {
  const data: Array<{ session: SessionLabel; count: number }> = (
    ['FN1','FN2','AN1','AN2'] as SessionLabel[]
  ).map((s) => ({ session: s, count: bySession[s] ?? 0 }))

  const hasData = data.some((d) => d.count > 0)

  if (!hasData) {
    return (
      <div className="text-center py-12 space-y-2">
        <span className="text-3xl">📭</span>
        <p className="text-xs font-bold text-slate-400">No session scans recorded for this date</p>
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} barSize={38} margin={{ top: 8, right: 8, bottom: 0, left: -14 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis
          dataKey="session"
          tick={{ fontSize: 11, fill: '#64748b', fontWeight: 700 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 500 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: 'rgba(241, 245, 249, 0.4)' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const { session, count } = payload[0].payload
            return (
              <div className="bg-white/95 backdrop-blur-md border border-slate-100 rounded-2xl shadow-xl px-4 py-3 text-center">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{session}</p>
                <p className="text-lg font-extrabold text-slate-800 mt-1 font-heading">{count} scans</p>
              </div>
            )
          }}
        />
        <Bar dataKey="count" radius={[8, 8, 0, 0]}>
          {data.map((entry) => (
            <Cell key={entry.session} fill={SESSION_COLORS[entry.session]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
