import { cn } from '@/lib/utils'

type Color = 'blue' | 'purple' | 'green' | 'amber' | 'red'

const COLOR_MAP: Record<Color, { bg: string; text: string; ring: string }> = {
  blue:   { bg: 'bg-blue-50',   text: 'text-blue-700',   ring: 'ring-blue-100' },
  purple: { bg: 'bg-purple-50', text: 'text-purple-700', ring: 'ring-purple-100' },
  green:  { bg: 'bg-green-50',  text: 'text-green-700',  ring: 'ring-green-100' },
  amber:  { bg: 'bg-amber-50',  text: 'text-amber-700',  ring: 'ring-amber-100' },
  red:    { bg: 'bg-red-50',    text: 'text-red-700',    ring: 'ring-red-100' },
}

interface Props {
  label: string
  value: string | number
  icon: string
  color: Color
  sub?: string
}

export default function StatsCard({ label, value, icon, color, sub }: Props) {
  const c = COLOR_MAP[color]
  return (
    <div className="card flex flex-col gap-3 group">
      <div className={cn('w-12 h-12 rounded-2xl flex items-center justify-center text-2xl ring-1 shadow-inner group-hover:scale-110 transition-transform duration-300', c.bg, c.ring)}>
        {icon}
      </div>
      <div className="mt-2">
        <p className={cn('text-3xl font-bold tracking-tight', c.text)}>{value}</p>
        <p className="text-sm font-medium text-slate-500 mt-1 uppercase tracking-wider">{label}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}
