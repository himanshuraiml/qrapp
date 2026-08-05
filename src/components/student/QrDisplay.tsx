'use client'

import { useEffect, useState, useCallback } from 'react'

const QR_TTL = 60 // seconds before auto-refresh

export default function QrDisplay() {
  const [qrValue, setQrValue] = useState('')
  const [countdown, setCountdown] = useState(QR_TTL)
  const [QRCode, setQRCode] = useState<any>(null)
  const [lastGenerated, setLastGenerated] = useState<number>(0)
  const [error, setError] = useState('')
  const [isOfflinePass, setIsOfflinePass] = useState(false)
  const [currentTimeStr, setCurrentTimeStr] = useState('')

  // Lazy-load qrcode library (client-only)
  useEffect(() => {
    import('qrcode').then((mod) => setQRCode(() => mod.default ?? mod))
  }, [])

  // Live anti-screenshot clock ticker
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTimeStr(new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // Render QR from offline pass cached in localStorage
  const renderOfflineFallback = useCallback(async () => {
    if (!QRCode) return false
    try {
      const cachedToken = localStorage.getItem('student_daily_offline_pass')
      const cachedDate = localStorage.getItem('student_daily_offline_pass_date')
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

      if (cachedToken) {
        if (cachedDate && cachedDate !== today) {
          setError(`Offline pass from ${cachedDate} has expired. Please connect to the internet once to update today's pass.`)
          return false
        }
        const dataUrl = await QRCode.toDataURL(cachedToken, {
          width: 280,
          margin: 2,
          color: { dark: '#1e1b4b', light: '#ffffff' },
          errorCorrectionLevel: 'M',
        })
        setQrValue(dataUrl)
        setIsOfflinePass(true)
        setError('')
        return true
      }
    } catch (e) {
      console.warn("Failed to render offline QR fallback:", e)
    }
    return false
  }, [QRCode])

  // Payload is fetched fresh from the server on every refresh — it is
  // signed there (see /api/attendance/qr-token) so the browser never gets
  // to construct or influence the value that will later be trusted by the
  // faculty scanner.
  const generateQr = useCallback(async () => {
    if (!QRCode) return

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const rendered = await renderOfflineFallback()
      if (rendered) return
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 8000)

    try {
      const res = await fetch('/api/attendance/qr-token', { cache: 'no-store', signal: controller.signal })
      clearTimeout(timeoutId)
      if (!res.ok) {
        const errJson = await res.json().catch(() => null)
        console.warn('QR token fetch failed:', res.status, errJson)
        const rendered = await renderOfflineFallback()
        if (!rendered) setError(errJson?.error || 'Could not load your QR code. Try refreshing.')
        return
      }
      const data = await res.json()

      // Auto-cache offline pass token for today
      if (data.offline_pass?.token && typeof window !== 'undefined') {
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
        localStorage.setItem('student_daily_offline_pass', data.offline_pass.token)
        localStorage.setItem('student_daily_offline_pass_date', today)
      }

      const dataUrl = await QRCode.toDataURL(data.token, {
        width: 280,
        margin: 2,
        color: { dark: '#0f172a', light: '#ffffff' },
        errorCorrectionLevel: 'M',
      })
      setQrValue(dataUrl)
      setIsOfflinePass(false)
      setError('')
      setLastGenerated(Math.floor(Date.now() / 1000))
      setCountdown(QR_TTL)
    } catch (e) {
      console.warn('QR token fetch exception:', e)
      const rendered = await renderOfflineFallback()
      if (!rendered) setError('Could not load your QR code. Try refreshing.')
    }
  }, [QRCode, renderOfflineFallback])

  // Generate initial QR when library loads
  useEffect(() => {
    if (QRCode) generateQr()
  }, [QRCode, generateQr])

  // Countdown + auto-refresh based on physical elapsed time
  useEffect(() => {
    if (!QRCode || !lastGenerated || isOfflinePass) return
    const tick = setInterval(() => {
      const nowSec = Math.floor(Date.now() / 1000)
      const elapsed = nowSec - lastGenerated
      const remaining = QR_TTL - elapsed

      if (remaining <= 0) {
        generateQr()
      } else {
        setCountdown(remaining)
      }
    }, 1000)
    return () => clearInterval(tick)
  }, [QRCode, lastGenerated, generateQr, isOfflinePass])

  // Refresh QR code automatically on tab visibility change or window focus (throttled to 30s)
  useEffect(() => {
    if (!QRCode) return

    const handleActiveState = () => {
      if (document.visibilityState === 'visible') {
        const nowSec = Math.floor(Date.now() / 1000)
        if (nowSec - lastGenerated > 30) {
          generateQr()
        }
      }
    }

    document.addEventListener('visibilitychange', handleActiveState)
    window.addEventListener('focus', handleActiveState)

    return () => {
      document.removeEventListener('visibilitychange', handleActiveState)
      window.removeEventListener('focus', handleActiveState)
    }
  }, [QRCode, generateQr, lastGenerated])

  const pct = (countdown / QR_TTL) * 100
  const strokeColor = countdown > 15 ? '#2563eb' : countdown > 5 ? '#f59e0b' : '#ef4444'

  return (
    <div className="clay-card p-6 sm:p-8 flex flex-col items-center gap-6 relative overflow-hidden group">
      {/* Soft ambient gradient overlay */}
      <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-brand-500 via-indigo-500 to-purple-500 rounded-t-full"></div>
      <div className="absolute -top-16 -left-16 w-32 h-32 bg-brand-500/10 rounded-full blur-2xl group-hover:bg-brand-500/20 transition-all duration-700 pointer-events-none"></div>

      <div className="text-center space-y-1.5">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider text-brand-700 bg-brand-50/80 border border-brand-200/60 clay-badge">
          <span>📲</span>
          <span>Live Digital Pass</span>
        </div>
        <h3 className="text-xl font-extrabold text-slate-800 font-heading tracking-tight">Your Attendance QR</h3>
        <p className="text-xs text-slate-500 font-medium max-w-xs mx-auto">Present this code to your faculty to verify attendance</p>
        
        {isOfflinePass ? (
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 mt-1 rounded-full text-xs font-extrabold text-amber-900 bg-amber-100/90 border border-amber-300/80 clay-badge animate-pulse">
            <span>⚡</span>
            <span>Offline Pass Active (Valid Today)</span>
          </div>
        ) : (
          error && <p className="text-xs font-bold text-red-500 mt-1">{error}</p>
        )}
      </div>

      {qrValue ? (
        <div className="relative p-5 bg-white rounded-[2.25rem] shadow-[inset_6px_6px_14px_rgba(255,255,255,1),inset_-6px_-6px_14px_rgba(0,0,0,0.05),0_20px_40px_-10px_rgba(79,70,229,0.15)] border border-slate-100 group-hover:scale-[1.02] transition-all duration-500">
          {/* Tactile corner brackets */}
          <div className="absolute top-3 left-3 w-5 h-5 border-t-3 border-l-3 border-brand-500 rounded-tl-xl"></div>
          <div className="absolute top-3 right-3 w-5 h-5 border-t-3 border-r-3 border-brand-500 rounded-tr-xl"></div>
          <div className="absolute bottom-3 left-3 w-5 h-5 border-b-3 border-l-3 border-brand-500 rounded-bl-xl"></div>
          <div className="absolute bottom-3 right-3 w-5 h-5 border-b-3 border-r-3 border-brand-500 rounded-br-xl"></div>

          <img src={qrValue} alt="Student QR Code" className="rounded-2xl" width={230} height={230} />

          {/* Premium Countdown circle ring overlay */}
          {!isOfflinePass && (
            <div className="absolute -bottom-3 -right-3">
              <svg width={52} height={52} className="drop-shadow-lg">
                <circle cx={26} cy={26} r={21} fill="white" className="clay-badge" />
                <circle
                  cx={26} cy={26} r={21}
                  fill="none"
                  stroke="#e2e8f0"
                  strokeWidth={4}
                />
                <circle
                  cx={26} cy={26} r={21}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={4}
                  strokeDasharray={`${2 * Math.PI * 21}`}
                  strokeDashoffset={`${2 * Math.PI * 21 * (1 - pct / 100)}`}
                  strokeLinecap="round"
                  transform="rotate(-90 26 26)"
                  style={{ transition: 'stroke-dashoffset 0.9s linear, stroke 0.3s' }}
                />
                <text
                  x={26} y={30}
                  textAnchor="middle"
                  fontSize={12}
                  fontWeight={800}
                  fill={strokeColor}
                  className="font-sans"
                >
                  {countdown}s
                </text>
              </svg>
            </div>
          )}
        </div>
      ) : (
        <div className="w-[230px] h-[230px] bg-slate-50 rounded-[2.25rem] clay-card animate-pulse flex flex-col items-center justify-center gap-2">
          <span className="w-6 h-6 border-3 border-brand-600 border-t-transparent rounded-full animate-spin"></span>
          <span className="text-slate-400 text-xs font-semibold">Generating QR...</span>
        </div>
      )}

      {/* Anti-screenshot live verification clay badge */}
      {currentTimeStr && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-slate-50/90 rounded-full border border-slate-200/80 text-[11px] text-slate-600 font-mono font-bold clay-badge">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
          <span>Live Verified · {currentTimeStr}</span>
        </div>
      )}

      <div className="text-center space-y-3 pt-1">
        <p className="text-xs text-slate-400 font-medium">
          {isOfflinePass
            ? 'Using pre-fetched offline pass · Reconnects automatically'
            : 'Refreshes every 60s for anti-fraud verification'}
        </p>
        <button
          onClick={generateQr}
          className="clay-button-secondary inline-flex items-center gap-2 px-5 py-2.5 text-xs font-extrabold text-brand-600"
        >
          <span>🔄</span>
          <span>Refresh Token</span>
        </button>
      </div>
    </div>
  )
}
