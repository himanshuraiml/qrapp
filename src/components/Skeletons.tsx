'use client'

export function CardSkeleton() {
  return (
    <div className="card space-y-4 animate-pulse">
      <div className="w-12 h-12 bg-slate-100 rounded-2xl border border-slate-200/40"></div>
      <div className="space-y-2">
        <div className="w-1/3 h-2 bg-slate-100 rounded-full"></div>
        <div className="w-2/3 h-4 bg-slate-100 rounded-full"></div>
      </div>
    </div>
  )
}

export function ListSkeleton() {
  return (
    <div className="space-y-3.5 py-4 animate-pulse">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
          <div className="space-y-2">
            <div className="w-24 h-3 bg-slate-100 rounded-full"></div>
            <div className="w-48 h-2 bg-slate-100 rounded-full"></div>
          </div>
          <div className="space-y-1.5 flex flex-col items-end">
            <div className="w-12 h-4 bg-slate-100 rounded-full"></div>
            <div className="w-16 h-2 bg-slate-100 rounded-full"></div>
          </div>
        </div>
      ))}
    </div>
  )
}

export function RosterSkeleton() {
  return (
    <div className="space-y-4 animate-pulse py-6">
      <div className="flex justify-between items-center pb-4 border-b border-slate-100">
        <div className="flex gap-2">
          <div className="w-16 h-5 bg-slate-100 rounded-xl"></div>
          <div className="w-16 h-5 bg-slate-100 rounded-xl"></div>
          <div className="w-16 h-5 bg-slate-100 rounded-xl"></div>
        </div>
        <div className="flex gap-2">
          <div className="w-20 h-8 bg-slate-100 rounded-xl"></div>
          <div className="w-20 h-8 bg-slate-100 rounded-xl"></div>
        </div>
      </div>
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-12 bg-slate-100 rounded-2xl border border-slate-100"></div>
        ))}
      </div>
    </div>
  )
}
