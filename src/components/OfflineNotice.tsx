'use client'

import { useEffect, useState } from 'react'

interface OfflineNoticeProps {
  message?: string
}

export default function OfflineNotice({ message = 'Offline Mode — Connect to internet to view complete history & server reports' }: OfflineNoticeProps) {
  const [isOffline, setIsOffline] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsOffline(!navigator.onLine)

      const handleOnline = () => setIsOffline(false)
      const handleOffline = () => setIsOffline(true)

      window.addEventListener('online', handleOnline)
      window.addEventListener('offline', handleOffline)

      return () => {
        window.removeEventListener('online', handleOnline)
        window.removeEventListener('offline', handleOffline)
      }
    }
  }, [])

  if (!isOffline) return null

  return (
    <div className="bg-amber-500/15 border border-amber-500/30 text-amber-900 rounded-xl p-3 text-xs flex items-center gap-2 mb-4 animate-fadeIn">
      <svg className="w-4 h-4 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728m-2.828-2.828a5 5 0 010-7.071m-4.243 4.243a1 1 0 11-1.414-1.414 1 1 0 011.414 1.414z" />
      </svg>
      <span className="font-medium">{message}</span>
    </div>
  )
}
