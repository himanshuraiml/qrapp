'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { todayIST, isQrFresh } from '@/lib/utils'
import type { QrPayload, SessionLabel } from '@/types'

type ScanResult = { type: 'success' | 'error' | 'duplicate'; message: string }

export default function ScanPage() {
  const router = useRouter()
  const supabase = createClient()
  const scannerRef = useRef<any>(null)
  const [active, setActive]       = useState(false)
  const [result, setResult]       = useState<ScanResult | null>(null)
  const [scanCount, setScanCount] = useState(0)
  const [sessionMode, setSessionMode] = useState<'FN' | 'AN'>('FN')
  const processingRef = useRef(false)

  // Get active session mode on mount
  useEffect(() => {
    const hour = new Date().getHours()
    setSessionMode(hour < 12 ? 'FN' : 'AN')
  }, [])

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
      const payload: QrPayload = JSON.parse(text)

      if (!payload.student_id || !payload.ts) {
        setResult({ type: 'error', message: 'Invalid QR code' })
        return
      }

      if (!isQrFresh(payload.ts)) {
        setResult({ type: 'error', message: 'QR code expired. Ask student to refresh.' })
        return
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('profiles').select('name').eq('id', user.id).single()

      const today = todayIST()

      const { data } = await supabase.rpc('mark_attendance_safe', {
        p_student_id:     payload.student_id,
        p_student_name:   payload.name,
        p_department:     payload.department,
        p_section:        payload.section,
        p_year:           payload.year,
        p_session:        null, // Determined automatically by DB
        p_marked_by:      user.id,
        p_marked_by_name: profile?.name ?? 'Faculty',
        p_date:           today,
        p_timestamp:      new Date().toISOString(),
      })

      if (data?.success) {
        setScanCount((c) => c + 1)
        setResult({
          type: 'success',
          message: `✓ ${payload.name} — ${data.session || (sessionMode + '1')}`,
        })
      } else {
        setResult({
          type: 'duplicate',
          message: data?.message ?? `Already marked: ${payload.name}`,
        })
      }
    } catch {
      setResult({ type: 'error', message: 'Could not read QR code' })
    } finally {
      // Brief pause then clear result and allow next scan
      setTimeout(() => {
        setResult(null)
        processingRef.current = false
      }, 1800)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="btn-secondary px-3 py-2 text-sm">← Back</button>
        <div>
          <h1 className="text-xl font-bold text-slate-900">QR Scanner</h1>
          <p className="text-sm text-slate-500">
            Active session: <span className="font-semibold text-brand-600">
              {sessionMode === 'FN' ? 'Forenoon (Auto-Advancing)' : 'Afternoon (Auto-Advancing)'}
            </span>
          </p>
        </div>
      </div>

      {/* Scanner */}
      <div className="card overflow-hidden p-0">
        <div id="qr-reader" className="w-full" />

        {!active && (
          <div className="p-6 text-center">
            <button onClick={() => setActive(true)} className="btn-primary">
              Start Camera
            </button>
            <p className="text-xs text-slate-400 mt-2">Requires camera permission</p>
          </div>
        )}

        {active && (
          <div className="p-4 text-center">
            <button
              onClick={() => {
                if (scannerRef.current?.isScanning) scannerRef.current.stop()
                setActive(false)
              }}
              className="btn-secondary text-sm"
            >
              Stop Camera
            </button>
          </div>
        )}
      </div>

      {/* Result banner */}
      {result && (
        <div className={`card p-4 text-sm font-medium text-center
          ${result.type === 'success'   ? 'bg-green-50 border-green-200 text-green-700' :
            result.type === 'duplicate' ? 'bg-amber-50 border-amber-200 text-amber-700' :
                                          'bg-red-50 border-red-200 text-red-700'}`}
        >
          {result.message}
        </div>
      )}

      {/* Scan counter */}
      {active && (
        <div className="text-center text-sm text-slate-500">
          {scanCount} student{scanCount !== 1 ? 's' : ''} scanned this session
        </div>
      )}
    </div>
  )
}
