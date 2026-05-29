'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { todayIST, isQrFresh } from '@/lib/utils'
import type { QrPayload } from '@/types'

type ScanResult = { type: 'success' | 'error' | 'duplicate'; message: string; studentName?: string; studentId?: string; session?: string }

export default function ScanPage() {
  const router = useRouter()
  const supabase = createClient()
  const scannerRef = useRef<any>(null)
  const [active, setActive] = useState(false)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [scanCount, setScanCount] = useState(0)
  const [sessionMode, setSessionMode] = useState<'FN' | 'AN'>('FN')
  const processingRef = useRef(false)

  // Get active session mode on mount
  useEffect(() => {
    const hour = new Date().getHours()
    setSessionMode(hour < 12 ? 'FN' : 'AN')
  }, [])

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

        // If the scanner was cancelled while starting up, stop it immediately
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

  async function handleQrCode(text: string) {
    if (processingRef.current) return
    processingRef.current = true

    try {
      let payload: QrPayload
      try {
        payload = JSON.parse(text)
      } catch {
        setResult({ type: 'error', message: 'Could not read QR code. Re-align code.' })
        return
      }

      if (!payload.student_id || !payload.ts) {
        setResult({ type: 'error', message: 'Invalid academic QR code structure' })
        return
      }

      if (!isQrFresh(payload.ts)) {
        setResult({ type: 'error', message: 'QR code expired. Ask student to tap refresh on dashboard.' })
        return
      }

      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        setResult({ type: 'error', message: 'Session expired. Please log out and log in again.' })
        return
      }

      const { data: profile } = await supabase
        .from('profiles').select('name').eq('id', user.id).single()

      const today = todayIST()

      const { data, error: rpcError } = await supabase.rpc('mark_attendance_safe', {
        p_student_id: payload.student_id,
        p_student_name: payload.name,
        p_department: payload.department,
        p_section: payload.section,
        p_year: payload.year,
        p_session: null, // Determined automatically by DB
        p_marked_by: user.id,
        p_marked_by_name: profile?.name ?? 'Faculty',
        p_date: today,
        p_timestamp: new Date().toISOString(),
      })

      if (rpcError) {
        setResult({ type: 'error', message: `Database error: ${rpcError.message}` })
        return
      }

      if (data?.success) {
        setScanCount((c) => c + 1)
        setResult({
          type: 'success',
          message: `Scanned Successfully`,
          studentName: payload.name,
          studentId: payload.student_id,
          session: data.session || (sessionMode + '1'),
        })
      } else {
        setResult({
          type: 'duplicate',
          message: data?.message ?? `Attendance already verified`,
          studentName: payload.name,
          studentId: payload.student_id,
        })
      }
    } catch (err: any) {
      setResult({ type: 'error', message: err?.message ?? 'An unexpected error occurred' })
    } finally {
      // Brief pause then clear result and allow next scan
      setTimeout(() => {
        setResult(null)
        processingRef.current = false
      }, 2500)
    }
  }

  return (
    <div className="space-y-6 max-w-lg mx-auto px-4 pb-12">
      {/* Header navbar */}
      <div className="flex items-center gap-4 bg-white/70 backdrop-blur-md border border-slate-200/50 p-4 rounded-3xl shadow-sm">
        <button onClick={() => router.back()} className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 hover:bg-slate-100 transition-colors">
          <span className="text-slate-600 font-bold text-sm">←</span>
        </button>
        <div>
          <h1 className="text-base font-extrabold text-slate-800 font-heading">QR Scanner</h1>
          <p className="text-xs text-slate-500 font-medium">
            Active: <span className="font-bold text-brand-600">Auto-Session Selection ({sessionMode})</span>
          </p>
        </div>
      </div>

      {/* Main Scanner Container */}
      <div className="card overflow-hidden p-0 rounded-[2rem] bg-slate-950 border border-white/5 relative">
        {/* Pulsing Scan overlay frame when active */}
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

      {/* High-Tech Animated Popup Sheets/Modals for Scan Results */}
      {result && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-fade-in">
          <div className="w-full max-w-sm glass-dark p-8 rounded-[2rem] border border-white/10 shadow-2xl text-center space-y-5 transform scale-100 transition-all duration-300 animate-slide-up">
            
            {result.type === 'success' && (
              <>
                <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center text-4xl mx-auto mb-2 animate-bounce">
                  ✓
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-lg font-bold text-white font-heading">Marked Present</h3>
                  <p className="text-brand-300 text-xs font-semibold tracking-wider uppercase bg-brand-500/10 border border-brand-500/25 px-2.5 py-1 rounded-md inline-block">
                    Session: {result.session}
                  </p>
                </div>
                <div className="p-4 bg-white/5 border border-white/5 rounded-2xl">
                  <p className="text-sm font-extrabold text-white">{result.studentName}</p>
                  <p className="text-[10px] font-mono text-slate-400 mt-1">ID: {result.studentId}</p>
                </div>
              </>
            )}

            {result.type === 'duplicate' && (
              <>
                <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center text-4xl mx-auto mb-2 animate-pulse">
                  ⚠️
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-lg font-bold text-amber-300 font-heading">Already Verified</h3>
                  <p className="text-slate-400 text-xs font-medium">This student's attendance is already registered for this session.</p>
                </div>
                <div className="p-4 bg-white/5 border border-white/5 rounded-2xl">
                  <p className="text-sm font-extrabold text-white">{result.studentName}</p>
                  <p className="text-[10px] font-mono text-slate-400 mt-1">ID: {result.studentId}</p>
                </div>
              </>
            )}

            {result.type === 'error' && (
              <>
                <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center text-4xl mx-auto mb-2">
                  ✕
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-lg font-bold text-red-400 font-heading">Scan Error</h3>
                  <p className="text-slate-300 text-xs font-semibold px-4">{result.message}</p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Real-time counters */}
      {active && (
        <div className="bg-white/70 backdrop-blur-md border border-slate-200/50 p-4 rounded-2xl shadow-sm text-center">
          <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Scans This Class Session</p>
          <p className="text-3xl font-extrabold text-brand-600 mt-1 font-heading">{scanCount}</p>
          <p className="text-[10px] text-slate-400 font-medium mt-1">Ready for next QR swipe...</p>
        </div>
      )}
    </div>
  )
}
