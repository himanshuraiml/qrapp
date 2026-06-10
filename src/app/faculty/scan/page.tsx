'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { todayIST, isQrFresh } from '@/lib/utils'
import type { QrPayload } from '@/types'

type ScanResult = { type: 'success' | 'error' | 'duplicate'; message: string; studentName?: string; studentId?: string; session?: string }

interface OfflineScan {
  student_id: string
  name: string
  department: string
  section: string
  year: number
  batch: string | null
  timestamp: string // ISO timestamp of scan
  date: string // YYYY-MM-DD
}

export default function ScanPage() {
  const router = useRouter()
  const supabase = createClient()
  const scannerRef = useRef<any>(null)
  const [active, setActive] = useState(false)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [scanCount, setScanCount] = useState(0)
  const [sessionMode, setSessionMode] = useState<'FN' | 'AN'>('FN')
  const processingRef = useRef(false)

  // Fast scan states and refs
  const [recentScans, setRecentScans] = useState<Array<{
    id: string
    name: string
    session: string
    type: 'success' | 'duplicate' | 'error'
    time: string
    message?: string
  }>>([])
  const timeoutIdRef = useRef<NodeJS.Timeout | null>(null)

  // Haptic feedback & Offline queue states
  const [hapticsEnabled, setHapticsEnabled] = useState(true)
  const [offlineQueue, setOfflineQueue] = useState<OfflineScan[]>([])
  const [isSyncing, setIsSyncing] = useState(false)

  const offlineQueueRef = useRef(offlineQueue)
  const isSyncingRef = useRef(isSyncing)

  useEffect(() => {
    offlineQueueRef.current = offlineQueue
  }, [offlineQueue])

  useEffect(() => {
    isSyncingRef.current = isSyncing
  }, [isSyncing])

  // Get active session mode and load settings/queue on mount
  useEffect(() => {
    const hour = new Date().getHours()
    setSessionMode(hour < 12 ? 'FN' : 'AN')

    if (typeof window !== 'undefined') {
      const savedHaptics = localStorage.getItem('scan_haptics_enabled')
      if (savedHaptics !== null) {
        setHapticsEnabled(savedHaptics === 'true')
      }
      const savedQueue = localStorage.getItem('offline_scans_queue')
      if (savedQueue) {
        try {
          setOfflineQueue(JSON.parse(savedQueue))
        } catch (e) {
          console.error("Failed to parse offline scans queue", e)
        }
      }
    }
  }, [])

  const toggleHaptics = () => {
    setHapticsEnabled((prev) => {
      const newVal = !prev
      localStorage.setItem('scan_haptics_enabled', String(newVal))
      return newVal
    })
  }

  const triggerHaptic = (pattern: number[]) => {
    if (hapticsEnabled && typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(pattern)
      } catch (e) {
        console.warn("Haptic feedback error:", e)
      }
    }
  }

  // Restart scanner when user returns from phone call or tab switch
  useEffect(() => {
    if (!active) return

    function handleVisibility() {
      if (document.visibilityState === 'visible') {
        processingRef.current = false
        setActive(false)
        setTimeout(() => setActive(true), 600)
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [active])

  useEffect(() => {
    if (!active) return

    let html5QrCode: any
    let isCancelled = false

    async function startScanner() {
      try {
        const { Html5Qrcode } = await import('html5-qrcode')
        if (isCancelled) return

        html5QrCode = new Html5Qrcode('qr-reader')
        scannerRef.current = html5QrCode

        await html5QrCode.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 260, height: 260 } },
          handleQrCode,
          () => {}
        )

        if (isCancelled) {
          if (html5QrCode.isScanning) {
            await html5QrCode.stop()
          }
        }
      } catch {
        if (!isCancelled) {
          setResult({ type: 'error', message: 'Camera access denied. Enable camera permission.' })
          setActive(false)
        }
      }
    }

    startScanner()

    return () => {
      isCancelled = true
      if (html5QrCode) {
        if (html5QrCode.isScanning) {
          html5QrCode.stop().catch(() => {})
        }
      } else if (scannerRef.current) {
        if (scannerRef.current.isScanning) {
          scannerRef.current.stop().catch(() => {})
        }
      }
    }
  }, [active])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current)
      }
    }
  }, [])

  // Listen for keyboard events to dismiss popup instantly
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (result && (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ')) {
        e.preventDefault()
        dismissPopup()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [result])

  const addToRecentScans = (
    id: string,
    name: string,
    session: string,
    type: 'success' | 'duplicate' | 'error',
    message?: string
  ) => {
    const timeStr = new Date().toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    
    setRecentScans((prev) => {
      if (prev.length > 0 && prev[0].id === id && prev[0].type === type) {
        return prev
      }
      return [{ id, name, session, type, time: timeStr, message }, ...prev].slice(0, 5)
    })
  }

  const scheduleClear = (delay: number = 1200) => {
    if (timeoutIdRef.current) {
      clearTimeout(timeoutIdRef.current)
    }
    timeoutIdRef.current = setTimeout(() => {
      setResult(null)
      processingRef.current = false
    }, delay)
  }

  const dismissPopup = () => {
    if (timeoutIdRef.current) {
      clearTimeout(timeoutIdRef.current)
    }
    setResult(null)
    processingRef.current = false
  }

  const syncOfflineScans = useCallback(async () => {
    if (isSyncingRef.current || offlineQueueRef.current.length === 0) return
    setIsSyncing(true)

    if (!navigator.onLine) {
      setIsSyncing(false)
      alert('You are still offline. Please connect to the internet first.')
      return
    }

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        setIsSyncing(false)
        alert('Your session has expired. Please log out and log in again to sync.')
        return
      }

      const { data: profile } = await supabase
        .from('profiles').select('name').eq('id', user.id).single()
      const facultyName = profile?.name ?? 'Faculty'

      let successCount = 0
      let duplicateCount = 0
      let failureCount = 0
      let remainingQueue = [...offlineQueueRef.current]
      const processedScans = []

      for (const scan of offlineQueueRef.current) {
        try {
          const { data, error: rpcError } = await supabase.rpc('mark_attendance_safe', {
            p_student_id: scan.student_id,
            p_student_name: scan.name,
            p_department: scan.department,
            p_section: scan.section,
            p_year: scan.year,
            p_batch: scan.batch,
            p_session: null,
            p_marked_by: user.id,
            p_marked_by_name: facultyName,
            p_date: scan.date,
            p_timestamp: scan.timestamp,
          })

          if (rpcError) {
            if (rpcError.message?.includes('fetch') || rpcError.message?.includes('network') || rpcError.message?.includes('Failed to fetch')) {
              throw new Error('Network error during sync')
            }
            failureCount++
            remainingQueue = remainingQueue.filter(item => item.student_id !== scan.student_id)
            continue
          }

          if (data?.success) {
            successCount++
            const sessionLabel = data.session || (sessionMode + '1')
            processedScans.push({
              id: scan.student_id,
              name: scan.name,
              session: sessionLabel,
              type: 'success' as const,
              message: 'Marked Present (Synced)'
            })
          } else {
            duplicateCount++
            processedScans.push({
              id: scan.student_id,
              name: scan.name,
              session: sessionMode + '1',
              type: 'duplicate' as const,
              message: data?.message ?? 'Already Verified'
            })
          }

          remainingQueue = remainingQueue.filter(item => item.student_id !== scan.student_id)
        } catch (e) {
          console.error("Error syncing scan for student:", scan.student_id, e)
          break
        }
      }

      setOfflineQueue(remainingQueue)
      localStorage.setItem('offline_scans_queue', JSON.stringify(remainingQueue))

      if (successCount > 0) {
        setScanCount(c => c + successCount)
      }

      processedScans.forEach(scan => {
        addToRecentScans(scan.id, scan.name, scan.session, scan.type, scan.message)
      })

      let alertMsg = `Sync complete! `
      if (successCount > 0) alertMsg += `${successCount} present marked. `
      if (duplicateCount > 0) alertMsg += `${duplicateCount} already verified. `
      if (failureCount > 0) alertMsg += `${failureCount} failed. `
      if (remainingQueue.length > 0) alertMsg += `${remainingQueue.length} scans remaining in queue due to connection issues.`
      
      alert(alertMsg)
    } catch (e) {
      console.error("Sync failed", e)
      alert('An unexpected error occurred during sync.')
    } finally {
      setIsSyncing(false)
    }
  }, [supabase, sessionMode])

  // Auto-sync when system returns online
  useEffect(() => {
    const handleOnline = () => {
      if (offlineQueueRef.current.length > 0) {
        syncOfflineScans()
      }
    }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [syncOfflineScans])

  async function handleQrCode(text: string) {
    if (processingRef.current) return
    processingRef.current = true

    if (timeoutIdRef.current) {
      clearTimeout(timeoutIdRef.current)
    }

    try {
      let payload: QrPayload
      try {
        payload = JSON.parse(text)
      } catch {
        const errResult: ScanResult = { type: 'error', message: 'Could not read QR code. Re-align code.' }
        setResult(errResult)
        triggerHaptic([400])
        addToRecentScans('N/A', 'Malformed Code', 'N/A', 'error', 'Could not read QR code')
        scheduleClear(1200)
        return
      }

      if (!payload.student_id || !payload.ts) {
        const errResult: ScanResult = { type: 'error', message: 'Invalid academic QR code structure' }
        setResult(errResult)
        triggerHaptic([400])
        addToRecentScans('N/A', payload.name || 'Unknown Student', 'N/A', 'error', 'Invalid code structure')
        scheduleClear(1200)
        return
      }

      if (!isQrFresh(payload.ts)) {
        const errResult: ScanResult = { type: 'error', message: 'QR code expired. Ask student to tap refresh on dashboard.' }
        setResult(errResult)
        triggerHaptic([400])
        addToRecentScans(payload.student_id, payload.name, 'N/A', 'error', 'QR code expired')
        scheduleClear(1200)
        return
      }

      let userProfile: { name: string; id: string } | null = null
      let dbResult: any = null
      let networkErrorOccurred = false

      try {
        if (!navigator.onLine) {
          throw new TypeError('Failed to fetch (offline)')
        }

        const { data: { user }, error: userError } = await supabase.auth.getUser()
        if (userError) throw userError
        if (!user) {
          const errResult: ScanResult = { type: 'error', message: 'Session expired. Please log out and log in again.' }
          setResult(errResult)
          triggerHaptic([400])
          addToRecentScans(payload.student_id, payload.name, 'N/A', 'error', 'Session expired')
          scheduleClear(1200)
          return
        }

        const { data: profile } = await supabase
          .from('profiles').select('name').eq('id', user.id).single()

        userProfile = { name: profile?.name ?? 'Faculty', id: user.id }

        const today = todayIST()
        const { data, error: rpcError } = await supabase.rpc('mark_attendance_safe', {
          p_student_id: payload.student_id,
          p_student_name: payload.name,
          p_department: payload.department,
          p_section: payload.section,
          p_year: payload.year,
          p_batch: payload.batch,
          p_session: null,
          p_marked_by: user.id,
          p_marked_by_name: userProfile.name,
          p_date: today,
          p_timestamp: new Date().toISOString(),
        })

        if (rpcError) {
          if (rpcError.message?.includes('fetch') || rpcError.message?.includes('network') || rpcError.message?.includes('Failed to fetch')) {
            throw new TypeError('Failed to fetch (RPC network)')
          }
          const errResult: ScanResult = { type: 'error', message: `Database error: ${rpcError.message}` }
          setResult(errResult)
          triggerHaptic([400])
          addToRecentScans(payload.student_id, payload.name, 'N/A', 'error', rpcError.message)
          scheduleClear(1200)
          return
        }
        dbResult = data
      } catch (err: any) {
        if (err instanceof TypeError || err.message?.includes('fetch') || err.message?.includes('network') || err.message?.includes('Failed to fetch') || err.status === 0 || !navigator.onLine) {
          networkErrorOccurred = true
        } else {
          const errMsg = err?.message ?? 'An unexpected error occurred'
          setResult({ type: 'error', message: errMsg })
          triggerHaptic([400])
          addToRecentScans(payload.student_id, payload.name, 'N/A', 'error', errMsg)
          scheduleClear(1200)
          return
        }
      }

      // Handle offline fallback queueing
      if (networkErrorOccurred) {
        const isAlreadyOffline = offlineQueueRef.current.some(x => x.student_id === payload.student_id)
        if (isAlreadyOffline) {
          setResult({
            type: 'duplicate',
            message: 'Already queued offline for sync',
            studentName: payload.name,
            studentId: payload.student_id
          })
          triggerHaptic([400])
          addToRecentScans(payload.student_id, payload.name, sessionMode + '1', 'duplicate', 'Already in offline queue')
          scheduleClear(1200)
          return
        }

        const newScan: OfflineScan = {
          student_id: payload.student_id,
          name: payload.name,
          department: payload.department,
          section: payload.section,
          year: payload.year,
          batch: payload.batch || null,
          timestamp: new Date().toISOString(),
          date: todayIST()
        }

        const updatedQueue = [...offlineQueueRef.current, newScan]
        setOfflineQueue(updatedQueue)
        localStorage.setItem('offline_scans_queue', JSON.stringify(updatedQueue))

        triggerHaptic([100, 50, 100])

        setResult({
          type: 'success',
          message: 'Saved Offline (Pending Sync)',
          studentName: payload.name,
          studentId: payload.student_id,
          session: sessionMode + '1'
        })
        addToRecentScans(payload.student_id, payload.name, sessionMode + '1', 'success', 'Queued Offline')
        scheduleClear(1200)
        return
      }

      // Handle online response
      if (dbResult?.success) {
        setScanCount((c) => c + 1)
        const sess = dbResult.session || (sessionMode + '1')
        setResult({
          type: 'success',
          message: `Scanned Successfully`,
          studentName: payload.name,
          studentId: payload.student_id,
          session: sess,
        })
        triggerHaptic([100, 50, 100])
        addToRecentScans(payload.student_id, payload.name, sess, 'success', 'Marked Present')
        scheduleClear(1200)
      } else {
        const msg = dbResult?.message ?? `Attendance already verified`
        setResult({
          type: 'duplicate',
          message: msg,
          studentName: payload.name,
          studentId: payload.student_id,
        })
        triggerHaptic([400])
        addToRecentScans(payload.student_id, payload.name, (sessionMode + '1'), 'duplicate', msg)
        scheduleClear(1200)
      }
    } catch (err: any) {
      const errMsg = err?.message ?? 'An unexpected error occurred'
      setResult({ type: 'error', message: errMsg })
      triggerHaptic([400])
      addToRecentScans('N/A', 'Error', 'N/A', 'error', errMsg)
      scheduleClear(1200)
    }
  }

  return (
    <div className="space-y-6 max-w-lg mx-auto px-4 pb-12">
      <div className="flex items-center justify-between gap-4 bg-white/70 backdrop-blur-md border border-slate-200/50 p-4 rounded-3xl shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 hover:bg-slate-100 transition-colors">
            <span className="text-slate-600 font-bold text-sm">←</span>
          </button>
          <div>
            <h1 className="text-base font-extrabold text-slate-800 font-heading">QR Scanner</h1>
            <p className="text-xs text-slate-500 font-medium">
              Active: <span className="font-bold text-brand-600">Auto ({sessionMode})</span>
            </p>
          </div>
        </div>

        {/* Haptic Feedback Toggle */}
        <button 
          onClick={toggleHaptics} 
          className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-2xl border transition-all text-xs font-bold ${
            hapticsEnabled 
              ? 'bg-brand-50 border-brand-200 text-brand-700 shadow-sm shadow-brand-500/5' 
              : 'bg-slate-50 border-slate-200 text-slate-400'
          }`}
          title="Toggle vibration feedback"
        >
          <span>{hapticsEnabled ? '📳 Haptics On' : '📴 Haptics Off'}</span>
        </button>
      </div>

      {/* Offline Queue Sync Card */}
      {offlineQueue.length > 0 && (
        <div className="bg-amber-50 border border-amber-200/60 p-4 rounded-3xl shadow-sm flex items-center justify-between gap-4 animate-slide-up">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 flex items-center justify-center text-lg animate-pulse flex-shrink-0">
              ☁️
            </div>
            <div>
              <p className="text-xs font-extrabold text-amber-800">
                {offlineQueue.length} Pending Scan{offlineQueue.length > 1 ? 's' : ''} Offline
              </p>
              <p className="text-[10px] text-amber-600 font-medium mt-0.5">
                Saved locally. Sync when connection is restored.
              </p>
            </div>
          </div>
          <button
            onClick={syncOfflineScans}
            disabled={isSyncing}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold border transition-all flex-shrink-0 ${
              isSyncing
                ? 'bg-amber-100/50 border-amber-200 text-amber-400 cursor-not-allowed'
                : 'bg-amber-600 hover:bg-amber-700 border-amber-700 text-white shadow-sm active:scale-95'
            }`}
          >
            {isSyncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
      )}

      <div className="card overflow-hidden p-0 rounded-[2rem] bg-slate-950 border border-white/5 relative">
        {active && (
          <div className="absolute inset-0 z-20 pointer-events-none neon-scanner-border">
            <div className="scanner-laser"></div>
          </div>
        )}

        <div id="qr-reader" className="w-full relative z-10 min-h-[300px] bg-slate-900" />

        {!active ? (
          <div className="p-8 text-center space-y-4 relative z-20 bg-slate-950">
            <div className="w-16 h-16 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-400 flex items-center justify-center text-3xl mx-auto mb-2 animate-pulse">
              📷
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-white font-heading">Camera Access Required</h4>
              <p className="text-xs text-slate-400 max-w-xs mx-auto">
                Permissions are required to access camera device to sweep student QR codes.
              </p>
            </div>
            <button
              onClick={() => setActive(true)}
              className="btn-primary w-full py-3.5 font-bold shadow-xl shadow-brand-500/10 active:scale-98"
            >
              Start Attendance Scanner
            </button>
          </div>
        ) : (
          <div className="p-6 text-center bg-slate-950/80 backdrop-blur-md border-t border-white/5 relative z-20">
            <button
              onClick={() => {
                if (scannerRef.current?.isScanning) scannerRef.current.stop()
                setActive(false)
              }}
              className="btn-danger w-full py-3 font-bold"
            >
              Stop Camera Feed
            </button>
          </div>
        )}
      </div>

      {result && (
        <div 
          onClick={dismissPopup}
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-fade-in"
          style={{ animationDuration: '150ms' }}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm glass-dark p-6 rounded-[2rem] border border-white/10 shadow-2xl text-center space-y-4 transform scale-100 animate-slide-up"
            style={{ animationDuration: '150ms' }}
          >
            {result.type === 'success' && (
              <>
                <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center text-3xl mx-auto mb-1 animate-bounce">
                  ✓
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-white font-heading">Marked Present</h3>
                  <p className="text-brand-300 text-[10px] font-semibold tracking-wider uppercase bg-brand-500/10 border border-brand-500/25 px-2.5 py-0.5 rounded-md inline-block">
                    Session: {result.session}
                  </p>
                </div>
                <div className="p-3 bg-white/5 border border-white/5 rounded-2xl">
                  <p className="text-sm font-extrabold text-white">{result.studentName}</p>
                  <p className="text-[10px] font-mono text-slate-400 mt-0.5">ID: {result.studentId}</p>
                </div>
              </>
            )}

            {result.type === 'duplicate' && (
              <>
                <div className="w-14 h-14 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center text-3xl mx-auto mb-1">
                  ⚠️
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-amber-300 font-heading">
                    {result.message?.toLowerCase().includes('session') && !result.message?.toLowerCase().includes('already')
                      ? 'Invalid Scan Time'
                      : 'Already Verified'}
                  </h3>
                  <p className="text-slate-400 text-xs font-medium">
                    {result.message || 'Attendance is already registered for this session.'}
                  </p>
                </div>
                <div className="p-3 bg-white/5 border border-white/5 rounded-2xl">
                  <p className="text-sm font-extrabold text-white">{result.studentName}</p>
                  <p className="text-[10px] font-mono text-slate-400 mt-0.5">ID: {result.studentId}</p>
                </div>
              </>
            )}

            {result.type === 'error' && (
              <>
                <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center text-3xl mx-auto mb-1">
                  ✕
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-red-400 font-heading">Scan Error</h3>
                  <p className="text-slate-300 text-xs font-semibold px-4">{result.message}</p>
                </div>
              </>
            )}

            <button 
              onClick={dismissPopup}
              className="w-full py-2.5 px-4 bg-white/10 hover:bg-white/15 active:scale-98 rounded-xl text-white text-xs font-bold border border-white/10 transition-all mt-2"
            >
              Scan Next (Enter)
            </button>
          </div>
        </div>
      )}

      {active && (
        <div className="space-y-4">
          <div className="bg-white/70 backdrop-blur-md border border-slate-200/50 p-4 rounded-3xl shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Scans This Class Session</p>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5">Ready for next student QR...</p>
            </div>
            <div className="bg-brand-50 border border-brand-100 px-4 py-1.5 rounded-2xl flex items-center justify-center">
              <span className="text-2xl font-extrabold text-brand-600 font-heading">{scanCount}</span>
            </div>
          </div>

          <div className="bg-white/70 backdrop-blur-md border border-slate-200/50 p-5 rounded-[2rem] shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Recent Scans Feed</h3>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-100">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Live Feed
              </span>
            </div>

            {recentScans.length === 0 ? (
              <div className="text-center py-6 text-slate-400">
                <p className="text-xs font-medium">No students scanned yet in this session.</p>
                <p className="text-[10px] text-slate-400/80 mt-1">Scanned details will populate here in real-time.</p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                {recentScans.map((scan, i) => (
                  <div 
                    key={`${scan.id}-${i}`}
                    className="flex items-center justify-between p-3 rounded-2xl bg-white border border-slate-100 shadow-sm transition-all hover:border-slate-200 animate-slide-up"
                    style={{ animationDuration: '200ms' }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs flex-shrink-0 font-bold ${
                        scan.type === 'success' ? 'bg-emerald-50 text-emerald-500 border border-emerald-100' :
                        scan.type === 'duplicate' ? 'bg-amber-50 text-amber-500 border border-amber-100' :
                        'bg-red-50 text-red-500 border border-red-100'
                      }`}>
                        {scan.type === 'success' ? '✓' : scan.type === 'duplicate' ? '⚠️' : '✕'}
                      </div>

                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800 truncate">{scan.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[9px] font-mono text-slate-500 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded-md">
                            {scan.id}
                          </span>
                          <span className="text-[9px] font-bold text-slate-400">
                            {scan.session}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right flex-shrink-0">
                      <p className="text-[10px] font-semibold text-slate-500">{scan.time}</p>
                      <span className={`inline-block text-[8px] font-bold px-1.5 py-0.5 rounded-md mt-1 ${
                        scan.type === 'success' ? 'bg-emerald-100 text-emerald-700' :
                        scan.type === 'duplicate' ? 'bg-amber-100 text-amber-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {scan.type === 'success' ? 'Present' : scan.type === 'duplicate' ? 'Verified' : 'Error'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
