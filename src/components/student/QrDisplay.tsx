'use client'

import { useEffect, useState, useCallback } from 'react'
import type { QrPayload } from '@/types'

const QR_TTL = 30 // seconds before auto-refresh

interface Props {
  basePayload: QrPayload
}

export default function QrDisplay({ basePayload }: Props) {
  const [qrValue, setQrValue]           = useState('')
  const [countdown, setCountdown]       = useState(QR_TTL)
  const [QRCode, setQRCode]             = useState<any>(null)
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
      color: { dark: '#1e1b4b', light: '#ffffff' },
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
  const strokeColor = countdown > 10 ? '#6366f1' : countdown > 5 ? '#f59e0b' : '#ef4444'

  return (
    <div className="card flex flex-col items-center gap-4 py-6">
      <p className="text-sm font-semibold text-slate-600">Your Attendance QR</p>

      {qrValue ? (
        <div className="relative">
          <img src={qrValue} alt="Student QR Code" className="rounded-xl" width={280} height={280} />

          {/* Countdown ring overlay */}
          <div className="absolute -bottom-3 -right-3">
            <svg width={44} height={44} className="drop-shadow-md">
              <circle cx={22} cy={22} r={18} fill="white" />
              <circle
                cx={22} cy={22} r={18}
                fill="none"
                stroke="#e2e8f0"
                strokeWidth={3}
              />
              <circle
                cx={22} cy={22} r={18}
                fill="none"
                stroke={strokeColor}
                strokeWidth={3}
                strokeDasharray={`${2 * Math.PI * 18}`}
                strokeDashoffset={`${2 * Math.PI * 18 * (1 - pct / 100)}`}
                strokeLinecap="round"
                transform="rotate(-90 22 22)"
                style={{ transition: 'stroke-dashoffset 0.9s linear, stroke 0.3s' }}
              />
              <text
                x={22} y={26}
                textAnchor="middle"
                fontSize={12}
                fontWeight={700}
                fill={strokeColor}
              >
                {countdown}
              </text>
            </svg>
          </div>
        </div>
      ) : (
        <div className="w-[280px] h-[280px] bg-slate-100 rounded-xl animate-pulse" />
      )}

      <div className="text-center">
        <p className="text-xs text-slate-400">
          Refreshes every {QR_TTL}s · Show this to faculty
        </p>
        <button
          onClick={generateQr}
          className="mt-2 text-xs text-brand-600 hover:text-brand-700 font-medium"
        >
          Refresh now
        </button>
      </div>
    </div>
  )
}
