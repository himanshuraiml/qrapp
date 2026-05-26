import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, parseISO } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function todayIST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) // YYYY-MM-DD
}

export function formatDate(dateStr: string): string {
  try { return format(parseISO(dateStr), 'dd MMM yyyy') } catch { return dateStr }
}

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
