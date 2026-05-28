'use client'

interface Props {
  title: string
  description?: string
  icon?: string
}

export default function EmptyState({ title, description, icon = '📭' }: Props) {
  return (
    <div className="flex flex-col items-center justify-center text-center p-8 py-12 rounded-[2rem] border border-slate-100 bg-white/50 backdrop-blur-md space-y-4">
      <div className="w-16 h-16 rounded-full bg-slate-50 border border-slate-100 shadow-sm flex items-center justify-center text-3xl animate-pulse">
        {icon}
      </div>
      <div className="space-y-1 max-w-xs">
        <h4 className="text-sm font-extrabold text-slate-800 font-heading">{title}</h4>
        {description && (
          <p className="text-xs text-slate-400 font-semibold leading-relaxed">{description}</p>
        )}
      </div>
    </div>
  )
}
