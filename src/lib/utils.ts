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
function getMonthName(monthNum: number): string | undefined {
  switch (monthNum) {
    case 1: return 'Jan'
    case 2: return 'Feb'
    case 3: return 'Mar'
    case 4: return 'Apr'
    case 5: return 'May'
    case 6: return 'Jun'
    case 7: return 'Jul'
    case 8: return 'Aug'
    case 9: return 'Sep'
    case 10: return 'Oct'
    case 11: return 'Nov'
    case 12: return 'Dec'
    default: return undefined
  }
}

export function formatDate(dateStr: string): string {
  const parts = (dateStr ?? '').split('-')
  if (parts.length !== 3) return dateStr
  const [y, m, d] = parts
  const month = getMonthName(parseInt(m, 10))
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

// Validate QR payload freshness (max 30 seconds old, or valid offline pass)
export function isQrFresh(tsUnix: number, isOffline: boolean = false): boolean {
  if (isOffline || tsUnix === 0) return true
  return Math.floor(Date.now() / 1000) - tsUnix <= 30
}

export const SESSIONS: Array<{ label: string; value: string }> = [
  { label: 'All Sessions', value: '' },
  { label: 'FN1', value: 'FN1' },
  { label: 'FN2', value: 'FN2' },
  { label: 'AN1', value: 'AN1' },
  { label: 'AN2', value: 'AN2' },
]
