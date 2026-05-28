import { cn } from '@/lib/utils'

type Color = 'blue' | 'purple' | 'green' | 'amber' | 'red'

const COLOR_MAP: Record<Color, { bg: string; text: string; ring: string; textHighlight: string }> = {
  blue:   { bg: 'bg-blue-50/70 border-blue-100',   text: 'text-blue-700',   ring: 'ring-blue-100/50', textHighlight: 'text-blue-600' },
  purple: { bg: 'bg-purple-50/70 border-purple-100', text: 'text-purple-700', ring: 'ring-purple-100/50', textHighlight: 'text-purple-600' },
  green:  { bg: 'bg-green-50/70 border-green-100',  text: 'text-green-700',  ring: 'ring-green-100/50', textHighlight: 'text-green-600' },
  amber:  { bg: 'bg-amber-50/70 border-amber-100',  text: 'text-amber-700',  ring: 'ring-amber-100/50', textHighlight: 'text-amber-600' },
  red:    { bg: 'bg-red-50/70 border-red-100',    text: 'text-red-700',    ring: 'ring-red-100/50', textHighlight: 'text-red-600' },
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
    <div className="card flex flex-col gap-4 group hover:border-brand-500/20 transition-all duration-300">
      <div className={cn('w-12 h-12 rounded-2xl flex items-center justify-center text-2xl ring-4 shadow-sm border transition-all duration-500 group-hover:scale-105 group-hover:rotate-3', c.bg, c.ring)}>
        {icon}
      </div>
      <div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{label}</p>
        <p className={cn('text-3xl font-extrabold tracking-tight mt-1 font-heading', c.textHighlight)}>{value}</p>
        {sub && <p className="text-[10px] text-slate-400 font-semibold mt-1">{sub}</p>}
      </div>
    </div>
  )
}
