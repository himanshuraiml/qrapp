import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Returns today's date as YYYY-MM-DD in IST
export function todayIST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

// Formats a YYYY-MM-DD date string as "15 Jan 2024" — no timezone conversion needed
// (date-only strings have no time component, so we parse manually to avoid UTC/local ambiguity)
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
export function formatDate(dateStr: string): string {
  const parts = (dateStr ?? '').split('-')
  if (parts.length !== 3) return dateStr
  const [y, m, d] = parts
  const month = MONTHS[parseInt(m, 10) - 1]
  return month ? `${d} ${month} ${y}` : dateStr
}

// Formats an ISO timestamp string as IST time, e.g. "02:30 PM"
export function formatTime(isoStr: string): string {
  return new Date(isoStr).toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function studentEmail(studentId: string): string {
  return `${studentId.toLowerCase()}@student.local`
}

export function isFNSession(session: string): boolean {
  return session.startsWith('FN')
}

export function sessionColor(session: string): string {
  return isFNSession(session)
    ? 'bg-blue-100 text-blue-700'
    : 'bg-amber-100 text-amber-700'
}

// Validate QR payload freshness (max 90 seconds old)
export function isQrFresh(tsUnix: number): boolean {
  return Math.floor(Date.now() / 1000) - tsUnix <= 90
}

export const SESSIONS: Array<{ label: string; value: string }> = [
  { label: 'All Sessions', value: '' },
  { label: 'FN1', value: 'FN1' },
  { label: 'FN2', value: 'FN2' },
  { label: 'FN3', value: 'FN3' },
  { label: 'AN1', value: 'AN1' },
  { label: 'AN2', value: 'AN2' },
  { label: 'AN3', value: 'AN3' },
]
