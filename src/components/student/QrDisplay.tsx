'use client'

import { useEffect, useState, useCallback } from 'react'
import type { QrPayload } from '@/types'

const QR_TTL = 30 // seconds before auto-refresh

interface Props {
  basePayload: QrPayload
}

export default function QrDisplay({ basePayload }: Props) {
  const [qrValue, setQrValue] = useState('')
  const [countdown, setCountdown] = useState(QR_TTL)
  const [QRCode, setQRCode] = useState<any>(null)
  const [lastGenerated, setLastGenerated] = useState<number>(0)

  // Lazy-load qrcode library (client-only)
  useEffect(() => {
    import('qrcode').then((mod) => setQRCode(() => mod.default ?? mod))
  }, [])

  const generateQr = useCallback(async () => {
    if (!QRCode) return
    const nowSec = Math.floor(Date.now() / 1000)
    const payload: QrPayload = {
      ...basePayload,
      ts: nowSec,
    }
    const dataUrl = await QRCode.toDataURL(JSON.stringify(payload), {
      width: 280,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    })
    setQrValue(dataUrl)
    setLastGenerated(nowSec)
    setCountdown(QR_TTL)
  }, [QRCode, basePayload])

  // Generate initial QR when library loads
  useEffect(() => {
    if (QRCode) generateQr()
  }, [QRCode, generateQr])

  // Countdown + auto-refresh based on physical elapsed time
  useEffect(() => {
    if (!QRCode || !lastGenerated) return
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
  }, [QRCode, lastGenerated, generateQr])

  // Refresh QR code automatically on tab visibility change or window focus
  useEffect(() => {
    if (!QRCode) return

    const handleActiveState = () => {
      if (document.visibilityState === 'visible') {
        generateQr()
      }
    }

    document.addEventListener('visibilitychange', handleActiveState)
    window.addEventListener('focus', handleActiveState)

    return () => {
      document.removeEventListener('visibilitychange', handleActiveState)
      window.removeEventListener('focus', handleActiveState)
    }
  }, [QRCode, generateQr])

  const pct = (countdown / QR_TTL) * 100
  const strokeColor = countdown > 15 ? '#2563eb' : countdown > 5 ? '#f59e0b' : '#ef4444'

  return (
    <div className="card-premium flex flex-col items-center gap-6 py-8 relative overflow-hidden group">
      {/* Dynamic background card decorations */}
      <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-brand-500 via-indigo-500 to-indigo-600"></div>
      <div className="absolute -top-12 -left-12 w-24 h-24 bg-brand-500/5 rounded-full blur-xl group-hover:bg-brand-500/10 transition-all duration-700"></div>

      <div className="text-center space-y-1">
        <h3 className="text-lg font-bold text-slate-800 font-heading">Your Attendance QR</h3>
        <p className="text-xs text-slate-500">Present this QR code to the faculty to mark your attendance</p>
      </div>

      {qrValue ? (
        <div className="relative p-4 bg-white rounded-3xl border border-slate-100 shadow-[0_10px_40px_rgba(0,0,0,0.03)] group-hover:scale-[1.02] transition-all duration-500">
          {/* Animated decorative corner borders */}
          <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-brand-500 rounded-tl-lg"></div>
          <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-brand-500 rounded-tr-lg"></div>
          <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-brand-500 rounded-bl-lg"></div>
          <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-brand-500 rounded-br-lg"></div>

          <img src={qrValue} alt="Student QR Code" className="rounded-2xl" width={240} height={240} />

          {/* Premium Countdown circle ring overlay */}
          <div className="absolute -bottom-2.5 -right-2.5">
            <svg width={48} height={48} className="drop-shadow-[0_4px_10px_rgba(0,0,0,0.08)]">
              <circle cx={24} cy={24} r={20} fill="white" />
              <circle
                cx={24} cy={24} r={20}
                fill="none"
                stroke="#f1f5f9"
                strokeWidth={3.5}
              />
              <circle
                cx={24} cy={24} r={20}
                fill="none"
                stroke={strokeColor}
                strokeWidth={3.5}
                strokeDasharray={`${2 * Math.PI * 20}`}
                strokeDashoffset={`${2 * Math.PI * 20 * (1 - pct / 100)}`}
                strokeLinecap="round"
                transform="rotate(-90 24 24)"
                style={{ transition: 'stroke-dashoffset 0.9s linear, stroke 0.3s' }}
              />
              <text
                x={24} y={28}
                textAnchor="middle"
                fontSize={11}
                fontWeight={800}
                fill={strokeColor}
                className="font-sans"
              >
                {countdown}s
              </text>
            </svg>
          </div>
        </div>
      ) : (
        <div className="w-[240px] h-[240px] bg-slate-50 border border-slate-100 rounded-3xl animate-pulse flex items-center justify-center">
          <span className="text-slate-400 text-xs font-semibold">Generating QR...</span>
        </div>
      )}

      <div className="text-center space-y-3">
        <p className="text-xs text-slate-400 font-medium">
          QR refreshes automatically · Fresh code ensures validity
        </p>
        <button
          onClick={generateQr}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold text-brand-600 bg-brand-50 hover:bg-brand-100 transition-all duration-300 transform active:scale-95 shadow-sm"
        >
          <span>🔄</span>
          <span>Refresh Now</span>
        </button>
      </div>
    </div>
  )
}
